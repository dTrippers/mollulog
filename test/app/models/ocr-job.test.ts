import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  claimOcrTask,
  commitOcrTaskResult,
  createOcrJob,
  getOcrImageDownloadUrl,
  getOcrJob,
  getOcrUploadQuota,
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
  purgeAfter: new Date("2026-07-24T00:00:00Z"),
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

function jobDatabaseRow(overrides: Partial<typeof jobRow> = {}): unknown[] {
  const row = { ...jobRow, ...overrides };
  return [
    1,
    row.uid,
    row.userId,
    row.status,
    row.generation,
    row.totalImages,
    row.completedImages,
    row.failedImages,
    row.createdAt,
    row.updatedAt,
    null,
    null,
    row.expiresAt,
    row.purgeAfter,
    null,
    null,
  ];
}

function imageDatabaseRow(overrides: Partial<typeof imageRow> = {}): unknown[] {
  const row = { ...imageRow, ...overrides };
  return [
    1,
    row.uid,
    row.jobUid,
    row.objectKey,
    row.originalFilename,
    row.contentType,
    row.byteSize,
    row.inputSha256,
    row.status,
    row.generation,
    null,
    row.lastErrorCode,
    row.lastErrorMessage,
    new Date("2026-07-20T00:00:00Z"),
    new Date("2026-07-20T00:00:00Z"),
    null,
  ];
}

type QueryConfig = { text: string; rowMode?: string };

function queryText(query: string | QueryConfig): string {
  return typeof query === "string" ? query : query.text;
}

