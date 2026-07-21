import { nanoid } from "nanoid/non-secure";
import type { Client } from "pg";
import {
  OCR_CONTRACT_VERSION,
  OCR_DOWNLOAD_EXPIRES_SECONDS,
  OCR_JOB_RETENTION_DAYS,
  OCR_UPLOAD_EXPIRES_SECONDS,
  type OcrResultEnvelope,
  type OcrTaskMessage,
  type OcrUploadInput,
  parseOcrTaskMessage,
} from "~/domain/ocr";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { createR2PresignedUrl } from "~/lib/r2-presign.server";

type OcrRepositoryOptions = { ctx?: ExecutionContext; createClient?: PostgresClientFactory; fetch?: typeof fetch };

const OCR_HEAD_EXPIRES_SECONDS = 60;

type OcrJobRow = {
  uid: string;
  userId: number;
  status: string;
  generation: number;
  totalImages: number;
  completedImages: number;
  failedImages: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
};

type OcrImageRow = {
  uid: string;
  jobUid: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  inputSha256: string;
  status: string;
  generation: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

type OcrResultRow = {
  resultJson: unknown;
  modelVersion: string;
  catalogVersion: string;
  schemaVersion: string;
};

export type OcrJobView = {
  uid: string;
  status: string;
  generation: number;
  progress: { completed: number; failed: number; total: number };
  images: Array<{
    uid: string;
    filename: string;
    status: string;
    error: { code: string; message: string } | null;
  }>;
  result: unknown | null;
  versions: { model: string; catalog: string; schema: string } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type OcrJobSummary = Pick<OcrJobView, "uid" | "status" | "progress" | "createdAt" | "updatedAt" | "expiresAt">;

export type OcrClaimResult =
  | { disposition: "already_completed" | "cancelled" | "stale" }
  | {
      disposition: "ready";
      attemptUid: string;
      contractVersion: string;
      task: OcrTaskMessage;
      input?: { filename: string; contentType: string; byteSize: number; sha256: string; downloadUrl: string };
      images?: Array<{ uid: string; filename: string; result: unknown }>;
    };

export async function createOcrJob(
  env: Env,
  userId: number,
  images: OcrUploadInput[],
  options: OcrRepositoryOptions = {},
) {
  assertR2PresignConfig(env);
  const jobUid = nanoid(16);
  const expiresAt = new Date(Date.now() + OCR_JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = images.map((image) => {
    const uid = nanoid(16);
    return { ...image, uid, objectKey: `ocr/${env.STAGE ?? "local"}/${jobUid}/${uid}` };
  });

  await withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      await client.query(
        `INSERT INTO ocr_jobs (uid, user_id, status, generation, total_images, expires_at)
         VALUES ($1, $2, 'uploading', 1, $3, $4)`,
        [jobUid, userId, rows.length, expiresAt],
      );
      for (const image of rows) {
        await client.query(
          `INSERT INTO ocr_images (
             uid, job_uid, object_key, original_filename, content_type, byte_size, input_sha256, status, generation
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_upload', 1)`,
          [image.uid, jobUid, image.objectKey, image.filename, image.contentType, image.byteSize, image.sha256],
        );
      }
    }),
  );

  return {
    jobUid,
    expiresAt: expiresAt.toISOString(),
    images: await Promise.all(
      rows.map(async (image) => ({
        imageUid: image.uid,
        filename: image.filename,
        uploadUrl: await createR2Url(env, image.objectKey, "PUT", OCR_UPLOAD_EXPIRES_SECONDS),
      })),
    ),
  };
}

