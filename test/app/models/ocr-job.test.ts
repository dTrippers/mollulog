import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { claimOcrTask, commitOcrTaskResult, getOcrJob, publishPendingOcrOutbox, submitOcrJob } from "~/models/ocr-job";

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
    } as unknown as R2Bucket,
    OCR_R2_ACCOUNT_ID: "account",
    OCR_R2_ACCESS_KEY_ID: "access",
    OCR_R2_SECRET_ACCESS_KEY: "secret",
    OCR_R2_BUCKET_NAME: "bucket",
    ...overrides,
  } as Env;
}

describe("PostgreSQL OCR control plane", () => {
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

  it("verifies R2 HEAD and creates one image outbox event transactionally", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes("FROM ocr_jobs")) return [jobRow];
      if (sql.includes("FROM ocr_images")) return [imageRow];
      return [];
    });
    const env = createEnv();

    await submitOcrJob(env, 7, "job-1", { createClient: () => client });

    expect(env.OCR_UPLOADS.head).toHaveBeenCalledWith(imageRow.objectKey);
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
});