function createClient(rowsFor: (sql: string, values?: unknown[]) => unknown[]) {
  const query = jest.fn(async (queryConfig: string | QueryConfig, values?: unknown[]) => ({
    rows: rowsFor(queryText(queryConfig), values),
    rowCount: 1,
  }));
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
  it("exposes newly created jobs for seven days and purges them after a three-day grace period", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const { client, query } = createClient(() => []);

    await createOcrJob(
      createEnv(),
      7,
      {
        images: [{ filename: "inventory.png", contentType: "image/png", byteSize: 12, sha256: "a".repeat(64) }],
        trainingConsent: true,
      },
      { createClient: () => client },
    );

    const insertJob = query.mock.calls.find(([queryConfig]) =>
      queryText(queryConfig).includes('insert into "ocr_jobs"'),
    );
    expect((insertJob?.[1] as unknown[])[5]).toBe("2026-07-28T00:00:00.000Z");
    expect((insertJob?.[1] as unknown[])[6]).toBe("2026-07-31T00:00:00.000Z");
    expect((insertJob?.[1] as unknown[])[7]).toBe("2026-07-21T00:00:00.000Z");
    expect((insertJob?.[1] as unknown[])[8]).toBe("2026-07-23-v1");
    expect(
      query.mock.calls
        .filter(([queryConfig]) => !["begin isolation level serializable", "commit"].includes(queryText(queryConfig)))
        .every(([queryConfig]) => typeof queryConfig === "object"),
    ).toBe(true);
    jest.useRealTimers();
  });

  it("returns only the owned job with progress and immutable result", async () => {
    const { client } = createClient((sql) => {
      if (sql.includes('from "ocr_jobs"')) return [jobDatabaseRow()];
      if (sql.includes('from "ocr_images"')) return [imageDatabaseRow()];
      if (sql.includes('from "ocr_job_results"')) {
        return [[{ items: [] }, "m1", "c1", "1"]];
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
      sql.includes('from "ocr_jobs"') ? [jobDatabaseRow({ status: "review_ready" })] : [],
    );

    await expect(listRecentOcrJobs(createEnv(), 7, { createClient: () => client })).resolves.toEqual([
      expect.objectContaining({
        uid: "job-1",
        status: "review_ready",
        progress: { completed: 0, failed: 0, total: 1 },
      }),
    ]);
    expect(queryText(query.mock.calls[0][0])).toContain('"ocr_jobs"."status" <> $2');
    expect(queryText(query.mock.calls[0][0])).toContain('"ocr_jobs"."expires_at" > $3');
    expect(query.mock.calls[0][1]?.slice(0, 2)).toEqual([7, "uploading"]);
  });

  it("reports the rolling seven-day image quota", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const { client, query } = createClient((sql) =>
      sql.includes('select "total_images", "submitted_at"') ? [[23, new Date("2026-07-18T00:00:00Z")]] : [],
    );

    await expect(getOcrUploadQuota(createEnv(), 7, { createClient: () => client })).resolves.toEqual({
      limit: 30,
      used: 23,
      remaining: 7,
      nextAvailableAt: "2026-07-25T00:00:00.000Z",
    });
    expect(query.mock.calls[0][1]).toEqual([7, "2026-07-14T00:00:00.000Z"]);
    jest.useRealTimers();
  });

  it("rejects a job that would exceed the rolling image quota before issuing upload URLs", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const { client, query } = createClient((sql) =>
      sql.includes('select "total_images", "submitted_at"') ? [[29, new Date("2026-07-18T00:00:00Z")]] : [],
    );

    await expect(
      createOcrJob(
        createEnv(),
        7,
        {
          images: [
            { filename: "one.png", contentType: "image/png", byteSize: 12, sha256: "a".repeat(64) },
            { filename: "two.png", contentType: "image/png", byteSize: 12, sha256: "b".repeat(64) },
          ],
          trainingConsent: false,
        },
        { createClient: () => client },
      ),
    ).rejects.toMatchObject({ quota: expect.objectContaining({ remaining: 1 }) });
    expect(query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('insert into "ocr_jobs"'))).toBe(
      false,
    );
    jest.useRealTimers();
  });

  it("retries a serializable quota reservation without using a session advisory lock", async () => {
    let shouldFail = true;
    const { client, query } = createClient((sql) => {
      if (shouldFail && sql.includes('insert into "ocr_jobs"')) {
        shouldFail = false;
        throw Object.assign(new Error("serialization failure"), { code: "40001" });
      }
      return [];
    });

    await expect(
      createOcrJob(
        createEnv(),
        7,
        {
          images: [{ filename: "inventory.png", contentType: "image/png", byteSize: 12, sha256: "a".repeat(64) }],
          trainingConsent: false,
        },
        { createClient: () => client },
      ),
    ).resolves.toMatchObject({ quota: { used: 1, remaining: 29 } });

    const sql = query.mock.calls.map(([queryConfig]) => queryText(queryConfig)).join("\n");
    expect(
      query.mock.calls.filter(([queryConfig]) => queryText(queryConfig) === "begin isolation level serializable"),
    ).toHaveLength(2);
    expect(sql).toContain("rollback");
    expect(sql).not.toContain("pg_advisory");
  });

  it("creates an owned, short-lived image preview URL", async () => {
    const { client, query } = createClient((sql) =>
      sql.includes('inner join "ocr_jobs"') ? [[imageRow.objectKey]] : [],
    );

    await expect(
      getOcrImageDownloadUrl(createEnv(), 7, "job-1", "image-1", { createClient: () => client }),
    ).resolves.toContain("X-Amz-Expires=300");
    expect(queryText(query.mock.calls[0][0])).toContain('"ocr_jobs"."purge_after" > $4');
  });

  it("verifies the uploaded object through a signed R2 HEAD request and creates one image outbox event", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('from "ocr_jobs"')) return [jobDatabaseRow()];
      if (sql.includes('from "ocr_images"')) return [imageDatabaseRow()];
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
    const sql = query.mock.calls.map(([queryConfig]) => queryText(queryConfig)).join("\n");
    expect(sql).toContain("begin");
    expect(sql).toContain('insert into "ocr_outbox"');
    expect(sql).toContain("on conflict");
    expect(sql).toContain("commit");
    const submitUpdate = query.mock.calls.find(([queryConfig]) =>
      queryText(queryConfig).includes('update "ocr_jobs" set "status" = $1, "updated_at" = $2, "submitted_at" = $3'),
    );
    const submitValues = submitUpdate?.[1] as unknown[];
    expect(new Date(submitValues[3] as string).getTime() - new Date(submitValues[2] as string).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(new Date(submitValues[4] as string).getTime() - new Date(submitValues[3] as string).getTime()).toBe(
      3 * 24 * 60 * 60 * 1000,
    );
  });

  it("claims an image with a single-object signed URL and a distinct attempt", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('inner join "ocr_jobs"')) return [[...imageDatabaseRow(), "processing"]];
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
    expect(
      query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('insert into "ocr_attempts"')),
    ).toBe(true);
  });

  it("stores the result, updates counts, and enqueues finalize before accepting", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('select "uid" from "ocr_attempts"')) return [["attempt-1"]];
      if (sql.includes('from "ocr_images"') && sql.includes('"ocr_images"."uid" = $1')) {
        return [imageDatabaseRow()];
      }
      if (sql.includes('from "ocr_image_results"')) return [];
      if (sql.includes('select "status" from "ocr_images"')) return [["succeeded"]];
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

    const sql = query.mock.calls.map(([queryConfig]) => queryText(queryConfig)).join("\n");
    expect(sql).toContain('insert into "ocr_image_results"');
    expect(sql).toContain('update "ocr_jobs" set "completed_images" = $1, "failed_images" = $2, "updated_at" = $3');
    expect(query.mock.calls.some(([, values]) => values?.includes("ocr.job.finalize.v1"))).toBe(true);
  });

  it("publishes a claimed outbox row and only then marks it published", async () => {
    const task = { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 } as const;
    const { client, query } = createClient((sql) => {
      if (sql.includes('select "id" from "ocr_outbox"')) return [[1]];
      if (sql.includes('returning "uid", "payload", "attempts"')) return [["outbox-1", task, 0]];
      return [];
    });
    const send = jest.fn(async (_body: unknown, _options?: unknown) => undefined);

    await expect(
      publishPendingOcrOutbox(createEnv({ OCR_TASKS: { send } as unknown as Queue }), 25, {
        createClient: () => client,
      }),
    ).resolves.toBe(1);

    expect(send).toHaveBeenCalledWith(task, { contentType: "json" });
    const publishUpdate = query.mock.calls.find(
      ([queryConfig, values]) =>
        queryText(queryConfig).startsWith('update "ocr_outbox" set') && values?.includes("published"),
    );
    expect(publishUpdate).toBeDefined();
  });

  it("uses the Queue REST API when local E2E credentials are configured", async () => {
    const task = { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 } as const;
    const { client } = createClient((sql) => {
      if (sql.includes('select "id" from "ocr_outbox"')) return [[1]];
      if (sql.includes('returning "uid", "payload", "attempts"')) return [["outbox-1", task, 0]];
      return [];
    });
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
    const { client, query } = createClient((sql) => {
      if (sql.includes('select "uid" from "ocr_jobs"') && sql.includes('"purge_after" <')) return [["job-1"]];
      if (sql.includes('select "uid", "object_key" from "ocr_images"')) {
        return [["image-1", imageRow.objectKey]];
      }
      return [];
    });
    const removeObjects = jest.fn(async (_keys: string | string[]) => undefined);

    await reconcileOcrJobs(createEnv({ OCR_UPLOADS: { delete: removeObjects } as unknown as R2Bucket }), {
      createClient: () => client,
    });

    expect(removeObjects).toHaveBeenCalledWith([imageRow.objectKey]);
    const sql = query.mock.calls.map(([queryConfig]) => queryText(queryConfig)).join("\n");
    expect(sql).toContain('delete from "ocr_jobs"');
    expect(sql).toContain('delete from "ocr_attempts"');
    expect(sql).toContain('"ocr_jobs"."purge_after" <');
  });
});