export async function submitOcrJob(
  env: Env,
  userId: number,
  jobUid: string,
  options: OcrRepositoryOptions = {},
): Promise<OcrJobView> {
  const current = await getOcrJob(env, userId, jobUid, options);
  if (!current) throw new Error("OCR 작업을 찾을 수 없어요");
  if (current.status !== "uploading") return current;

  const images = await withOcrClient(env, options, (client) => listImageRows(client, jobUid));
  for (const image of images) {
    const response = await (options.fetch ?? fetch)(
      await createR2Url(env, image.objectKey, "HEAD", OCR_HEAD_EXPIRES_SECONDS),
      { method: "HEAD" },
    );
    const uploadedLength = response.headers.get("content-length");
    const uploadedSize = uploadedLength === null ? Number.NaN : Number(uploadedLength);
    if (!response.ok || !Number.isSafeInteger(uploadedSize) || uploadedSize !== image.byteSize) {
      throw new Error(`${image.originalFilename} 업로드를 확인할 수 없어요`);
    }
    const uploadedType = response.headers.get("content-type");
    if (uploadedType && uploadedType !== image.contentType) {
      throw new Error(`${image.originalFilename} 파일 형식이 요청과 달라요`);
    }
  }

  await withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      const locked = await getOwnedJobRow(client, userId, jobUid, true);
      if (!locked) throw new Error("OCR 작업을 찾을 수 없어요");
      if (locked.status !== "uploading") return;
      await client.query(
        `UPDATE ocr_jobs
         SET status = 'queued', submitted_at = now(), updated_at = now()
         WHERE uid = $1 AND user_id = $2 AND status = 'uploading'`,
        [jobUid, userId],
      );
      for (const image of images) {
        await client.query(
          `UPDATE ocr_images SET status = 'queued', updated_at = now()
           WHERE uid = $1 AND job_uid = $2 AND status = 'pending_upload'`,
          [image.uid, jobUid],
        );
        await insertOutbox(client, {
          type: "ocr.image.recognize.v1",
          taskUid: image.uid,
          generation: image.generation,
        });
      }
    }),
  );
  return (await getOcrJob(env, userId, jobUid, options)) as OcrJobView;
}

export async function getOcrJob(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  jobUid: string,
  options: OcrRepositoryOptions = {},
): Promise<OcrJobView | null> {
  return withOcrClient(env, options, async (client) => {
    const job = await getOwnedJobRow(client, userId, jobUid);
    if (!job) return null;
    const [images, resultQuery] = await Promise.all([
      listImageRows(client, jobUid),
      client.query<OcrResultRow>(
        `SELECT result_json AS "resultJson", model_version AS "modelVersion",
                catalog_version AS "catalogVersion", schema_version AS "schemaVersion"
         FROM ocr_job_results WHERE job_uid = $1 AND generation = $2`,
        [jobUid, job.generation],
      ),
    ]);
    const result = resultQuery.rows[0];
    return {
      uid: job.uid,
      status: job.status,
      generation: job.generation,
      progress: { completed: job.completedImages, failed: job.failedImages, total: job.totalImages },
      images: images.map((image) => ({
        uid: image.uid,
        filename: image.originalFilename,
        status: image.status,
        error:
          image.lastErrorCode && image.lastErrorMessage
            ? { code: image.lastErrorCode, message: image.lastErrorMessage }
            : null,
      })),
      result: result?.resultJson ?? null,
      versions: result
        ? { model: result.modelVersion, catalog: result.catalogVersion, schema: result.schemaVersion }
        : null,
      createdAt: toIso(job.createdAt),
      updatedAt: toIso(job.updatedAt),
      expiresAt: toIso(job.expiresAt),
    };
  });
}

