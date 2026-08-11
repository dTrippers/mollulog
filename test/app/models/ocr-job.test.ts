import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { OcrTaskResultRejectedError } from "~/domain/ocr";
import {
  cancelOcrJob,
  claimOcrTask,
  commitOcrTaskResult,
  createOcrJob,
  getOcrImageDownloadUrl,
  getOcrJob,
  getOcrUploadQuota,
  getOwnedOcrArtifactObjectKey,
  listRecentOcrJobs,
  prepareOcrResultArtifacts,
  publishPendingOcrOutbox,
  reconcileOcrJobs,
  submitOcrJob,
} from "~/models/ocr-job";
import studentVideoResult from "../../fixtures/student-detail-video-result.v1.json";

const jobRow = {
  uid: "job-1",
  userId: 7,
  jobKind: "item_inventory_images_v1",
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

const videoRow = {
  uid: "video-1",
  jobUid: "job-1",
  objectKey: "ocr/local/job-1/video-1",
  originalFilename: "students.mp4",
  contentType: "video/mp4",
  byteSize: 1024,
  inputSha256: "b".repeat(64),
  status: "processing",
  generation: 1,
  lastErrorCode: null as string | null,
  lastErrorMessage: null as string | null,
  rawInputPurgeAfter: new Date("2026-07-21T01:00:00Z"),
};

const artifactRow = {
  uid: "artifact-1",
  jobUid: "job-1",
  attemptUid: "attempt-video",
  taskUid: "job-1",
  generation: 1,
  studentUid: studentVideoResult.students[0].studentUid,
  sourceFrame: studentVideoResult.students[0].sourceFrames[0],
  timestampMs: Math.round(studentVideoResult.students[0].sourceTimestampsSeconds[0] * 1000),
  objectKey: "ocr/local/job-1/artifacts/1/artifact-1.webp",
  contentType: "image/webp",
  byteSize: 4096,
  sha256: "c".repeat(64),
  width: 1040,
  height: 480,
  status: "pending",
  purgeAfter: new Date("2026-07-24T00:00:00Z"),
  deletedAt: null,
};

function jobDatabaseRow(overrides: Partial<typeof jobRow> = {}): unknown[] {
  const row = { ...jobRow, ...overrides };
  return [
    1,
    row.uid,
    row.userId,
    row.jobKind,
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

function videoDatabaseRow(overrides: Partial<typeof videoRow> = {}): unknown[] {
  const row = { ...videoRow, ...overrides };
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
    null,
    null,
    null,
    null,
    null,
    row.lastErrorCode,
    row.lastErrorMessage,
    row.rawInputPurgeAfter,
    null,
    new Date("2026-07-20T00:00:00Z"),
    new Date("2026-07-20T00:00:00Z"),
    null,
  ];
}

function artifactDatabaseRow(overrides: Partial<typeof artifactRow> = {}): unknown[] {
  const row = { ...artifactRow, ...overrides };
  return [
    1,
    row.uid,
    row.jobUid,
    row.attemptUid,
    row.taskUid,
    row.generation,
    row.studentUid,
    row.sourceFrame,
    row.timestampMs,
    row.objectKey,
    row.contentType,
    row.byteSize,
    row.sha256,
    row.width,
    row.height,
    row.status,
    row.purgeAfter,
    row.deletedAt,
    new Date("2026-07-20T00:00:00Z"),
    new Date("2026-07-20T00:00:00Z"),
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
      head: jest.fn(async () => ({
        size: artifactRow.byteSize,
        httpMetadata: { contentType: "image/webp" },
        checksums: { sha256: new Uint8Array(32).fill(0xcc).buffer },
      })),
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
  it("cancels a review-ready job without changing its purge schedule", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T12:00:00Z"));
    const { client, query } = createClient((sql) =>
      sql.includes('from "ocr_jobs"') ? [jobDatabaseRow({ status: "review_ready", generation: 3 })] : [],
    );

    await expect(cancelOcrJob(createEnv(), 7, "job-1", { createClient: () => client })).resolves.toEqual({
      uid: "job-1",
      status: "cancelled",
    });

    const updateJob = query.mock.calls.find(([queryConfig]) =>
      queryText(queryConfig).includes('update "ocr_jobs" set'),
    );
    expect(updateJob).toBeDefined();
    expect(queryText(updateJob?.[0] as QueryConfig)).toContain('"status" = $1');
    expect(queryText(updateJob?.[0] as QueryConfig)).toContain('"generation" = $2');
    expect(queryText(updateJob?.[0] as QueryConfig)).toContain('"expires_at" =');
    expect(queryText(updateJob?.[0] as QueryConfig)).not.toContain('"purge_after" =');
    expect(updateJob?.[1]).toEqual(expect.arrayContaining(["cancelled", 4, "2026-07-21T12:00:00.000Z"]));
    jest.useRealTimers();
  });

  it("treats cancelling an already-cancelled job as an idempotent success", async () => {
    const { client, query } = createClient((sql) =>
      sql.includes('from "ocr_jobs"') ? [jobDatabaseRow({ status: "cancelled" })] : [],
    );

    await expect(cancelOcrJob(createEnv(), 7, "job-1", { createClient: () => client })).resolves.toEqual({
      uid: "job-1",
      status: "cancelled",
    });
    expect(query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('update "ocr_jobs" set'))).toBe(
      false,
    );
  });

  it("rejects cancelling a job that is not ready for review", async () => {
    const { client, query } = createClient((sql) =>
      sql.includes('from "ocr_jobs"') ? [jobDatabaseRow({ status: "processing" })] : [],
    );

    await expect(cancelOcrJob(createEnv(), 7, "job-1", { createClient: () => client })).rejects.toMatchObject({
      message: "검토할 수 있는 인식 결과만 취소할 수 있어요",
      status: 409,
    });
    expect(query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('update "ocr_jobs" set'))).toBe(
      false,
    );
  });

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
    expect((insertJob?.[1] as unknown[])[6]).toBe("2026-07-28T00:00:00.000Z");
    expect((insertJob?.[1] as unknown[])[7]).toBe("2026-07-31T00:00:00.000Z");
    expect((insertJob?.[1] as unknown[])[8]).toBe("2026-07-21T00:00:00.000Z");
    expect((insertJob?.[1] as unknown[])[9]).toBe("2026-07-23-v1");
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

  it("does not expose worker error details in a student video job response", async () => {
    const { client } = createClient((sql) => {
      if (sql.includes('from "ocr_jobs"')) {
        return [jobDatabaseRow({ jobKind: "student_detail_video_v1", status: "failed" })];
      }
      if (sql.includes('from "ocr_video_inputs"')) {
        return [
          videoDatabaseRow({
            status: "failed",
            lastErrorCode: "ffprobe_missing",
            lastErrorMessage: "ffprobe binary was not found at /private/internal/path",
          }),
        ];
      }
      return [];
    });

    const job = await getOcrJob(createEnv(), 7, "job-1", { createClient: () => client });

    expect(job?.video?.error).toEqual({
      code: "recognition_failed",
      message: "영상을 인식하지 못했어요",
    });
    expect(JSON.stringify(job)).not.toContain("ffprobe");
    expect(JSON.stringify(job)).not.toContain("/private/internal/path");
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
      limit: 50,
      used: 23,
      remaining: 27,
      nextAvailableAt: "2026-07-25T00:00:00.000Z",
    });
    expect(query.mock.calls[0][1]).toEqual([7, "item_inventory_images_v1", "2026-07-14T00:00:00.000Z"]);
    jest.useRealTimers();
  });

  it("reports the rolling seven-day video quota separately", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const createdAt = new Date("2026-07-18T00:00:00Z");
    const { client } = createClient((sql, values) =>
      sql.includes('select "created_at"') && values?.includes("student_detail_video_v1")
        ? Array.from({ length: 4 }, () => [createdAt])
        : [],
    );

    await expect(
      getOcrUploadQuota(createEnv(), 7, {
        createClient: () => client,
        jobKind: "student_detail_video_v1",
      }),
    ).resolves.toEqual({
      limit: 10,
      used: 4,
      remaining: 6,
      nextAvailableAt: "2026-07-25T00:00:00.000Z",
    });
    jest.useRealTimers();
  });

  it("rejects a job that would exceed the rolling image quota before issuing upload URLs", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const { client, query } = createClient((sql) =>
      sql.includes('select "total_images", "submitted_at"') ? [[49, new Date("2026-07-18T00:00:00Z")]] : [],
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
          trainingConsent: true,
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
    ).resolves.toMatchObject({ quota: { used: 1, remaining: 49 } });

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

  it("creates one direct-upload input for a student video job", async () => {
    const { client, query } = createClient(() => []);

    await expect(
      createOcrJob(
        createEnv(),
        7,
        {
          jobKind: "student_detail_video_v1",
          video: {
            filename: "students.mp4",
            contentType: "video/mp4",
            byteSize: 1024,
            sha256: "b".repeat(64),
          },
          trainingConsent: true,
        },
        { createClient: () => client },
      ),
    ).resolves.toMatchObject({
      jobKind: "student_detail_video_v1",
      video: {
        filename: "students.mp4",
        uploadUrl: expect.stringContaining("X-Amz-Signature"),
      },
    });

    const sql = query.mock.calls.map(([queryConfig]) => queryText(queryConfig)).join("\n");
    expect(sql).toContain('insert into "ocr_jobs"');
    expect(sql).toContain('insert into "ocr_video_inputs"');
    expect(query.mock.calls.some(([, values]) => values?.includes("student_detail_video_v1"))).toBe(true);
    expect(query.mock.calls.some(([, values]) => values?.includes("2026-07-23-v1"))).toBe(true);
  });

  it("rejects an eleventh student video within the rolling seven-day window", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const createdAt = new Date("2026-07-18T00:00:00Z");
    const { client, query } = createClient((sql, values) =>
      sql.includes('select "created_at"') && values?.includes("student_detail_video_v1")
        ? Array.from({ length: 10 }, () => [createdAt])
        : [],
    );

    await expect(
      createOcrJob(
        createEnv(),
        7,
        {
          jobKind: "student_detail_video_v1",
          video: {
            filename: "students.mp4",
            contentType: "video/mp4",
            byteSize: 1024,
            sha256: "b".repeat(64),
          },
          trainingConsent: false,
        },
        { createClient: () => client },
      ),
    ).rejects.toMatchObject({
      message: "최근 7일 동안 업로드할 수 있는 영상을 모두 사용했어요",
      quota: { limit: 10, used: 10, remaining: 0, nextAvailableAt: "2026-07-25T00:00:00.000Z" },
    });
    expect(query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('insert into "ocr_jobs"'))).toBe(
      false,
    );
    jest.useRealTimers();
  });

  it("verifies and queues one whole-video recognition task", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const { client, query } = createClient((sql) => {
      if (sql.includes('from "ocr_jobs"')) {
        return [jobDatabaseRow({ jobKind: "student_detail_video_v1", status: "uploading" })];
      }
      if (sql.includes('from "ocr_video_inputs"')) {
        return [videoDatabaseRow({ status: "pending_upload" })];
      }
      return [];
    });
    const fetchObject = jest.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "1024", "content-type": "video/mp4" },
        }),
    );

    await submitOcrJob(createEnv(), 7, "job-1", {
      createClient: () => client,
      fetch: fetchObject as unknown as typeof fetch,
    });

    expect(fetchObject).toHaveBeenCalledWith(expect.stringContaining("X-Amz-Signature"), { method: "HEAD" });
    expect(
      query.mock.calls.some(
        ([queryConfig, values]) =>
          queryText(queryConfig).includes('insert into "ocr_outbox"') &&
          values?.includes("ocr.student_detail_video.recognize.v1"),
      ),
    ).toBe(true);
    const videoUpdate = query.mock.calls.find(([queryConfig]) =>
      queryText(queryConfig).includes('update "ocr_video_inputs" set "status" = $1'),
    );
    expect(videoUpdate?.[1]).toContain("2026-07-31T00:00:00.000Z");
    jest.useRealTimers();
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

  it("verifies multiple uploaded objects concurrently", async () => {
    const secondImage = {
      ...imageRow,
      uid: "image-2",
      objectKey: "ocr/local/job-1/image-2",
      originalFilename: "inventory-2.png",
    };
    const { client } = createClient((sql) => {
      if (sql.includes('from "ocr_jobs"')) return [jobDatabaseRow({ totalImages: 2 })];
      if (sql.includes('from "ocr_images"')) return [imageDatabaseRow(), imageDatabaseRow(secondImage)];
      return [];
    });
    let releaseRequests: () => void = () => undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchObject = jest.fn(async () => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await requestGate;
      activeRequests -= 1;
      return new Response(null, {
        status: 200,
        headers: { "content-length": "12", "content-type": "image/png" },
      });
    });

    const submission = submitOcrJob(createEnv(), 7, "job-1", {
      createClient: () => client,
      fetch: fetchObject as unknown as typeof fetch,
    });
    for (let attempt = 0; attempt < 100 && fetchObject.mock.calls.length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const requestsStartedTogether = fetchObject.mock.calls.length === 2;
    releaseRequests();
    await submission;

    expect(requestsStartedTogether).toBe(true);
    expect(maxActiveRequests).toBe(2);
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

  it("claims a student video as one contract-v2 task with integrity metadata", async () => {
    const { client } = createClient((sql) => {
      if (sql.includes('from "ocr_video_inputs"') && sql.includes('inner join "ocr_jobs"')) {
        return [[...videoDatabaseRow({ status: "queued" }), "queued"]];
      }
      return [];
    });

    await expect(
      claimOcrTask(
        createEnv(),
        { type: "ocr.student_detail_video.recognize.v1", taskUid: "job-1", generation: 1 },
        "video-worker",
        1,
        { createClient: () => client },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        disposition: "ready",
        contractVersion: "2",
        input: expect.objectContaining({
          inputUid: "video-1",
          filename: "students.mp4",
          contentType: "video/mp4",
          byteSize: 1024,
          sha256: "b".repeat(64),
          downloadUrl: expect.stringContaining("X-Amz-Signature"),
          validation: expect.objectContaining({
            allowedContainers: ["mp4", "mov"],
          }),
        }),
      }),
    );
  });

  it("prepares one checksum-bound private artifact per student for the exact processing attempt", async () => {
    let artifactSelectCount = 0;
    const { client, query } = createClient((sql) => {
      if (sql.includes('from "ocr_attempts"')) {
        return [
          [
            1,
            "attempt-video",
            "ocr.student_detail_video.recognize.v1",
            "job-1",
            1,
            "worker-1",
            "processing",
            1,
            null,
            null,
            new Date("2026-07-20T00:00:00Z"),
            null,
          ],
        ];
      }
      if (sql.includes('select "generation", "purge_after" from "ocr_jobs"')) {
        return [[1, jobRow.purgeAfter]];
      }
      if (sql.includes('from "ocr_result_artifacts"')) {
        artifactSelectCount += 1;
        return artifactSelectCount === 1 ? [] : [artifactDatabaseRow()];
      }
      return [];
    });

    const prepared = await prepareOcrResultArtifacts(
      createEnv(),
      { type: "ocr.student_detail_video.recognize.v1", taskUid: "job-1", generation: 1 },
      {
        attemptUid: "attempt-video",
        artifacts: [
          {
            studentUid: artifactRow.studentUid,
            sourceFrame: artifactRow.sourceFrame,
            timestampSeconds: artifactRow.timestampMs / 1000,
            contentType: "image/webp",
            byteSize: artifactRow.byteSize,
            sha256: artifactRow.sha256,
            width: artifactRow.width,
            height: artifactRow.height,
          },
        ],
      },
      { createClient: () => client },
    );

    expect(prepared.artifacts[0]).toEqual(
      expect.objectContaining({
        artifactUid: "artifact-1",
        studentUid: artifactRow.studentUid,
        requiredHeaders: {
          "content-type": "image/webp",
          "x-amz-checksum-sha256": expect.any(String),
        },
      }),
    );
    const signed = new URL(prepared.artifacts[0].uploadUrl);
    expect(signed.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host;x-amz-checksum-sha256");
    expect(
      query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('insert into "ocr_result_artifacts"')),
    ).toBe(true);
  });

  it("prepares a later artifact batch without returning rows from an earlier batch", async () => {
    const secondArtifact = {
      ...artifactRow,
      uid: "artifact-2",
      studentUid: "10001",
      sourceFrame: 456,
      timestampMs: 15_200,
      objectKey: "ocr/local/job-1/artifacts/1/artifact-2.webp",
      sha256: "d".repeat(64),
    };
    const { client, query } = createClient((sql) => {
      if (sql.includes('from "ocr_attempts"')) {
        return [
          [
            1,
            "attempt-video",
            "ocr.student_detail_video.recognize.v1",
            "job-1",
            1,
            "worker-1",
            "processing",
            1,
            null,
            null,
            new Date("2026-07-20T00:00:00Z"),
            null,
          ],
        ];
      }
      if (sql.includes('select "generation", "purge_after" from "ocr_jobs"')) {
        return [[1, jobRow.purgeAfter]];
      }
      if (sql.includes('from "ocr_result_artifacts"')) {
        return sql.includes('"student_uid" in') ? [artifactDatabaseRow(secondArtifact)] : [artifactDatabaseRow()];
      }
      return [];
    });

    await expect(
      prepareOcrResultArtifacts(
        createEnv(),
        { type: "ocr.student_detail_video.recognize.v1", taskUid: "job-1", generation: 1 },
        {
          attemptUid: "attempt-video",
          artifacts: [
            {
              studentUid: secondArtifact.studentUid,
              sourceFrame: secondArtifact.sourceFrame,
              timestampSeconds: secondArtifact.timestampMs / 1000,
              contentType: "image/webp",
              byteSize: secondArtifact.byteSize,
              sha256: secondArtifact.sha256,
              width: secondArtifact.width,
              height: secondArtifact.height,
            },
          ],
        },
        { createClient: () => client },
      ),
    ).resolves.toEqual({
      artifacts: [
        expect.objectContaining({
          artifactUid: secondArtifact.uid,
          studentUid: secondArtifact.studentUid,
        }),
      ],
    });

    const filteredSelect = query.mock.calls.find(
      ([queryConfig]) =>
        queryText(queryConfig).includes('from "ocr_result_artifacts"') &&
        queryText(queryConfig).includes('"student_uid" in'),
    );
    expect(filteredSelect?.[1]).toContain(secondArtifact.studentUid);
  });

  it("resolves an artifact only through job, user, generation, and committed-state ownership", async () => {
    const { client, query } = createClient((sql) =>
      sql.includes('from "ocr_result_artifacts"') ? [[artifactRow.objectKey]] : [],
    );

    await expect(
      getOwnedOcrArtifactObjectKey(createEnv(), 7, "job-1", "artifact-1", {
        createClient: () => client,
      }),
    ).resolves.toBe(artifactRow.objectKey);

    const [queryConfig, values] = query.mock.calls.find(([config]) =>
      queryText(config).includes('from "ocr_result_artifacts"'),
    ) as [QueryConfig, unknown[]];
    expect(queryText(queryConfig)).toContain('"ocr_result_artifacts"."generation" = "ocr_jobs"."generation"');
    expect(values).toEqual(expect.arrayContaining(["artifact-1", "job-1", "committed", 7]));
  });

  it("rejects an artifact that is not owned by the submitted attempt", async () => {
    const { client } = createClient(() => []);

    await expect(
      commitOcrTaskResult(
        createEnv(),
        { type: "ocr.student_detail_video.recognize.v1", taskUid: "job-1", generation: 1 },
        {
          attemptUid: "attempt-video",
          status: "succeeded",
          inputSha256: "b".repeat(64),
          modelVersion: "0.1.0",
          catalogVersion: "catalog-1",
          schemaVersion: "student-detail-video-result.v1",
          result: studentVideoResult,
          artifacts: [{ artifactUid: "artifact-from-another-attempt", studentUid: artifactRow.studentUid }],
        },
        { createClient: () => client },
      ),
    ).rejects.toThrow("현재 OCR 시도의 인식 화면");
  });

  it("commits a validated student video result directly to review-ready", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('update "ocr_result_artifacts"') && sql.includes('returning "uid"')) {
        return [[artifactRow.uid]];
      }
      if (sql.includes('from "ocr_result_artifacts"')) return [artifactDatabaseRow()];
      if (sql.includes('from "ocr_attempts"')) return [["attempt-video"]];
      if (sql.includes('from "ocr_video_inputs"')) return [videoDatabaseRow()];
      if (sql.includes('from "ocr_job_results"')) return [];
      if (sql.includes('select "expires_at" from "ocr_jobs"')) return [[jobRow.expiresAt]];
      return [];
    });

    await expect(
      commitOcrTaskResult(
        createEnv(),
        { type: "ocr.student_detail_video.recognize.v1", taskUid: "job-1", generation: 1 },
        {
          attemptUid: "attempt-video",
          status: "succeeded",
          inputSha256: "b".repeat(64),
          modelVersion: "0.1.0",
          catalogVersion: "catalog-1",
          schemaVersion: "student-detail-video-result.v1",
          result: studentVideoResult,
          artifacts: [
            {
              artifactUid: artifactRow.uid,
              studentUid: artifactRow.studentUid,
            },
          ],
        },
        { createClient: () => client },
      ),
    ).resolves.toEqual({ accepted: true, duplicate: false });

    const sql = query.mock.calls.map(([queryConfig]) => queryText(queryConfig)).join("\n");
    expect(sql).toContain('insert into "ocr_job_results"');
    expect(sql).toContain('update "ocr_result_artifacts" set "status" = $1');
    expect(sql).toContain('"status" = $1');
    expect(
      query.mock.calls.some(
        ([queryConfig, values]) =>
          queryText(queryConfig).includes('update "ocr_jobs"') && (values as unknown[])?.includes("review_ready"),
      ),
    ).toBe(true);
  });

  it("accepts a redelivered student video result as an idempotent duplicate", async () => {
    const { client } = createClient((sql) => {
      if (sql.includes('from "ocr_result_artifacts"')) {
        return [artifactDatabaseRow({ attemptUid: "attempt-video-redelivery", status: "committed" })];
      }
      if (sql.includes('from "ocr_attempts"')) return [["attempt-video-redelivery"]];
      if (sql.includes('from "ocr_video_inputs"')) return [videoDatabaseRow()];
      if (sql.includes('from "ocr_job_results"')) return [["result-1", "attempt-video-redelivery"]];
      return [];
    });

    await expect(
      commitOcrTaskResult(
        createEnv(),
        { type: "ocr.student_detail_video.recognize.v1", taskUid: "job-1", generation: 1 },
        {
          attemptUid: "attempt-video-redelivery",
          status: "succeeded",
          inputSha256: "b".repeat(64),
          modelVersion: "0.1.0",
          catalogVersion: "catalog-1",
          schemaVersion: "student-detail-video-result.v1",
          result: studentVideoResult,
          artifacts: [
            {
              artifactUid: artifactRow.uid,
              studentUid: artifactRow.studentUid,
            },
          ],
        },
        { createClient: () => client },
      ),
    ).resolves.toEqual({ accepted: true, duplicate: true });
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

  it("rejects a result for an unknown attempt with a contract error", async () => {
    const { client } = createClient(() => []);

    await expect(
      commitOcrTaskResult(
        createEnv(),
        { type: "ocr.image.recognize.v1", taskUid: "image-1", generation: 1 },
        {
          attemptUid: "missing-attempt",
          status: "succeeded",
          inputSha256: imageRow.inputSha256,
          modelVersion: "model-1",
          catalogVersion: "catalog-1",
          schemaVersion: "1",
          result: { observations: [] },
        },
        { createClient: () => client },
      ),
    ).rejects.toBeInstanceOf(OcrTaskResultRejectedError);
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

  it("publishes student video tasks to the existing OCR queue", async () => {
    const task = {
      type: "ocr.student_detail_video.recognize.v1",
      taskUid: "job-1",
      generation: 1,
    } as const;
    const { client } = createClient((sql) => {
      if (sql.includes('select "id" from "ocr_outbox"')) return [[1]];
      if (sql.includes('returning "uid", "payload", "attempts"')) return [["outbox-video", task, 0]];
      return [];
    });
    const send = jest.fn(async (_body: unknown, _options?: unknown) => undefined);

    await expect(
      publishPendingOcrOutbox(
        createEnv({
          OCR_TASKS: { send } as unknown as Queue,
        }),
        25,
        { createClient: () => client },
      ),
    ).resolves.toBe(1);

    expect(send).toHaveBeenCalledWith(task, { contentType: "json" });
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
    expect(sql).toContain('delete from "ocr_result_artifacts"');
    expect(sql).toContain('delete from "ocr_video_inputs"');
    expect(sql).toContain('delete from "ocr_jobs"');
    expect(sql).toContain('delete from "ocr_attempts"');
    expect(sql).toContain('"ocr_jobs"."purge_after" <');
    expect(sql.indexOf('delete from "ocr_result_artifacts"')).toBeLessThan(sql.indexOf('delete from "ocr_jobs"'));
    expect(sql.indexOf('delete from "ocr_video_inputs"')).toBeLessThan(sql.indexOf('delete from "ocr_jobs"'));
  });

  it("purges completed video input independently from the seven-day result", async () => {
    const { client, query } = createClient((sql) => {
      if (
        sql.includes('select "uid", "object_key" from "ocr_video_inputs"') &&
        sql.includes('"raw_input_deleted_at" is null')
      ) {
        return [["video-1", videoRow.objectKey]];
      }
      return [];
    });
    const removeObjects = jest.fn(async (_keys: string | string[]) => undefined);

    await reconcileOcrJobs(createEnv({ OCR_UPLOADS: { delete: removeObjects } as unknown as R2Bucket }), {
      createClient: () => client,
    });

    expect(removeObjects).toHaveBeenCalledWith([videoRow.objectKey]);
    expect(
      query.mock.calls.some(([queryConfig]) =>
        queryText(queryConfig).includes('update "ocr_video_inputs" set "raw_input_deleted_at"'),
      ),
    ).toBe(true);
  });

  it("purges an uncommitted or obsolete artifact after its short retention window", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('select "uid", "object_key" from "ocr_result_artifacts"') && sql.includes('"status" in')) {
        return [["artifact-1", artifactRow.objectKey]];
      }
      return [];
    });
    const removeObjects = jest.fn(async (_keys: string | string[]) => undefined);

    await reconcileOcrJobs(createEnv({ OCR_UPLOADS: { delete: removeObjects } as unknown as R2Bucket }), {
      createClient: () => client,
    });

    expect(removeObjects).toHaveBeenCalledWith([artifactRow.objectKey]);
    expect(
      query.mock.calls.some(([queryConfig]) =>
        queryText(queryConfig).includes('update "ocr_result_artifacts" set "deleted_at"'),
      ),
    ).toBe(true);
  });

  it("deletes committed representative frames when the owning job expires", async () => {
    const { client, query } = createClient((sql) => {
      if (sql.includes('select "uid" from "ocr_jobs"') && sql.includes('"purge_after" <')) {
        return [["job-1"]];
      }
      if (sql.includes('from "ocr_result_artifacts"') && sql.includes('"job_uid" in') && !sql.includes('"status" in')) {
        return [[artifactRow.uid, artifactRow.objectKey, null]];
      }
      return [];
    });
    const removeObjects = jest.fn(async (_keys: string | string[]) => undefined);

    await reconcileOcrJobs(createEnv({ OCR_UPLOADS: { delete: removeObjects } as unknown as R2Bucket }), {
      createClient: () => client,
    });

    expect(removeObjects).toHaveBeenCalledWith([artifactRow.objectKey]);
    expect(query.mock.calls.some(([queryConfig]) => queryText(queryConfig).includes('delete from "ocr_jobs"'))).toBe(
      true,
    );
  });

  it("deletes more than one thousand expired R2 objects in bounded batches", async () => {
    const expiredArtifacts = Array.from({ length: 1001 }, (_, index) => [
      `artifact-${index}`,
      `ocr/local/job-1/artifacts/1/artifact-${index}.webp`,
      null,
    ]);
    const { client } = createClient((sql) => {
      if (sql.includes('select "uid" from "ocr_jobs"') && sql.includes('"purge_after" <')) {
        return [["job-1"]];
      }
      if (sql.includes('from "ocr_result_artifacts"') && sql.includes('"job_uid" in') && !sql.includes('"status" in')) {
        return expiredArtifacts;
      }
      return [];
    });
    const removeObjects = jest.fn(async (_keys: string | string[]) => undefined);

    await reconcileOcrJobs(createEnv({ OCR_UPLOADS: { delete: removeObjects } as unknown as R2Bucket }), {
      createClient: () => client,
    });

    expect(removeObjects).toHaveBeenCalledTimes(2);
    expect(removeObjects.mock.calls[0][0]).toHaveLength(1000);
    expect(removeObjects.mock.calls[1][0]).toHaveLength(1);
  });
});
