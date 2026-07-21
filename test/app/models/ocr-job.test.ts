import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  claimOcrTask,
  commitOcrTaskResult,
  createOcrJob,
  getOcrImageDownloadUrl,
  getOcrJob,
  listRecentOcrJobs,
  publishPendingOcrOutbox,
  reconcileOcrJobs,
  submitOcrJob,
} from "~/models/ocr-job";

const jobRow = {
  uid: "job-1",
  userId: 7,
  status: "uploading",
  generation: 1,
  totalImages: 1,
  completedImages: 0,
  failedImages: 0,
  createdAt: new Date("2026-07-20T00:00:00Z"),
  updatedAt: new Date("2026-07-20T00:00:00Z"),
  expiresAt: new Date("2026-07-21T00:00:00Z"),
};

const imageRow = {
  uid: "image-1",
  jobUid: "job-1",
  objectKey: "ocr/local/job-1/image-1",
  originalFilename: "inventory.png",
  contentType: "image/png",
  byteSize: 12,
  inputSha256: "a".repeat(64),
  status: "queued",
  generation: 1,
  lastErrorCode: null,
  lastErrorMessage: null,
};

function createClient(rowsFor: (sql: string, values?: unknown[]) => unknown[]) {
  const query = jest.fn(async (sql: string, values?: unknown[]) => ({ rows: rowsFor(sql, values), rowCount: 1 }));
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, query };
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive,
    OCR_UPLOADS: {
      head: jest.fn(async () => ({ size: 12, httpMetadata: { contentType: "image/png" } })),
      delete: jest.fn(async () => undefined),
    } as unknown as R2Bucket,
    OCR_R2_ACCOUNT_ID: "account",
    OCR_R2_ACCESS_KEY_ID: "access",
    OCR_R2_SECRET_ACCESS_KEY: "secret",
    OCR_R2_BUCKET_NAME: "bucket",
    ...overrides,
  } as Env;
}