export async function listRecentOcrJobs(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: OcrRepositoryOptions = {},
): Promise<OcrJobSummary[]> {
  return withOcrClient(env, options, async (client) => {
    const result = await client.query<OcrJobRow>(
      `${JOB_SELECT}
       WHERE user_id = $1 AND status <> 'uploading' AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((job) => ({
      uid: job.uid,
      status: job.status,
      progress: { completed: job.completedImages, failed: job.failedImages, total: job.totalImages },
      createdAt: toIso(job.createdAt),
      updatedAt: toIso(job.updatedAt),
      expiresAt: toIso(job.expiresAt),
    }));
  });
}

export async function getOcrImageDownloadUrl(
  env: Env,
  userId: number,
  jobUid: string,
  imageUid: string,
  options: OcrRepositoryOptions = {},
): Promise<string | null> {
  const objectKey = await withOcrClient(env, options, async (client) => {
    const result = await client.query<{ objectKey: string }>(
      `SELECT i.object_key AS "objectKey"
       FROM ocr_images i
       JOIN ocr_jobs j ON j.uid = i.job_uid
       WHERE i.uid = $1 AND j.uid = $2 AND j.user_id = $3 AND j.expires_at > now()`,
      [imageUid, jobUid, userId],
    );
    return result.rows[0]?.objectKey ?? null;
  });
  return objectKey ? createR2Url(env, objectKey, "GET", OCR_DOWNLOAD_EXPIRES_SECONDS) : null;
}

export async function claimOcrTask(
  env: Env,
  task: OcrTaskMessage,
  workerId: string,
  queueAttempts: number,
  options: OcrRepositoryOptions = {},
): Promise<OcrClaimResult> {
  const claim = await withOcrClient(env, options, (client) =>
    inTransaction(
      client,
      async (): Promise<Omit<Extract<OcrClaimResult, { disposition: "ready" }>, "input"> | OcrClaimResult> => {
        if (task.type === "ocr.image.recognize.v1") {
          const imageQuery = await client.query<OcrImageRow & { jobStatus: string }>(
            `${IMAGE_SELECT}, j.status AS "jobStatus"
           FROM ocr_images i JOIN ocr_jobs j ON j.uid = i.job_uid
           WHERE i.uid = $1 FOR UPDATE OF i, j`,
            [task.taskUid],
          );
          const image = imageQuery.rows[0];
          if (!image || image.generation !== task.generation) return { disposition: "stale" };
          if (["cancelled", "expired", "failed"].includes(image.jobStatus)) return { disposition: "cancelled" };
          if (["succeeded", "failed"].includes(image.status)) return { disposition: "already_completed" };

          const attemptUid = nanoid(16);
          await insertAttempt(client, task, attemptUid, workerId, queueAttempts);
          await client.query(
            `UPDATE ocr_images
           SET status = 'processing', current_attempt_uid = $2, updated_at = now()
           WHERE uid = $1 AND generation = $3 AND status IN ('queued', 'processing')`,
            [task.taskUid, attemptUid, task.generation],
          );
          await client.query(
            `UPDATE ocr_jobs SET status = 'processing', updated_at = now()
           WHERE uid = $1 AND status IN ('queued', 'processing')`,
            [image.jobUid],
          );
          return {
            disposition: "ready",
            attemptUid,
            contractVersion: OCR_CONTRACT_VERSION,
            task,
            images: [
              {
                uid: image.uid,
                filename: image.originalFilename,
                result: {
                  objectKey: image.objectKey,
                  contentType: image.contentType,
                  byteSize: image.byteSize,
                  sha256: image.inputSha256,
                },
              },
            ],
          };
        }

        const jobQuery = await client.query<OcrJobRow>(`${JOB_SELECT} WHERE uid = $1 FOR UPDATE`, [task.taskUid]);
        const job = jobQuery.rows[0];
        if (!job || job.generation !== task.generation) return { disposition: "stale" };
        if (["cancelled", "expired", "failed"].includes(job.status)) return { disposition: "cancelled" };
        if (job.status === "review_ready") return { disposition: "already_completed" };
        const resultQuery = await client.query<{ uid: string; filename: string; result: unknown }>(
          `SELECT i.uid, i.original_filename AS filename, r.result_json AS result
         FROM ocr_images i
         JOIN ocr_image_results r ON r.image_uid = i.uid AND r.generation = i.generation
         WHERE i.job_uid = $1 AND i.status = 'succeeded' ORDER BY i.id`,
          [job.uid],
        );
        if (resultQuery.rows.length === 0) return { disposition: "cancelled" };

        const attemptUid = nanoid(16);
        await insertAttempt(client, task, attemptUid, workerId, queueAttempts);
        await client.query(
          `UPDATE ocr_jobs SET status = 'finalizing', updated_at = now()
         WHERE uid = $1 AND generation = $2 AND status IN ('processing', 'finalizing')`,
          [job.uid, job.generation],
        );
        return {
          disposition: "ready",
          attemptUid,
          contractVersion: OCR_CONTRACT_VERSION,
          task,
          images: resultQuery.rows,
        };
      },
    ),
  );

  if (claim.disposition !== "ready" || task.type !== "ocr.image.recognize.v1") return claim;
  const source = claim.images?.[0];
  const metadata = source?.result as
    | { objectKey: string; contentType: string; byteSize: number; sha256: string }
    | undefined;
  if (!source || !metadata) throw new Error("OCR 입력 메타데이터를 찾을 수 없어요");
  return {
    disposition: "ready",
    attemptUid: claim.attemptUid,
    contractVersion: claim.contractVersion,
    task,
    input: {
      filename: source.filename,
      contentType: metadata.contentType,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      downloadUrl: await createR2Url(env, metadata.objectKey, "GET", OCR_DOWNLOAD_EXPIRES_SECONDS),
    },
  };
}

export async function commitOcrTaskResult(
  env: Pick<Env, "HYPERDRIVE">,
  task: OcrTaskMessage,
  envelope: OcrResultEnvelope,
  options: OcrRepositoryOptions = {},
): Promise<{ accepted: true; duplicate: boolean }> {
  return withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      const attemptQuery = await client.query<{ uid: string }>(
        `SELECT uid FROM ocr_attempts
         WHERE uid = $1 AND task_type = $2 AND task_uid = $3 AND generation = $4 FOR UPDATE`,
        [envelope.attemptUid, task.type, task.taskUid, task.generation],
      );
      if (!attemptQuery.rows[0]) throw new Error("유효한 OCR 시도를 찾을 수 없어요");

      if (task.type === "ocr.image.recognize.v1") {
        const imageQuery = await client.query<OcrImageRow>(
          `${IMAGE_SELECT} FROM ocr_images i WHERE i.uid = $1 FOR UPDATE`,
          [task.taskUid],
        );
        const image = imageQuery.rows[0];
        if (!image || image.generation !== task.generation) throw new Error("OCR 이미지를 찾을 수 없어요");
        const existing = await client.query(
          "SELECT uid FROM ocr_image_results WHERE image_uid = $1 AND generation = $2",
          [image.uid, task.generation],
        );
        if (existing.rows[0] || image.status === "failed") {
          await client.query(
            `UPDATE ocr_attempts SET status = $2, finished_at = now()
             WHERE uid = $1 AND status = 'processing'`,
            [envelope.attemptUid, existing.rows[0] ? "succeeded" : "failed"],
          );
          return { accepted: true, duplicate: true } as const;
        }
        if (envelope.status === "succeeded" && envelope.inputSha256 !== image.inputSha256) {
          throw new Error("입력 이미지 hash가 일치하지 않아요");
        }

        if (envelope.status === "succeeded") {
          await client.query(
            `INSERT INTO ocr_image_results (
               uid, image_uid, generation, attempt_uid, result_json, model_version, catalog_version, schema_version
             ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
             ON CONFLICT (image_uid, generation) DO NOTHING`,
            [
              nanoid(16),
              image.uid,
              task.generation,
              envelope.attemptUid,
              JSON.stringify(envelope.result),
              envelope.modelVersion,
              envelope.catalogVersion,
              envelope.schemaVersion,
            ],
          );
        }
        const terminalStatus = envelope.status === "succeeded" ? "succeeded" : "failed";
        await client.query(
          `UPDATE ocr_images
           SET status = $2, last_error_code = $3, last_error_message = $4,
               completed_at = now(), updated_at = now()
           WHERE uid = $1 AND generation = $5 AND status IN ('queued', 'processing')`,
          [image.uid, terminalStatus, envelope.error?.code ?? null, envelope.error?.message ?? null, task.generation],
        );
        await client.query(
          `UPDATE ocr_attempts
           SET status = $2, error_code = $3, error_message = $4, finished_at = now()
           WHERE uid = $1 AND status = 'processing'`,
          [envelope.attemptUid, terminalStatus, envelope.error?.code ?? null, envelope.error?.message ?? null],
        );
        await updateJobCounts(client, image.jobUid);
        await finalizeIfTerminal(client, image.jobUid, task.generation);
        return { accepted: true, duplicate: false } as const;
      }

      const existing = await client.query("SELECT uid FROM ocr_job_results WHERE job_uid = $1 AND generation = $2", [
        task.taskUid,
        task.generation,
      ]);
      if (existing.rows[0]) {
        await client.query(
          "UPDATE ocr_attempts SET status = 'succeeded', finished_at = now() WHERE uid = $1 AND status = 'processing'",
          [envelope.attemptUid],
        );
        return { accepted: true, duplicate: true } as const;
      }
      if (envelope.status === "failed") {
        await client.query(
          `UPDATE ocr_attempts SET status = 'failed', error_code = $2, error_message = $3, finished_at = now()
           WHERE uid = $1`,
          [
            envelope.attemptUid,
            envelope.error?.code ?? "finalize_failed",
            envelope.error?.message ?? "Finalize failed",
          ],
        );
        await client.query(
          `UPDATE ocr_jobs SET status = 'failed', completed_at = now(), updated_at = now()
           WHERE uid = $1 AND generation = $2`,
          [task.taskUid, task.generation],
        );
        return { accepted: true, duplicate: false } as const;
      }

      await client.query(
        `INSERT INTO ocr_job_results (
           uid, job_uid, generation, attempt_uid, result_json, model_version, catalog_version, schema_version
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         ON CONFLICT (job_uid, generation) DO NOTHING`,
        [
          nanoid(16),
          task.taskUid,
          task.generation,
          envelope.attemptUid,
          JSON.stringify(envelope.result),
          envelope.modelVersion,
          envelope.catalogVersion,
          envelope.schemaVersion,
        ],
      );
      await client.query("UPDATE ocr_attempts SET status = 'succeeded', finished_at = now() WHERE uid = $1", [
        envelope.attemptUid,
      ]);
      await client.query(
        `UPDATE ocr_jobs SET status = 'review_ready', completed_at = now(), updated_at = now()
         WHERE uid = $1 AND generation = $2 AND status IN ('processing', 'finalizing')`,
        [task.taskUid, task.generation],
      );
      return { accepted: true, duplicate: false } as const;
    }),
  );
}

export async function publishPendingOcrOutbox(
  env: Env,
  limit = 25,
  options: OcrRepositoryOptions = {},
): Promise<number> {
  if (!env.OCR_TASKS) return 0;
  const rows = await withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      const claimed = await client.query<{ uid: string; payload: unknown }>(
        `WITH candidates AS (
           SELECT id FROM ocr_outbox
           WHERE status = 'pending' AND available_at <= now()
           ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1
         )
         UPDATE ocr_outbox o SET status = 'publishing', updated_at = now()
         FROM candidates c WHERE o.id = c.id
         RETURNING o.uid, o.payload`,
        [limit],
      );
      return claimed.rows;
    }),
  );

  let published = 0;
  for (const row of rows) {
    try {
      await publishOcrTask(env, parseOcrTaskMessage(row.payload), options.fetch ?? fetch);
      await withOcrClient(env, options, (client) =>
        client.query(
          `UPDATE ocr_outbox SET status = 'published', attempts = attempts + 1,
             published_at = now(), updated_at = now(), last_error = NULL
           WHERE uid = $1 AND status = 'publishing'`,
          [row.uid],
        ),
      );
      published += 1;
    } catch (error) {
      await withOcrClient(env, options, (client) =>
        client.query(
          `UPDATE ocr_outbox SET status = 'pending', attempts = attempts + 1,
             last_error = $2, available_at = now() + make_interval(secs => LEAST(300, (attempts + 1) * (attempts + 1))),
             updated_at = now() WHERE uid = $1 AND status = 'publishing'`,
          [row.uid, error instanceof Error ? error.message.slice(0, 500) : "Queue publish failed"],
        ),
      );
    }
  }
  return published;
}

async function publishOcrTask(env: Env, task: OcrTaskMessage, fetcher: typeof fetch): Promise<void> {
  if (env.OCR_QUEUE_API_URL || env.OCR_QUEUE_API_TOKEN) {
    if (!env.OCR_QUEUE_API_URL || !env.OCR_QUEUE_API_TOKEN) {
      throw new Error("로컬 OCR Queue REST 설정이 완료되지 않았어요");
    }
    const response = await fetcher(`${env.OCR_QUEUE_API_URL.replace(/\/$/, "")}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OCR_QUEUE_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: task, content_type: "json" }),
    });
    const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
    if (!response.ok || result?.success !== true) {
      throw new Error(`Cloudflare Queue publish failed: HTTP ${response.status}`);
    }
    return;
  }
  if (!env.OCR_TASKS) throw new Error("OCR Queue binding을 찾을 수 없어요");
  await env.OCR_TASKS.send(task, { contentType: "json" });
}

export async function reconcileOcrJobs(
  env: Pick<Env, "HYPERDRIVE" | "OCR_UPLOADS">,
  options: OcrRepositoryOptions = {},
): Promise<void> {
  await withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      await client.query(
        `UPDATE ocr_outbox SET status = 'pending', updated_at = now()
         WHERE status = 'publishing' AND updated_at < now() - interval '5 minutes'`,
      );
      await client.query(
        `UPDATE ocr_jobs SET status = 'expired', updated_at = now(), completed_at = now()
         WHERE status = 'uploading' AND expires_at < now()`,
      );
      const terminalJobs = await client.query<{ uid: string; generation: number }>(
        `SELECT j.uid, j.generation FROM ocr_jobs j
         WHERE j.status IN ('processing', 'finalizing')
           AND NOT EXISTS (
             SELECT 1 FROM ocr_images i WHERE i.job_uid = j.uid
             AND i.status NOT IN ('succeeded', 'failed', 'cancelled')
           )
           AND EXISTS (SELECT 1 FROM ocr_images i WHERE i.job_uid = j.uid AND i.status = 'succeeded')
         FOR UPDATE OF j`,
      );
      for (const job of terminalJobs.rows) await finalizeIfTerminal(client, job.uid, job.generation);
    }),
  );

  const expiredRows = await withOcrClient(env, options, async (client) =>
    client.query<{ jobUid: string; imageUid: string | null; objectKey: string | null }>(
      `WITH expired_jobs AS (
         SELECT uid FROM ocr_jobs WHERE expires_at < now() ORDER BY expires_at LIMIT 25
       )
       SELECT j.uid AS "jobUid", i.uid AS "imageUid", i.object_key AS "objectKey"
       FROM expired_jobs j
       LEFT JOIN ocr_images i ON i.job_uid = j.uid`,
    ),
  );
  if (expiredRows.rows.length === 0) return;

  const jobUids = [...new Set(expiredRows.rows.map((row) => row.jobUid))];
  const imageUids = expiredRows.rows.flatMap((row) => (row.imageUid ? [row.imageUid] : []));
  const objectKeys = expiredRows.rows.flatMap((row) => (row.objectKey ? [row.objectKey] : []));
  if (objectKeys.length > 0) await env.OCR_UPLOADS.delete(objectKeys);

  await withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      const taskUids = [...jobUids, ...imageUids];
      await client.query(`DELETE FROM ocr_outbox WHERE aggregate_uid = ANY($1::text[])`, [taskUids]);
      await client.query(`DELETE FROM ocr_jobs WHERE uid = ANY($1::text[]) AND expires_at < now()`, [jobUids]);
      await client.query(`DELETE FROM ocr_attempts WHERE task_uid = ANY($1::text[])`, [taskUids]);
    }),
  );
}