describe("PostgreSQL OCR control plane", () => {
  it("keeps newly created jobs for seven days", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const { client, query } = createClient(() => []);

    await createOcrJob(
      createEnv(),
      7,
      [{ filename: "inventory.png", contentType: "image/png", byteSize: 12, sha256: "a".repeat(64) }],
      { createClient: () => client },
    );

    const insertJob = query.mock.calls.find(([sql]) => (sql as string).includes("INSERT INTO ocr_jobs"));
    expect((insertJob?.[1] as unknown[])[3]).toEqual(new Date("2026-07-28T00:00:00Z"));
    jest.useRealTimers();
  });

  it("returns only the owned job with progress and immutable result", async () => {
    const { client } = createClient((sql) => {
      if (sql.includes("FROM ocr_jobs")) return [jobRow];
      if (sql.includes("FROM ocr_images")) return [imageRow];
      if (sql.includes("FROM ocr_job_results")) {
        return [{ resultJson: { items: [] }, modelVersion: "m1", catalogVersion: "c1", schemaVersion: "1" }];
      }
      return [];
    });

    await expect(getOcrJob(createEnv(), 7, "job-1", { createClient: () => client })).resolves.toEqual(
      expect.objectContaining({
        uid: "job-1",
        progress: { completed: 0, failed: 0, total: 1 },
        result: { items: [] },
      }),
    );
  });

  it("lists only unexpired submitted jobs for the signed-in user", async () => {
    const { client, query } = createClient((sql) =>
      sql.includes("FROM ocr_jobs") ? [{ ...jobRow, status: "review_ready" }] : [],
    );

    await expect(listRecentOcrJobs(createEnv(), 7, { createClient: () => client })).resolves.toEqual([
      expect.objectContaining({
        uid: "job-1",
        status: "review_ready",
        progress: { completed: 0, failed: 0, total: 1 },
      }),
    ]);
    expect(query.mock.calls[0][0]).toContain("status <> 'uploading' AND expires_at > now()");
    expect(query.mock.calls[0][1]).toEqual([7]);
  });

  it("creates an owned, short-lived image preview URL", async () => {
    const { client } = createClient((sql) =>
      sql.includes("JOIN ocr_jobs") ? [{ objectKey: imageRow.objectKey }] : [],
    );

    await expect(
      getOcrImageDownloadUrl(createEnv(), 7, "job-1", "image-1", { createClient: () => client }),
    ).resolves.toContain("X-Amz-Expires=300");
  });

  it("verifies the uploaded object through a signed R2 HEAD request and creates one image outbox event", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes("FROM ocr_jobs")) return [jobRow];
      if (sql.includes("FROM ocr_images")) return [imageRow];
      return [];
    });
    const env = createEnv();
    const fetchObject = jest.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "12", "content-type": "image/png" },
        }),
    );

    await submitOcrJob(env, 7, "job-1", {
      createClient: () => client,
      fetch: fetchObject as unknown as typeof fetch,
    });

    expect(fetchObject).toHaveBeenCalledWith(expect.stringContaining("X-Amz-Signature"), { method: "HEAD" });
    const sql = query.mock.calls.map(([text]) => text as string).join("\n");
    expect(sql).toContain("BEGIN");
    expect(sql).toContain("INSERT INTO ocr_outbox");
    expect(sql).toContain("ON CONFLICT (event_type, aggregate_uid, generation) DO NOTHING");
    expect(sql).toContain("COMMIT");
  });

  it("claims an image with a single-object signed URL and a distinct attempt", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes("JOIN ocr_jobs")) return [{ ...imageRow, jobStatus: "processing" }];
      return [];
    });
    const claim = await claimOcrTask(
      createEnv(),
      { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 },
      "worker-1",
      2,
      { createClient: () => client },
    );

    expect(claim).toEqual(
      expect.objectContaining({
        disposition: "ready",
        input: expect.objectContaining({
          sha256: imageRow.inputSha256,
          downloadUrl: expect.stringContaining("X-Amz-Signature"),
        }),
      }),
    );
    expect(query.mock.calls.some(([sql]) => (sql as string).includes("INSERT INTO ocr_attempts"))).toBe(true);
  });

  it("stores the result, updates counts, and enqueues finalize before accepting", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes("FROM ocr_attempts")) return [{ uid: "attempt-1" }];
      if (sql.includes("FROM ocr_images i WHERE i.uid")) return [imageRow];
      if (sql.includes("FROM ocr_image_results")) return [];
      if (sql.includes(" AS active")) return [{ active: 0, succeeded: 1 }];
      return [];
    });

    await expect(
      commitOcrTaskResult(
        createEnv(),
        { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 },
        {
          attemptUid: "attempt-1",
          status: "succeeded",
          inputSha256: imageRow.inputSha256,
          modelVersion: "model-1",
          catalogVersion: "catalog-1",
          schemaVersion: "1",
          result: { observations: [] },
        },
        { createClient: () => client },
      ),
    ).resolves.toEqual({ accepted: true, duplicate: false });

    const sql = query.mock.calls.map(([text]) => text as string).join("\n");
    expect(sql).toContain("INSERT INTO ocr_image_results");
    expect(sql).toContain("completed_images = counts.completed");
    expect(
      query.mock.calls.some(([, values]) => (values as unknown[] | undefined)?.includes("ocr.job.finalize.v1")),
    ).toBe(true);
  });

  it("publishes a claimed outbox row and only then marks it published", async () => {
    const task = { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 } as const;
    const { client, query } = createClient((sql) =>
      sql.includes("RETURNING o.uid, o.payload") ? [{ uid: "outbox-1", payload: task }] : [],
    );
    const send = jest.fn(async (_body: unknown, _options?: unknown) => undefined);

    await expect(
      publishPendingOcrOutbox(createEnv({ OCR_TASKS: { send } as unknown as Queue }), 25, {
        createClient: () => client,
      }),
    ).resolves.toBe(1);

    expect(send).toHaveBeenCalledWith(task, { contentType: "json" });
    const publishUpdate = query.mock.calls.find(([sql]) => (sql as string).includes("status = 'published'"));
    expect(publishUpdate).toBeDefined();
  });

  it("uses the Queue REST API when local E2E credentials are configured", async () => {
    const task = { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 } as const;
    const { client } = createClient((sql) =>
      sql.includes("RETURNING o.uid, o.payload") ? [{ uid: "outbox-1", payload: task }] : [],
    );
    const send = jest.fn(async (_body: unknown, _options?: unknown) => undefined);
    const fetchQueue = jest.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
      Response.json({ success: true }),
    );

    await expect(
      publishPendingOcrOutbox(
        createEnv({
          OCR_TASKS: { send } as unknown as Queue,
          OCR_QUEUE_API_URL: "https://api.cloudflare.com/client/v4/accounts/account/queues/queue",
          OCR_QUEUE_API_TOKEN: "queue-token",
        }),
        25,
        { createClient: () => client, fetch: fetchQueue as unknown as typeof fetch },
      ),
    ).resolves.toBe(1);

    expect(send).not.toHaveBeenCalled();
    expect(fetchQueue).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account/queues/queue/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: task, content_type: "json" }),
      }),
    );
  });

  it("deletes expired source images and their control-plane records", async () => {
    const { client, query } = createClient((sql) =>
      sql.includes("WITH expired_jobs")
        ? [{ jobUid: "job-1", imageUid: "image-1", objectKey: imageRow.objectKey }]
        : [],
    );
    const removeObjects = jest.fn(async (_keys: string | string[]) => undefined);

    await reconcileOcrJobs(createEnv({ OCR_UPLOADS: { delete: removeObjects } as unknown as R2Bucket }), {
      createClient: () => client,
    });

    expect(removeObjects).toHaveBeenCalledWith([imageRow.objectKey]);
    const sql = query.mock.calls.map(([text]) => text as string).join("\n");
    expect(sql).toContain("DELETE FROM ocr_jobs");
    expect(sql).toContain("DELETE FROM ocr_attempts");
  });
});