export async function markOcrTaskDeadLetter(
  env: Pick<Env, "HYPERDRIVE">,
  value: unknown,
  options: OcrRepositoryOptions = {},
): Promise<void> {
  const task = parseOcrTaskMessage(value);
  await withOcrClient(env, options, (client) =>
    inTransaction(client, async () => {
      if (task.type === "ocr.image.recognize.v1") {
        const image = await client.query<{ jobUid: string }>(
          `UPDATE ocr_images SET status = 'failed', last_error_code = 'queue_retries_exhausted',
             last_error_message = '처리 재시도 횟수를 초과했어요', completed_at = now(), updated_at = now()
           WHERE uid = $1 AND generation = $2 AND status NOT IN ('succeeded', 'failed', 'cancelled')
           RETURNING job_uid AS "jobUid"`,
          [task.taskUid, task.generation],
        );
        const jobUid = image.rows[0]?.jobUid;
        if (jobUid) {
          await updateJobCounts(client, jobUid);
          await finalizeIfTerminal(client, jobUid, task.generation);
        }
        return;
      }
      await client.query(
        `UPDATE ocr_jobs SET status = 'failed', completed_at = now(), updated_at = now()
         WHERE uid = $1 AND generation = $2 AND status NOT IN ('review_ready', 'failed', 'cancelled', 'expired')`,
        [task.taskUid, task.generation],
      );
    }),
  );
}

const JOB_SELECT = `SELECT uid, user_id AS "userId", status, generation,
  total_images AS "totalImages", completed_images AS "completedImages", failed_images AS "failedImages",
  created_at AS "createdAt", updated_at AS "updatedAt", expires_at AS "expiresAt" FROM ocr_jobs`;

const IMAGE_SELECT = `SELECT i.uid, i.job_uid AS "jobUid", i.object_key AS "objectKey",
  i.original_filename AS "originalFilename", i.content_type AS "contentType", i.byte_size AS "byteSize",
  i.input_sha256 AS "inputSha256", i.status, i.generation,
  i.last_error_code AS "lastErrorCode", i.last_error_message AS "lastErrorMessage"`;

async function getOwnedJobRow(client: Client, userId: number, jobUid: string, lock = false) {
  const result = await client.query<OcrJobRow>(
    `${JOB_SELECT} WHERE uid = $1 AND user_id = $2${lock ? " FOR UPDATE" : ""}`,
    [jobUid, userId],
  );
  return result.rows[0] ?? null;
}

async function listImageRows(client: Client, jobUid: string): Promise<OcrImageRow[]> {
  const result = await client.query<OcrImageRow>(
    `${IMAGE_SELECT} FROM ocr_images i WHERE i.job_uid = $1 ORDER BY i.id`,
    [jobUid],
  );
  return result.rows;
}

async function insertAttempt(
  client: Client,
  task: OcrTaskMessage,
  attemptUid: string,
  workerId: string,
  queueAttempts: number,
) {
  await client.query(
    `INSERT INTO ocr_attempts (uid, task_type, task_uid, generation, worker_id, status, queue_attempts)
     VALUES ($1, $2, $3, $4, $5, 'processing', $6)`,
    [attemptUid, task.type, task.taskUid, task.generation, workerId, queueAttempts],
  );
}

async function insertOutbox(client: Client, task: OcrTaskMessage) {
  await client.query(
    `INSERT INTO ocr_outbox (uid, event_type, aggregate_uid, generation, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (event_type, aggregate_uid, generation) DO NOTHING`,
    [nanoid(16), task.type, task.taskUid, task.generation, JSON.stringify(task)],
  );
}

async function updateJobCounts(client: Client, jobUid: string) {
  await client.query(
    `UPDATE ocr_jobs j SET
       completed_images = counts.completed,
       failed_images = counts.failed,
       updated_at = now()
     FROM (
       SELECT count(*) FILTER (WHERE status = 'succeeded')::integer AS completed,
              count(*) FILTER (WHERE status = 'failed')::integer AS failed
       FROM ocr_images WHERE job_uid = $1
     ) counts WHERE j.uid = $1`,
    [jobUid],
  );
}

async function finalizeIfTerminal(client: Client, jobUid: string, generation: number) {
  const counts = await client.query<{ active: number; succeeded: number }>(
    `SELECT count(*) FILTER (WHERE status NOT IN ('succeeded', 'failed', 'cancelled'))::integer AS active,
            count(*) FILTER (WHERE status = 'succeeded')::integer AS succeeded
     FROM ocr_images WHERE job_uid = $1`,
    [jobUid],
  );
  const state = counts.rows[0];
  if (!state || state.active > 0) return;
  if (state.succeeded === 0) {
    await client.query(
      `UPDATE ocr_jobs SET status = 'failed', completed_at = now(), updated_at = now()
       WHERE uid = $1 AND status NOT IN ('review_ready', 'cancelled', 'expired')`,
      [jobUid],
    );
    return;
  }
  await insertOutbox(client, { type: "ocr.job.finalize.v1", taskUid: jobUid, generation });
  await client.query(
    `UPDATE ocr_jobs SET status = 'finalizing', updated_at = now()
     WHERE uid = $1 AND status IN ('queued', 'processing', 'finalizing')`,
    [jobUid],
  );
}

async function inTransaction<T>(client: Client, operation: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function withOcrClient<T>(
  env: Pick<Env, "HYPERDRIVE">,
  options: OcrRepositoryOptions,
  operation: (client: Client) => Promise<T>,
) {
  return withPostgresClient(env, operation, options.createClient ?? createPostgresClient, options.ctx);
}

function assertR2PresignConfig(
  env: Env,
): asserts env is Env &
  Required<
    Pick<Env, "OCR_R2_ACCOUNT_ID" | "OCR_R2_ACCESS_KEY_ID" | "OCR_R2_SECRET_ACCESS_KEY" | "OCR_R2_BUCKET_NAME">
  > {
  if (!env.OCR_R2_ACCOUNT_ID || !env.OCR_R2_ACCESS_KEY_ID || !env.OCR_R2_SECRET_ACCESS_KEY || !env.OCR_R2_BUCKET_NAME) {
    throw new Error("OCR 이미지 저장소 설정이 완료되지 않았어요");
  }
}

function createR2Url(env: Env, key: string, method: "GET" | "HEAD" | "PUT", expiresSeconds: number): Promise<string> {
  assertR2PresignConfig(env);
  return createR2PresignedUrl({
    accountId: env.OCR_R2_ACCOUNT_ID,
    accessKeyId: env.OCR_R2_ACCESS_KEY_ID,
    secretAccessKey: env.OCR_R2_SECRET_ACCESS_KEY,
    bucket: env.OCR_R2_BUCKET_NAME,
    key,
    method,
    expiresSeconds,
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
