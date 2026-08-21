import { and, asc, desc, eq, exists, gt, inArray, isNull, lt, lte, ne, not, notInArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  pgOcrAttemptsTable,
  pgOcrImageResultsTable,
  pgOcrImagesTable,
  pgOcrJobResultsTable,
  pgOcrJobsTable,
  pgOcrOutboxTable,
  pgOcrResultArtifactsTable,
  pgOcrVideoInputsTable,
} from "~/db/postgres/schema";
import {
  OCR_ALLOWED_VIDEO_CONTAINERS,
  OCR_CONTRACT_VERSION,
  OCR_DOWNLOAD_EXPIRES_SECONDS,
  OCR_JOB_PURGE_GRACE_DAYS,
  OCR_JOB_VISIBILITY_DAYS,
  OCR_MAX_ARTIFACT_BYTES,
  OCR_QUOTA_WINDOW_DAYS,
  OCR_ROLLING_IMAGE_LIMIT,
  OCR_ROLLING_VIDEO_LIMIT,
  OCR_STUDENT_VIDEO_CONTRACT_VERSION,
  OCR_TRAINING_CONSENT_VERSION,
  OCR_UPLOAD_EXPIRES_SECONDS,
  type OcrArtifactPreparationRequest,
  type OcrJobKind,
  OcrPublicError,
  type OcrResultEnvelope,
  type OcrStudentVideoUploadRequest,
  type OcrTaskMessage,
  OcrTaskResultRejectedError,
  type OcrUploadInput,
  type OcrUploadRequest,
  parseOcrTaskMessage,
} from "~/domain/ocr";
import { parseStudentDetailVideoEnvelope } from "~/domain/student-video-ocr";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { createR2PresignedUrl } from "~/lib/r2-presign.server";

type OcrRepositoryOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
  fetch?: typeof fetch;
  jobKind?: OcrJobKind;
};

const OCR_HEAD_EXPIRES_SECONDS = 60;
const OCR_SERIALIZABLE_RETRY_LIMIT = 3;
const OCR_VIDEO_RAW_INPUT_GRACE_MS = 24 * 60 * 60 * 1000;

type OcrImageRow = typeof pgOcrImagesTable.$inferSelect;
type OcrDatabase = Pick<NodePgDatabase, "select" | "insert" | "update" | "delete">;

export type OcrJobView = {
  uid: string;
  jobKind: OcrJobKind;
  status: string;
  generation: number;
  progress: { completed: number; failed: number; total: number };
  images: Array<{
    uid: string;
    filename: string;
    status: string;
    error: { code: string; message: string } | null;
  }>;
  video: {
    inputUid: string;
    filename: string;
    contentType: string;
    status: string;
    error: { code: string; message: string } | null;
    evidenceAvailableUntil: string | null;
  } | null;
  result: unknown | null;
  artifacts: Array<{
    uid: string;
    studentUid: string;
    sourceFrame: number;
    timestampSeconds: number;
  }>;
  versions: { model: string; catalog: string; schema: string } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type OcrJobSummary = Pick<
  OcrJobView,
  "uid" | "jobKind" | "status" | "progress" | "createdAt" | "updatedAt" | "expiresAt"
>;

export type OcrUploadQuota = {
  limit: number;
  used: number;
  remaining: number;
  nextAvailableAt: string | null;
};

export class OcrQuotaExceededError extends Error {
  constructor(
    readonly quota: OcrUploadQuota,
    kind: "image" | "video" = "image",
  ) {
    super(
      kind === "video"
        ? "최근 7일 동안 업로드할 수 있는 영상을 모두 사용했어요"
        : quota.remaining === 0
          ? "최근 7일 동안 업로드할 수 있는 스크린샷 수를 모두 사용했어요"
          : `현재 업로드할 수 있는 스크린샷은 ${quota.remaining}장이에요`,
    );
    this.name = "OcrQuotaExceededError";
  }
}

export type OcrClaimResult =
  | { disposition: "already_completed" | "cancelled" | "stale" }
  | {
      disposition: "ready";
      attemptUid: string;
      contractVersion: string;
      task: OcrTaskMessage;
      input?: {
        inputUid?: string;
        filename: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        downloadUrl: string;
        validation?: {
          allowedContainers: string[];
          allowedCodecs: string[];
        };
      };
      images?: Array<{ uid: string; filename: string; result: unknown }>;
    };

export async function createOcrJob(
  env: Env,
  userId: number,
  input:
    | OcrUploadRequest
    | { images: OcrUploadInput[]; trainingConsent: boolean; jobKind?: "item_inventory_images_v1" },
  options: OcrRepositoryOptions = {},
) {
  if ("video" in input) {
    return createStudentVideoOcrJob(env, userId, input, options);
  }
  assertR2PresignConfig(env);
  const jobUid = nanoid(16);
  const expiresAt = new Date(Date.now() + OCR_JOB_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);
  const purgeAfter = new Date(expiresAt.getTime() + OCR_JOB_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const rows = input.images.map((image) => {
    const uid = nanoid(16);
    return { ...image, uid, objectKey: `ocr/${getOcrObjectStage(env)}/${jobUid}/${uid}` };
  });

  const quota = await withOcrDatabase(env, options, (db) =>
    withSerializableRetry(() =>
      db.transaction(
        async (tx) => {
          const currentQuota = await readOcrUploadQuota(tx, userId);
          if (rows.length > currentQuota.remaining) throw new OcrQuotaExceededError(currentQuota);
          const now = new Date();
          await tx.insert(pgOcrJobsTable).values({
            uid: jobUid,
            userId,
            jobKind: "item_inventory_images_v1",
            status: "uploading",
            generation: 1,
            totalImages: rows.length,
            expiresAt,
            purgeAfter,
            trainingConsentAt: input.trainingConsent ? now : null,
            trainingConsentVersion: input.trainingConsent ? OCR_TRAINING_CONSENT_VERSION : null,
          });
          await tx.insert(pgOcrImagesTable).values(
            rows.map((image) => ({
              uid: image.uid,
              jobUid,
              objectKey: image.objectKey,
              originalFilename: image.filename,
              contentType: image.contentType,
              byteSize: image.byteSize,
              inputSha256: image.sha256,
              status: "pending_upload",
              generation: 1,
            })),
          );
          return applyQuotaUsage(
            currentQuota,
            rows.length,
            new Date(now.getTime() + OCR_UPLOAD_EXPIRES_SECONDS * 1000).toISOString(),
          );
        },
        { isolationLevel: "serializable" },
      ),
    ),
  );

  return {
    jobUid,
    jobKind: "item_inventory_images_v1" as const,
    expiresAt: expiresAt.toISOString(),
    quota,
    images: await Promise.all(
      rows.map(async (image) => ({
        imageUid: image.uid,
        filename: image.filename,
        uploadUrl: await createR2Url(env, image.objectKey, "PUT", OCR_UPLOAD_EXPIRES_SECONDS),
      })),
    ),
  };
}

async function createStudentVideoOcrJob(
  env: Env,
  userId: number,
  input: OcrStudentVideoUploadRequest,
  options: OcrRepositoryOptions,
) {
  assertR2PresignConfig(env);
  const jobUid = nanoid(16);
  const inputUid = nanoid(16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OCR_JOB_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);
  const purgeAfter = new Date(expiresAt.getTime() + OCR_JOB_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const rawInputPurgeAfter = new Date(now.getTime() + OCR_UPLOAD_EXPIRES_SECONDS * 1000);
  const objectKey = `ocr/${getOcrObjectStage(env)}/${jobUid}/${inputUid}`;

  const quota = await withOcrDatabase(env, options, (db) =>
    withSerializableRetry(() =>
      db.transaction(
        async (tx) => {
          const currentQuota = await readOcrVideoUploadQuota(tx, userId);
          if (currentQuota.remaining === 0) throw new OcrQuotaExceededError(currentQuota, "video");
          await tx.insert(pgOcrJobsTable).values({
            uid: jobUid,
            userId,
            jobKind: "student_detail_video_v1",
            status: "uploading",
            generation: 1,
            totalImages: 1,
            expiresAt,
            purgeAfter,
            trainingConsentAt: input.trainingConsent ? now : null,
            trainingConsentVersion: input.trainingConsent ? OCR_TRAINING_CONSENT_VERSION : null,
          });
          await tx.insert(pgOcrVideoInputsTable).values({
            uid: inputUid,
            jobUid,
            objectKey,
            originalFilename: input.video.filename,
            contentType: input.video.contentType,
            byteSize: input.video.byteSize,
            inputSha256: input.video.sha256,
            status: "pending_upload",
            generation: 1,
            rawInputPurgeAfter,
          });
          return applyQuotaUsage(
            currentQuota,
            1,
            new Date(now.getTime() + OCR_QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          );
        },
        { isolationLevel: "serializable" },
      ),
    ),
  );

  return {
    jobUid,
    jobKind: "student_detail_video_v1" as const,
    expiresAt: expiresAt.toISOString(),
    quota,
    video: {
      inputUid,
      filename: input.video.filename,
      uploadUrl: await createR2Url(env, objectKey, "PUT", OCR_UPLOAD_EXPIRES_SECONDS),
    },
  };
}

export async function submitOcrJob(
  env: Env,
  userId: number,
  jobUid: string,
  options: OcrRepositoryOptions = {},
): Promise<OcrJobView> {
  const current = await getOcrJob(env, userId, jobUid, options);
  if (!current) throw new OcrPublicError("인식 작업을 찾을 수 없어요", 404);
  if (current.status !== "uploading") return current;
  if (current.jobKind === "student_detail_video_v1") {
    return submitStudentVideoOcrJob(env, userId, jobUid, current, options);
  }

  const images = await withOcrDatabase(env, options, (db) => listImageRows(db, jobUid));
  await Promise.all(
    images.map(async (image) => {
      const response = await (options.fetch ?? fetch)(
        await createR2Url(env, image.objectKey, "HEAD", OCR_HEAD_EXPIRES_SECONDS),
        { method: "HEAD" },
      );
      const uploadedLength = response.headers.get("content-length");
      const uploadedSize = uploadedLength === null ? Number.NaN : Number(uploadedLength);
      if (!response.ok || !Number.isSafeInteger(uploadedSize) || uploadedSize !== image.byteSize) {
        throw new OcrPublicError(`${image.originalFilename} 업로드를 확인할 수 없어요`);
      }
      const uploadedType = response.headers.get("content-type");
      if (uploadedType && uploadedType !== image.contentType) {
        throw new OcrPublicError(`${image.originalFilename} 파일 형식이 요청과 달라요`);
      }
    }),
  );

  await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const locked = await getOwnedJobRow(tx, userId, jobUid, true);
      if (!locked) throw new OcrPublicError("인식 작업을 찾을 수 없어요", 404);
      if (locked.status !== "uploading") return;
      const submittedAt = new Date();
      const expiresAt = new Date(submittedAt.getTime() + OCR_JOB_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);
      const purgeAfter = new Date(expiresAt.getTime() + OCR_JOB_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
      await tx
        .update(pgOcrJobsTable)
        .set({ status: "queued", submittedAt, expiresAt, purgeAfter, updatedAt: submittedAt })
        .where(
          and(
            eq(pgOcrJobsTable.uid, jobUid),
            eq(pgOcrJobsTable.userId, userId),
            eq(pgOcrJobsTable.status, "uploading"),
          ),
        );
      for (const image of images) {
        await tx
          .update(pgOcrImagesTable)
          .set({ status: "queued", updatedAt: submittedAt })
          .where(
            and(
              eq(pgOcrImagesTable.uid, image.uid),
              eq(pgOcrImagesTable.jobUid, jobUid),
              eq(pgOcrImagesTable.status, "pending_upload"),
            ),
          );
        await insertOutbox(tx, {
          type: "ocr.image.recognize.v1",
          taskUid: image.uid,
          generation: image.generation,
        });
      }
    }),
  );
  return (await getOcrJob(env, userId, jobUid, options)) as OcrJobView;
}

export async function cancelOcrJob(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  jobUid: string,
  options: OcrRepositoryOptions = {},
): Promise<{ uid: string; status: "cancelled" }> {
  return withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const job = await getOwnedJobRow(tx, userId, jobUid, true);
      if (!job) throw new OcrPublicError("인식 작업을 찾을 수 없어요", 404);
      if (job.status === "cancelled") return { uid: job.uid, status: "cancelled" };
      if (job.status !== "review_ready") {
        throw new OcrPublicError("검토할 수 있는 인식 결과만 취소할 수 있어요", 409);
      }

      const cancelledAt = new Date();
      await tx
        .update(pgOcrJobsTable)
        .set({
          status: "cancelled",
          generation: job.generation + 1,
          expiresAt: cancelledAt,
          updatedAt: cancelledAt,
        })
        .where(
          and(
            eq(pgOcrJobsTable.uid, job.uid),
            eq(pgOcrJobsTable.userId, userId),
            eq(pgOcrJobsTable.status, "review_ready"),
            eq(pgOcrJobsTable.generation, job.generation),
          ),
        );
      return { uid: job.uid, status: "cancelled" };
    }),
  );
}

async function submitStudentVideoOcrJob(
  env: Env,
  userId: number,
  jobUid: string,
  current: OcrJobView,
  options: OcrRepositoryOptions,
): Promise<OcrJobView> {
  const video = await withOcrDatabase(env, options, async (db) => {
    const rows = await db.select().from(pgOcrVideoInputsTable).where(eq(pgOcrVideoInputsTable.jobUid, jobUid)).limit(1);
    return rows[0] ?? null;
  });
  if (!video) throw new OcrPublicError("업로드한 영상 정보를 찾을 수 없어요", 404);

  const response = await (options.fetch ?? fetch)(
    await createR2Url(env, video.objectKey, "HEAD", OCR_HEAD_EXPIRES_SECONDS),
    { method: "HEAD" },
  );
  const uploadedLength = response.headers.get("content-length");
  const uploadedSize = uploadedLength === null ? Number.NaN : Number(uploadedLength);
  if (!response.ok || !Number.isSafeInteger(uploadedSize) || uploadedSize !== video.byteSize) {
    throw new OcrPublicError("영상 업로드를 확인할 수 없어요");
  }
  const uploadedType = response.headers.get("content-type");
  if (uploadedType && uploadedType !== video.contentType) {
    throw new OcrPublicError("업로드된 영상 형식이 요청과 달라요");
  }

  await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const locked = await getOwnedJobRow(tx, userId, jobUid, true);
      if (!locked) throw new OcrPublicError("인식 작업을 찾을 수 없어요", 404);
      if (locked.status !== "uploading") return;
      const submittedAt = new Date();
      const expiresAt = new Date(submittedAt.getTime() + OCR_JOB_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);
      const purgeAfter = new Date(expiresAt.getTime() + OCR_JOB_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
      await tx
        .update(pgOcrJobsTable)
        .set({ status: "queued", submittedAt, expiresAt, purgeAfter, updatedAt: submittedAt })
        .where(
          and(
            eq(pgOcrJobsTable.uid, jobUid),
            eq(pgOcrJobsTable.userId, userId),
            eq(pgOcrJobsTable.status, "uploading"),
          ),
        );
      await tx
        .update(pgOcrVideoInputsTable)
        .set({ status: "queued", rawInputPurgeAfter: purgeAfter, updatedAt: submittedAt })
        .where(and(eq(pgOcrVideoInputsTable.jobUid, jobUid), eq(pgOcrVideoInputsTable.status, "pending_upload")));
      await insertOutbox(tx, {
        type: "ocr.student_detail_video.recognize.v1",
        taskUid: jobUid,
        generation: locked.generation,
      });
    }),
  );
  return (await getOcrJob(env, userId, jobUid, options)) ?? current;
}

export async function getOcrJob(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  jobUid: string,
  options: OcrRepositoryOptions = {},
): Promise<OcrJobView | null> {
  return withOcrDatabase(env, options, async (db) => {
    const job = await getOwnedJobRow(db, userId, jobUid);
    if (!job) return null;
    const [images, videos, results, artifacts] = await Promise.all([
      job.jobKind === "item_inventory_images_v1" ? listImageRows(db, jobUid) : Promise.resolve([]),
      job.jobKind === "student_detail_video_v1"
        ? db.select().from(pgOcrVideoInputsTable).where(eq(pgOcrVideoInputsTable.jobUid, jobUid)).limit(1)
        : Promise.resolve([]),
      db
        .select({
          resultJson: pgOcrJobResultsTable.resultJson,
          modelVersion: pgOcrJobResultsTable.modelVersion,
          catalogVersion: pgOcrJobResultsTable.catalogVersion,
          schemaVersion: pgOcrJobResultsTable.schemaVersion,
        })
        .from(pgOcrJobResultsTable)
        .where(and(eq(pgOcrJobResultsTable.jobUid, jobUid), eq(pgOcrJobResultsTable.generation, job.generation)))
        .limit(1),
      job.jobKind === "student_detail_video_v1"
        ? db
            .select({
              uid: pgOcrResultArtifactsTable.uid,
              studentUid: pgOcrResultArtifactsTable.studentUid,
              sourceFrame: pgOcrResultArtifactsTable.sourceFrame,
              timestampMs: pgOcrResultArtifactsTable.timestampMs,
            })
            .from(pgOcrResultArtifactsTable)
            .where(
              and(
                eq(pgOcrResultArtifactsTable.jobUid, jobUid),
                eq(pgOcrResultArtifactsTable.generation, job.generation),
                eq(pgOcrResultArtifactsTable.status, "committed"),
                isNull(pgOcrResultArtifactsTable.deletedAt),
              ),
            )
        : Promise.resolve([]),
    ]);
    const result = results[0];
    const video = videos[0];
    return {
      uid: job.uid,
      jobKind: job.jobKind,
      status: job.status,
      generation: job.generation,
      progress: { completed: job.completedImages, failed: job.failedImages, total: job.totalImages },
      images: images.map((image) => ({
        uid: image.uid,
        filename: image.originalFilename,
        status: image.status,
        error:
          image.lastErrorCode && image.lastErrorMessage
            ? { code: "recognition_failed", message: "이미지를 인식하지 못했어요" }
            : null,
      })),
      video: video
        ? {
            inputUid: video.uid,
            filename: video.originalFilename,
            contentType: video.contentType,
            status: video.status,
            error:
              video.lastErrorCode && video.lastErrorMessage
                ? { code: "recognition_failed", message: "영상을 인식하지 못했어요" }
                : null,
            evidenceAvailableUntil:
              video.rawInputDeletedAt || video.rawInputPurgeAfter <= new Date()
                ? null
                : toIso(video.rawInputPurgeAfter),
          }
        : null,
      result: result?.resultJson ?? null,
      artifacts: artifacts.map((artifact) => ({
        uid: artifact.uid,
        studentUid: artifact.studentUid,
        sourceFrame: artifact.sourceFrame,
        timestampSeconds: artifact.timestampMs / 1000,
      })),
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
  return withOcrDatabase(env, options, async (db) => {
    const jobs = await db
      .select()
      .from(pgOcrJobsTable)
      .where(
        and(
          eq(pgOcrJobsTable.userId, userId),
          options.jobKind ? eq(pgOcrJobsTable.jobKind, options.jobKind) : undefined,
          ne(pgOcrJobsTable.status, "uploading"),
          gt(pgOcrJobsTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(pgOcrJobsTable.createdAt));
    return jobs.map((job) => ({
      uid: job.uid,
      jobKind: job.jobKind,
      status: job.status,
      progress: { completed: job.completedImages, failed: job.failedImages, total: job.totalImages },
      createdAt: toIso(job.createdAt),
      updatedAt: toIso(job.updatedAt),
      expiresAt: toIso(job.expiresAt),
    }));
  });
}

export async function getOcrUploadQuota(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: OcrRepositoryOptions = {},
): Promise<OcrUploadQuota> {
  return withOcrDatabase(env, options, (db) =>
    options.jobKind === "student_detail_video_v1"
      ? readOcrVideoUploadQuota(db, userId)
      : readOcrUploadQuota(db, userId),
  );
}

export async function getOcrImageDownloadUrl(
  env: Env,
  userId: number,
  jobUid: string,
  imageUid: string,
  options: OcrRepositoryOptions = {},
): Promise<string | null> {
  const objectKey = await withOcrDatabase(env, options, async (db) => {
    const rows = await db
      .select({ objectKey: pgOcrImagesTable.objectKey })
      .from(pgOcrImagesTable)
      .innerJoin(pgOcrJobsTable, eq(pgOcrJobsTable.uid, pgOcrImagesTable.jobUid))
      .where(
        and(
          eq(pgOcrImagesTable.uid, imageUid),
          eq(pgOcrJobsTable.uid, jobUid),
          eq(pgOcrJobsTable.userId, userId),
          gt(pgOcrJobsTable.purgeAfter, new Date()),
        ),
      )
      .limit(1);
    return rows[0]?.objectKey ?? null;
  });
  return objectKey ? createR2Url(env, objectKey, "GET", OCR_DOWNLOAD_EXPIRES_SECONDS) : null;
}

export async function getOcrVideoDownloadUrl(
  env: Env,
  userId: number,
  jobUid: string,
  options: OcrRepositoryOptions = {},
): Promise<string | null> {
  const objectKey = await withOcrDatabase(env, options, async (db) => {
    const rows = await db
      .select({ objectKey: pgOcrVideoInputsTable.objectKey })
      .from(pgOcrVideoInputsTable)
      .innerJoin(pgOcrJobsTable, eq(pgOcrJobsTable.uid, pgOcrVideoInputsTable.jobUid))
      .where(
        and(
          eq(pgOcrJobsTable.uid, jobUid),
          eq(pgOcrJobsTable.userId, userId),
          eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
          isNull(pgOcrVideoInputsTable.rawInputDeletedAt),
          gt(pgOcrVideoInputsTable.rawInputPurgeAfter, new Date()),
        ),
      )
      .limit(1);
    return rows[0]?.objectKey ?? null;
  });
  return objectKey ? createR2Url(env, objectKey, "GET", OCR_DOWNLOAD_EXPIRES_SECONDS) : null;
}

export async function getOwnedOcrArtifactObjectKey(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  jobUid: string,
  artifactUid: string,
  options: OcrRepositoryOptions = {},
): Promise<string | null> {
  return withOcrDatabase(env, options, async (db) => {
    const rows = await db
      .select({ objectKey: pgOcrResultArtifactsTable.objectKey })
      .from(pgOcrResultArtifactsTable)
      .innerJoin(pgOcrJobsTable, eq(pgOcrJobsTable.uid, pgOcrResultArtifactsTable.jobUid))
      .where(
        and(
          eq(pgOcrResultArtifactsTable.uid, artifactUid),
          eq(pgOcrResultArtifactsTable.jobUid, jobUid),
          eq(pgOcrResultArtifactsTable.generation, pgOcrJobsTable.generation),
          eq(pgOcrResultArtifactsTable.status, "committed"),
          isNull(pgOcrResultArtifactsTable.deletedAt),
          eq(pgOcrJobsTable.userId, userId),
          eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
          gt(pgOcrJobsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows[0]?.objectKey ?? null;
  });
}

export async function prepareOcrResultArtifacts(
  env: Env,
  task: OcrTaskMessage,
  request: OcrArtifactPreparationRequest,
  options: OcrRepositoryOptions = {},
): Promise<{
  artifacts: Array<{
    artifactUid: string;
    studentUid: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
  }>;
}> {
  if (task.type !== "ocr.student_detail_video.recognize.v1") {
    throw new OcrTaskResultRejectedError("학생 영상 작업만 artifact를 만들 수 있어요");
  }
  const rows = await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const attempts = await tx
        .select()
        .from(pgOcrAttemptsTable)
        .where(
          and(
            eq(pgOcrAttemptsTable.uid, request.attemptUid),
            eq(pgOcrAttemptsTable.taskType, task.type),
            eq(pgOcrAttemptsTable.taskUid, task.taskUid),
            eq(pgOcrAttemptsTable.generation, task.generation),
            eq(pgOcrAttemptsTable.status, "processing"),
          ),
        )
        .for("update");
      if (!attempts[0]) throw new OcrTaskResultRejectedError("유효한 OCR 시도를 찾을 수 없어요");
      const jobs = await tx
        .select({ generation: pgOcrJobsTable.generation, purgeAfter: pgOcrJobsTable.purgeAfter })
        .from(pgOcrJobsTable)
        .where(
          and(
            eq(pgOcrJobsTable.uid, task.taskUid),
            eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
            eq(pgOcrJobsTable.generation, task.generation),
            inArray(pgOcrJobsTable.status, ["queued", "processing"]),
          ),
        )
        .for("update");
      if (!jobs[0]) throw new OcrTaskResultRejectedError("유효한 학생 영상 작업을 찾을 수 없어요");

      const existing = await tx
        .select()
        .from(pgOcrResultArtifactsTable)
        .where(eq(pgOcrResultArtifactsTable.attemptUid, request.attemptUid));
      const existingByStudentUid = new Map(existing.map((row) => [row.studentUid, row]));
      for (const manifest of request.artifacts) {
        const row = existingByStudentUid.get(manifest.studentUid);
        if (
          row &&
          (row.sourceFrame !== manifest.sourceFrame ||
            row.timestampMs !== Math.round(manifest.timestampSeconds * 1000) ||
            row.contentType !== manifest.contentType ||
            row.byteSize !== manifest.byteSize ||
            row.sha256 !== manifest.sha256 ||
            row.width !== manifest.width ||
            row.height !== manifest.height)
        ) {
          throw new OcrTaskResultRejectedError("기존 artifact 정보와 일치하지 않아요");
        }
      }

      const pendingPurgeAfter = new Date(Math.min(jobs[0].purgeAfter.getTime(), Date.now() + 2 * 60 * 60 * 1000));
      const missing = request.artifacts.filter(({ studentUid }) => !existingByStudentUid.has(studentUid));
      if (missing.length > 0) {
        await tx
          .insert(pgOcrResultArtifactsTable)
          .values(
            missing.map((manifest) => {
              const uid = crypto.randomUUID();
              return {
                uid,
                jobUid: task.taskUid,
                attemptUid: request.attemptUid,
                taskUid: task.taskUid,
                generation: task.generation,
                studentUid: manifest.studentUid,
                sourceFrame: manifest.sourceFrame,
                timestampMs: Math.round(manifest.timestampSeconds * 1000),
                objectKey: `ocr/${getOcrObjectStage(env)}/${task.taskUid}/artifacts/${task.generation}/${uid}.webp`,
                contentType: manifest.contentType,
                byteSize: manifest.byteSize,
                sha256: manifest.sha256,
                width: manifest.width,
                height: manifest.height,
                status: "pending",
                purgeAfter: pendingPurgeAfter,
                updatedAt: new Date(),
              };
            }),
          )
          .onConflictDoNothing({
            target: [pgOcrResultArtifactsTable.attemptUid, pgOcrResultArtifactsTable.studentUid],
          });
      }
      const prepared = await tx
        .select()
        .from(pgOcrResultArtifactsTable)
        .where(
          and(
            eq(pgOcrResultArtifactsTable.attemptUid, request.attemptUid),
            inArray(
              pgOcrResultArtifactsTable.studentUid,
              request.artifacts.map(({ studentUid }) => studentUid),
            ),
          ),
        );
      if (
        prepared.length !== request.artifacts.length ||
        prepared.some((row) => row.status !== "pending" || row.deletedAt)
      ) {
        throw new OcrTaskResultRejectedError("artifact 준비 상태가 올바르지 않아요");
      }
      return prepared;
    }),
  );

  return {
    artifacts: await Promise.all(
      rows.map(async (row) => {
        const requiredHeaders = {
          "content-type": "image/webp",
          "x-amz-checksum-sha256": sha256HexToBase64(row.sha256),
        };
        return {
          artifactUid: row.uid,
          studentUid: row.studentUid,
          uploadUrl: await createR2Url(env, row.objectKey, "PUT", OCR_UPLOAD_EXPIRES_SECONDS, requiredHeaders),
          requiredHeaders,
        };
      }),
    ),
  };
}

export async function claimOcrTask(
  env: Env,
  task: OcrTaskMessage,
  workerId: string,
  queueAttempts: number,
  options: OcrRepositoryOptions = {},
): Promise<OcrClaimResult> {
  const claim = await withOcrDatabase(env, options, (db) =>
    db.transaction(
      async (tx): Promise<Omit<Extract<OcrClaimResult, { disposition: "ready" }>, "input"> | OcrClaimResult> => {
        if (task.type === "ocr.student_detail_video.recognize.v1") {
          const videoRows = await tx
            .select({
              video: pgOcrVideoInputsTable,
              jobStatus: pgOcrJobsTable.status,
            })
            .from(pgOcrVideoInputsTable)
            .innerJoin(pgOcrJobsTable, eq(pgOcrJobsTable.uid, pgOcrVideoInputsTable.jobUid))
            .where(eq(pgOcrJobsTable.uid, task.taskUid))
            .for("update", { of: [pgOcrVideoInputsTable, pgOcrJobsTable] });
          const row = videoRows[0];
          const video = row?.video;
          if (!video || video.generation !== task.generation) return { disposition: "stale" };
          if (["cancelled", "expired", "failed"].includes(row.jobStatus)) return { disposition: "cancelled" };
          if (["succeeded", "failed"].includes(video.status)) return { disposition: "already_completed" };

          const attemptUid = nanoid(16);
          const now = new Date();
          await insertAttempt(tx, task, attemptUid, workerId, queueAttempts);
          await tx
            .update(pgOcrVideoInputsTable)
            .set({ status: "processing", currentAttemptUid: attemptUid, updatedAt: now })
            .where(
              and(
                eq(pgOcrVideoInputsTable.uid, video.uid),
                eq(pgOcrVideoInputsTable.generation, task.generation),
                inArray(pgOcrVideoInputsTable.status, ["queued", "processing"]),
              ),
            );
          await tx
            .update(pgOcrJobsTable)
            .set({ status: "processing", updatedAt: now })
            .where(
              and(
                eq(pgOcrJobsTable.uid, task.taskUid),
                eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
                inArray(pgOcrJobsTable.status, ["queued", "processing"]),
              ),
            );
          return {
            disposition: "ready",
            attemptUid,
            contractVersion: OCR_STUDENT_VIDEO_CONTRACT_VERSION,
            task,
            images: [
              {
                uid: video.uid,
                filename: video.originalFilename,
                result: {
                  objectKey: video.objectKey,
                  contentType: video.contentType,
                  byteSize: video.byteSize,
                  sha256: video.inputSha256,
                },
              },
            ],
          };
        }

        if (task.type === "ocr.image.recognize.v1") {
          const imageRows = await tx
            .select({
              image: pgOcrImagesTable,
              jobStatus: pgOcrJobsTable.status,
            })
            .from(pgOcrImagesTable)
            .innerJoin(pgOcrJobsTable, eq(pgOcrJobsTable.uid, pgOcrImagesTable.jobUid))
            .where(eq(pgOcrImagesTable.uid, task.taskUid))
            .for("update", { of: [pgOcrImagesTable, pgOcrJobsTable] });
          const row = imageRows[0];
          const image = row?.image;
          if (!image || image.generation !== task.generation) return { disposition: "stale" };
          if (["cancelled", "expired", "failed"].includes(row.jobStatus)) return { disposition: "cancelled" };
          if (["succeeded", "failed"].includes(image.status)) return { disposition: "already_completed" };

          const attemptUid = nanoid(16);
          const now = new Date();
          await insertAttempt(tx, task, attemptUid, workerId, queueAttempts);
          await tx
            .update(pgOcrImagesTable)
            .set({ status: "processing", currentAttemptUid: attemptUid, updatedAt: now })
            .where(
              and(
                eq(pgOcrImagesTable.uid, task.taskUid),
                eq(pgOcrImagesTable.generation, task.generation),
                inArray(pgOcrImagesTable.status, ["queued", "processing"]),
              ),
            );
          await tx
            .update(pgOcrJobsTable)
            .set({ status: "processing", updatedAt: now })
            .where(and(eq(pgOcrJobsTable.uid, image.jobUid), inArray(pgOcrJobsTable.status, ["queued", "processing"])));
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

        const jobRows = await tx
          .select()
          .from(pgOcrJobsTable)
          .where(eq(pgOcrJobsTable.uid, task.taskUid))
          .for("update");
        const job = jobRows[0];
        if (!job || job.generation !== task.generation) return { disposition: "stale" };
        if (["cancelled", "expired", "failed"].includes(job.status)) return { disposition: "cancelled" };
        if (job.status === "review_ready") return { disposition: "already_completed" };
        const results = await tx
          .select({
            uid: pgOcrImagesTable.uid,
            filename: pgOcrImagesTable.originalFilename,
            result: pgOcrImageResultsTable.resultJson,
          })
          .from(pgOcrImagesTable)
          .innerJoin(
            pgOcrImageResultsTable,
            and(
              eq(pgOcrImageResultsTable.imageUid, pgOcrImagesTable.uid),
              eq(pgOcrImageResultsTable.generation, pgOcrImagesTable.generation),
            ),
          )
          .where(and(eq(pgOcrImagesTable.jobUid, job.uid), eq(pgOcrImagesTable.status, "succeeded")))
          .orderBy(asc(pgOcrImagesTable.id));
        if (results.length === 0) return { disposition: "cancelled" };

        const attemptUid = nanoid(16);
        await insertAttempt(tx, task, attemptUid, workerId, queueAttempts);
        await tx
          .update(pgOcrJobsTable)
          .set({ status: "finalizing", updatedAt: new Date() })
          .where(
            and(
              eq(pgOcrJobsTable.uid, job.uid),
              eq(pgOcrJobsTable.generation, job.generation),
              inArray(pgOcrJobsTable.status, ["processing", "finalizing"]),
            ),
          );
        return {
          disposition: "ready",
          attemptUid,
          contractVersion: OCR_CONTRACT_VERSION,
          task,
          images: results,
        };
      },
    ),
  );

  if (
    claim.disposition !== "ready" ||
    (task.type !== "ocr.image.recognize.v1" && task.type !== "ocr.student_detail_video.recognize.v1")
  ) {
    return claim;
  }
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
      ...(task.type === "ocr.student_detail_video.recognize.v1" ? { inputUid: source.uid } : {}),
      filename: source.filename,
      contentType: metadata.contentType,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      downloadUrl: await createR2Url(env, metadata.objectKey, "GET", OCR_DOWNLOAD_EXPIRES_SECONDS),
      ...(task.type === "ocr.student_detail_video.recognize.v1"
        ? {
            validation: {
              allowedContainers: [...OCR_ALLOWED_VIDEO_CONTAINERS],
              allowedCodecs: ["h264", "hevc", "av1", "mpeg4"],
            },
          }
        : {}),
    },
  };
}

type VerifiedStudentVideoEnvelope = ReturnType<typeof parseStudentDetailVideoEnvelope> & {
  artifacts: Array<{ artifactUid: string; studentUid: string }>;
};

async function verifyStudentVideoArtifacts(
  env: Pick<Env, "HYPERDRIVE" | "OCR_UPLOADS">,
  task: OcrTaskMessage,
  envelope: ReturnType<typeof parseStudentDetailVideoEnvelope>,
  options: OcrRepositoryOptions,
): Promise<VerifiedStudentVideoEnvelope> {
  const references = envelope.artifacts;
  if (!references || references.length !== envelope.result.students.length) {
    throw new OcrTaskResultRejectedError("학생별 인식 화면이 모두 필요해요");
  }
  if (
    new Set(references.map(({ artifactUid }) => artifactUid)).size !== references.length ||
    new Set(references.map(({ studentUid }) => studentUid)).size !== references.length
  ) {
    throw new OcrTaskResultRejectedError("인식 화면 참조가 중복되었어요");
  }
  const students = new Map(envelope.result.students.map((student) => [student.studentUid, student]));
  if (references.some(({ studentUid }) => !students.has(studentUid))) {
    throw new OcrTaskResultRejectedError("인식 화면의 학생 정보가 결과와 일치하지 않아요");
  }

  const rows = await withOcrDatabase(env, options, (db) =>
    db
      .select()
      .from(pgOcrResultArtifactsTable)
      .where(
        and(
          inArray(
            pgOcrResultArtifactsTable.uid,
            references.map(({ artifactUid }) => artifactUid),
          ),
          eq(pgOcrResultArtifactsTable.attemptUid, envelope.attemptUid),
          eq(pgOcrResultArtifactsTable.jobUid, task.taskUid),
          eq(pgOcrResultArtifactsTable.taskUid, task.taskUid),
          eq(pgOcrResultArtifactsTable.generation, task.generation),
          inArray(pgOcrResultArtifactsTable.status, ["pending", "committed"]),
          isNull(pgOcrResultArtifactsTable.deletedAt),
        ),
      ),
  );
  if (rows.length !== references.length) {
    throw new OcrTaskResultRejectedError("현재 OCR 시도의 인식 화면을 찾을 수 없어요");
  }
  const rowsByUid = new Map(rows.map((row) => [row.uid, row]));
  for (const reference of references) {
    const row = rowsByUid.get(reference.artifactUid);
    const student = students.get(reference.studentUid);
    if (!row || !student || row.studentUid !== reference.studentUid) {
      throw new OcrTaskResultRejectedError("인식 화면의 소유 관계가 일치하지 않아요");
    }
    if (
      !student.sourceFrames.includes(row.sourceFrame) ||
      !student.sourceTimestampsSeconds.some(
        (timestamp) => Math.abs(Math.round(timestamp * 1000) - row.timestampMs) <= 1,
      )
    ) {
      throw new OcrTaskResultRejectedError("인식 화면이 학생 인식 근거와 일치하지 않아요");
    }
  }

  for (let offset = 0; offset < rows.length; offset += 20) {
    await Promise.all(
      rows.slice(offset, offset + 20).map(async (row) => {
        const object = await env.OCR_UPLOADS.head(row.objectKey);
        const checksum = object?.checksums.sha256;
        if (
          !object ||
          object.size !== row.byteSize ||
          object.size > OCR_MAX_ARTIFACT_BYTES ||
          object.httpMetadata?.contentType !== "image/webp" ||
          !checksum ||
          bytesToHex(new Uint8Array(checksum)) !== row.sha256
        ) {
          throw new OcrTaskResultRejectedError("업로드된 인식 화면의 무결성을 확인할 수 없어요");
        }
      }),
    );
  }
  return { ...envelope, artifacts: references };
}

export async function commitOcrTaskResult(
  env: Pick<Env, "HYPERDRIVE" | "OCR_UPLOADS">,
  task: OcrTaskMessage,
  envelope: OcrResultEnvelope,
  options: OcrRepositoryOptions = {},
): Promise<{ accepted: true; duplicate: boolean }> {
  const verifiedVideoEnvelope =
    task.type === "ocr.student_detail_video.recognize.v1" && envelope.status === "succeeded"
      ? await verifyStudentVideoArtifacts(env, task, parseStudentDetailVideoEnvelope(envelope), options)
      : null;
  return withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const attempts = await tx
        .select({ uid: pgOcrAttemptsTable.uid })
        .from(pgOcrAttemptsTable)
        .where(
          and(
            eq(pgOcrAttemptsTable.uid, envelope.attemptUid),
            eq(pgOcrAttemptsTable.taskType, task.type),
            eq(pgOcrAttemptsTable.taskUid, task.taskUid),
            eq(pgOcrAttemptsTable.generation, task.generation),
          ),
        )
        .for("update");
      if (!attempts[0]) throw new OcrTaskResultRejectedError("유효한 OCR 시도를 찾을 수 없어요");

      if (task.type === "ocr.student_detail_video.recognize.v1") {
        const videos = await tx
          .select()
          .from(pgOcrVideoInputsTable)
          .where(eq(pgOcrVideoInputsTable.jobUid, task.taskUid))
          .for("update");
        const video = videos[0];
        if (!video || video.generation !== task.generation) {
          throw new OcrTaskResultRejectedError("OCR 영상 입력을 찾을 수 없어요");
        }
        const existing = await tx
          .select({ uid: pgOcrJobResultsTable.uid, attemptUid: pgOcrJobResultsTable.attemptUid })
          .from(pgOcrJobResultsTable)
          .where(
            and(eq(pgOcrJobResultsTable.jobUid, task.taskUid), eq(pgOcrJobResultsTable.generation, task.generation)),
          )
          .limit(1);
        if (existing[0] || video.status === "failed") {
          if (existing[0]?.attemptUid !== envelope.attemptUid) {
            await tx
              .update(pgOcrResultArtifactsTable)
              .set({ status: "obsolete", purgeAfter: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(pgOcrResultArtifactsTable.attemptUid, envelope.attemptUid),
                  eq(pgOcrResultArtifactsTable.status, "pending"),
                ),
              );
          }
          await tx
            .update(pgOcrAttemptsTable)
            .set({ status: existing[0] ? "succeeded" : "failed", finishedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(pgOcrAttemptsTable.uid, envelope.attemptUid), eq(pgOcrAttemptsTable.status, "processing")));
          return { accepted: true, duplicate: true } as const;
        }
        if (envelope.status === "succeeded" && envelope.inputSha256 !== video.inputSha256) {
          throw new OcrTaskResultRejectedError("입력 영상 hash가 일치하지 않아요");
        }

        const parsedEnvelope: VerifiedStudentVideoEnvelope | Extract<OcrResultEnvelope, { status: "failed" }> =
          envelope.status === "succeeded" ? (verifiedVideoEnvelope as VerifiedStudentVideoEnvelope) : envelope;
        if (parsedEnvelope.status === "succeeded") {
          await tx
            .insert(pgOcrJobResultsTable)
            .values({
              uid: nanoid(16),
              jobUid: task.taskUid,
              generation: task.generation,
              attemptUid: envelope.attemptUid,
              resultJson: parsedEnvelope.result,
              modelVersion: parsedEnvelope.modelVersion,
              catalogVersion: parsedEnvelope.catalogVersion,
              schemaVersion: parsedEnvelope.schemaVersion,
            })
            .onConflictDoNothing({ target: [pgOcrJobResultsTable.jobUid, pgOcrJobResultsTable.generation] });
          const artifactUids = parsedEnvelope.artifacts.map(({ artifactUid }) => artifactUid);
          const jobs = await tx
            .select({ expiresAt: pgOcrJobsTable.expiresAt })
            .from(pgOcrJobsTable)
            .where(
              and(
                eq(pgOcrJobsTable.uid, task.taskUid),
                eq(pgOcrJobsTable.generation, task.generation),
                eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
              ),
            )
            .limit(1);
          if (!jobs[0]) throw new OcrTaskResultRejectedError("OCR 작업을 찾을 수 없어요");
          const committedArtifacts = await tx
            .update(pgOcrResultArtifactsTable)
            .set({ status: "committed", purgeAfter: jobs[0].expiresAt, updatedAt: new Date() })
            .where(
              and(
                inArray(pgOcrResultArtifactsTable.uid, artifactUids),
                eq(pgOcrResultArtifactsTable.attemptUid, envelope.attemptUid),
                eq(pgOcrResultArtifactsTable.status, "pending"),
              ),
            )
            .returning({ uid: pgOcrResultArtifactsTable.uid });
          if (committedArtifacts.length !== artifactUids.length) {
            throw new OcrTaskResultRejectedError("인식 화면을 확정하지 못했어요");
          }
          await tx
            .update(pgOcrResultArtifactsTable)
            .set({ status: "obsolete", purgeAfter: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(pgOcrResultArtifactsTable.jobUid, task.taskUid),
                eq(pgOcrResultArtifactsTable.generation, task.generation),
                ne(pgOcrResultArtifactsTable.attemptUid, envelope.attemptUid),
                eq(pgOcrResultArtifactsTable.status, "pending"),
              ),
            );
        } else {
          await tx
            .update(pgOcrResultArtifactsTable)
            .set({ status: "obsolete", purgeAfter: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(pgOcrResultArtifactsTable.attemptUid, envelope.attemptUid),
                eq(pgOcrResultArtifactsTable.status, "pending"),
              ),
            );
        }

        const finishedAt = new Date();
        const status = parsedEnvelope.status === "succeeded" ? "succeeded" : "failed";
        const videoMetadata = parsedEnvelope.status === "succeeded" ? parsedEnvelope.result.video : null;
        await tx
          .update(pgOcrVideoInputsTable)
          .set({
            status,
            durationMs: videoMetadata ? Math.round(videoMetadata.durationSeconds * 1000) : null,
            width: videoMetadata?.width ?? null,
            height: videoMetadata?.height ?? null,
            codec: videoMetadata?.codec ?? null,
            container: videoMetadata?.container ?? null,
            lastErrorCode: parsedEnvelope.error?.code ?? null,
            lastErrorMessage: parsedEnvelope.error?.message ?? null,
            rawInputPurgeAfter: new Date(finishedAt.getTime() + OCR_VIDEO_RAW_INPUT_GRACE_MS),
            completedAt: finishedAt,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(pgOcrVideoInputsTable.uid, video.uid),
              eq(pgOcrVideoInputsTable.generation, task.generation),
              inArray(pgOcrVideoInputsTable.status, ["queued", "processing"]),
            ),
          );
        await tx
          .update(pgOcrAttemptsTable)
          .set({
            status,
            errorCode: parsedEnvelope.error?.code ?? null,
            errorMessage: parsedEnvelope.error?.message ?? null,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(and(eq(pgOcrAttemptsTable.uid, envelope.attemptUid), eq(pgOcrAttemptsTable.status, "processing")));
        await tx
          .update(pgOcrJobsTable)
          .set({
            status: status === "succeeded" ? "review_ready" : "failed",
            completedImages: status === "succeeded" ? 1 : 0,
            failedImages: status === "failed" ? 1 : 0,
            completedAt: finishedAt,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(pgOcrJobsTable.uid, task.taskUid),
              eq(pgOcrJobsTable.generation, task.generation),
              eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
              inArray(pgOcrJobsTable.status, ["queued", "processing"]),
            ),
          );
        return { accepted: true, duplicate: false } as const;
      }

      if (task.type === "ocr.image.recognize.v1") {
        const images = await tx
          .select()
          .from(pgOcrImagesTable)
          .where(eq(pgOcrImagesTable.uid, task.taskUid))
          .for("update");
        const image = images[0];
        if (!image || image.generation !== task.generation) {
          throw new OcrTaskResultRejectedError("OCR 이미지를 찾을 수 없어요");
        }
        const existing = await tx
          .select({ uid: pgOcrImageResultsTable.uid })
          .from(pgOcrImageResultsTable)
          .where(
            and(eq(pgOcrImageResultsTable.imageUid, image.uid), eq(pgOcrImageResultsTable.generation, task.generation)),
          )
          .limit(1);
        if (existing[0] || image.status === "failed") {
          await tx
            .update(pgOcrAttemptsTable)
            .set({ status: existing[0] ? "succeeded" : "failed", finishedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(pgOcrAttemptsTable.uid, envelope.attemptUid), eq(pgOcrAttemptsTable.status, "processing")));
          return { accepted: true, duplicate: true } as const;
        }
        if (envelope.status === "succeeded" && envelope.inputSha256 !== image.inputSha256) {
          throw new OcrTaskResultRejectedError("입력 이미지 hash가 일치하지 않아요");
        }

        if (envelope.status === "succeeded") {
          await tx
            .insert(pgOcrImageResultsTable)
            .values({
              uid: nanoid(16),
              imageUid: image.uid,
              generation: task.generation,
              attemptUid: envelope.attemptUid,
              resultJson: envelope.result,
              modelVersion: envelope.modelVersion,
              catalogVersion: envelope.catalogVersion,
              schemaVersion: envelope.schemaVersion,
            })
            .onConflictDoNothing({ target: [pgOcrImageResultsTable.imageUid, pgOcrImageResultsTable.generation] });
        }
        const terminalStatus = envelope.status === "succeeded" ? "succeeded" : "failed";
        const finishedAt = new Date();
        await tx
          .update(pgOcrImagesTable)
          .set({
            status: terminalStatus,
            lastErrorCode: envelope.error?.code ?? null,
            lastErrorMessage: envelope.error?.message ?? null,
            completedAt: finishedAt,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(pgOcrImagesTable.uid, image.uid),
              eq(pgOcrImagesTable.generation, task.generation),
              inArray(pgOcrImagesTable.status, ["queued", "processing"]),
            ),
          );
        await tx
          .update(pgOcrAttemptsTable)
          .set({
            status: terminalStatus,
            errorCode: envelope.error?.code ?? null,
            errorMessage: envelope.error?.message ?? null,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(and(eq(pgOcrAttemptsTable.uid, envelope.attemptUid), eq(pgOcrAttemptsTable.status, "processing")));
        await updateJobCounts(tx, image.jobUid);
        await finalizeIfTerminal(tx, image.jobUid, task.generation);
        return { accepted: true, duplicate: false } as const;
      }

      const existing = await tx
        .select({ uid: pgOcrJobResultsTable.uid })
        .from(pgOcrJobResultsTable)
        .where(and(eq(pgOcrJobResultsTable.jobUid, task.taskUid), eq(pgOcrJobResultsTable.generation, task.generation)))
        .limit(1);
      if (existing[0]) {
        await tx
          .update(pgOcrAttemptsTable)
          .set({ status: "succeeded", finishedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(pgOcrAttemptsTable.uid, envelope.attemptUid), eq(pgOcrAttemptsTable.status, "processing")));
        return { accepted: true, duplicate: true } as const;
      }
      if (envelope.status === "failed") {
        const finishedAt = new Date();
        await tx
          .update(pgOcrAttemptsTable)
          .set({
            status: "failed",
            errorCode: envelope.error?.code ?? "finalize_failed",
            errorMessage: envelope.error?.message ?? "Finalize failed",
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(eq(pgOcrAttemptsTable.uid, envelope.attemptUid));
        await tx
          .update(pgOcrJobsTable)
          .set({ status: "failed", completedAt: finishedAt, updatedAt: finishedAt })
          .where(and(eq(pgOcrJobsTable.uid, task.taskUid), eq(pgOcrJobsTable.generation, task.generation)));
        return { accepted: true, duplicate: false } as const;
      }

      await tx
        .insert(pgOcrJobResultsTable)
        .values({
          uid: nanoid(16),
          jobUid: task.taskUid,
          generation: task.generation,
          attemptUid: envelope.attemptUid,
          resultJson: envelope.result,
          modelVersion: envelope.modelVersion,
          catalogVersion: envelope.catalogVersion,
          schemaVersion: envelope.schemaVersion,
        })
        .onConflictDoNothing({ target: [pgOcrJobResultsTable.jobUid, pgOcrJobResultsTable.generation] });
      const finishedAt = new Date();
      await tx
        .update(pgOcrAttemptsTable)
        .set({ status: "succeeded", finishedAt, updatedAt: finishedAt })
        .where(eq(pgOcrAttemptsTable.uid, envelope.attemptUid));
      await tx
        .update(pgOcrJobsTable)
        .set({ status: "review_ready", completedAt: finishedAt, updatedAt: finishedAt })
        .where(
          and(
            eq(pgOcrJobsTable.uid, task.taskUid),
            eq(pgOcrJobsTable.generation, task.generation),
            inArray(pgOcrJobsTable.status, ["processing", "finalizing"]),
          ),
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
  const rows = await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: pgOcrOutboxTable.id })
        .from(pgOcrOutboxTable)
        .where(and(eq(pgOcrOutboxTable.status, "pending"), lte(pgOcrOutboxTable.availableAt, new Date())))
        .orderBy(asc(pgOcrOutboxTable.id))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (candidates.length === 0) return [];
      return tx
        .update(pgOcrOutboxTable)
        .set({ status: "publishing", updatedAt: new Date() })
        .where(
          inArray(
            pgOcrOutboxTable.id,
            candidates.map(({ id }) => id),
          ),
        )
        .returning({
          uid: pgOcrOutboxTable.uid,
          payload: pgOcrOutboxTable.payload,
          attempts: pgOcrOutboxTable.attempts,
        });
    }),
  );

  let published = 0;
  for (const row of rows) {
    try {
      await publishOcrTask(env, parseOcrTaskMessage(row.payload), options.fetch ?? fetch);
      await withOcrDatabase(env, options, (db) =>
        db
          .update(pgOcrOutboxTable)
          .set({
            status: "published",
            attempts: row.attempts + 1,
            publishedAt: new Date(),
            updatedAt: new Date(),
            lastError: null,
          })
          .where(and(eq(pgOcrOutboxTable.uid, row.uid), eq(pgOcrOutboxTable.status, "publishing"))),
      );
      published += 1;
    } catch (error) {
      await withOcrDatabase(env, options, (db) => {
        const now = new Date();
        const attempts = row.attempts + 1;
        return db
          .update(pgOcrOutboxTable)
          .set({
            status: "pending",
            attempts,
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Queue publish failed",
            availableAt: new Date(now.getTime() + Math.min(300, attempts * attempts) * 1000),
            updatedAt: now,
          })
          .where(and(eq(pgOcrOutboxTable.uid, row.uid), eq(pgOcrOutboxTable.status, "publishing")));
      });
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
  await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(pgOcrOutboxTable)
        .set({ status: "pending", updatedAt: now })
        .where(
          and(
            eq(pgOcrOutboxTable.status, "publishing"),
            lt(pgOcrOutboxTable.updatedAt, new Date(now.getTime() - 5 * 60 * 1000)),
          ),
        );
      await tx
        .update(pgOcrJobsTable)
        .set({ status: "expired", purgeAfter: now, updatedAt: now, completedAt: now })
        .where(
          and(
            eq(pgOcrJobsTable.status, "uploading"),
            lt(pgOcrJobsTable.createdAt, new Date(now.getTime() - OCR_UPLOAD_EXPIRES_SECONDS * 1000)),
          ),
        );
      const terminalJobs = await tx
        .select({ uid: pgOcrJobsTable.uid, generation: pgOcrJobsTable.generation })
        .from(pgOcrJobsTable)
        .where(
          and(
            inArray(pgOcrJobsTable.status, ["processing", "finalizing"]),
            exists(
              tx
                .select({ uid: pgOcrImagesTable.uid })
                .from(pgOcrImagesTable)
                .where(and(eq(pgOcrImagesTable.jobUid, pgOcrJobsTable.uid), eq(pgOcrImagesTable.status, "succeeded"))),
            ),
            not(
              exists(
                tx
                  .select({ uid: pgOcrImagesTable.uid })
                  .from(pgOcrImagesTable)
                  .where(
                    and(
                      eq(pgOcrImagesTable.jobUid, pgOcrJobsTable.uid),
                      notInArray(pgOcrImagesTable.status, ["succeeded", "failed", "cancelled"]),
                    ),
                  ),
              ),
            ),
          ),
        )
        .for("update", { of: pgOcrJobsTable });
      for (const job of terminalJobs) await finalizeIfTerminal(tx, job.uid, job.generation);
    }),
  );

  const purgeableVideos = await withOcrDatabase(env, options, (db) =>
    db
      .select({ uid: pgOcrVideoInputsTable.uid, objectKey: pgOcrVideoInputsTable.objectKey })
      .from(pgOcrVideoInputsTable)
      .where(
        and(isNull(pgOcrVideoInputsTable.rawInputDeletedAt), lte(pgOcrVideoInputsTable.rawInputPurgeAfter, new Date())),
      )
      .orderBy(asc(pgOcrVideoInputsTable.rawInputPurgeAfter))
      .limit(25),
  );
  if (purgeableVideos.length > 0) {
    await env.OCR_UPLOADS.delete(purgeableVideos.map(({ objectKey }) => objectKey));
    await withOcrDatabase(env, options, (db) =>
      db
        .update(pgOcrVideoInputsTable)
        .set({ rawInputDeletedAt: new Date(), updatedAt: new Date() })
        .where(
          inArray(
            pgOcrVideoInputsTable.uid,
            purgeableVideos.map(({ uid }) => uid),
          ),
        ),
    );
  }

  const purgeableArtifacts = await withOcrDatabase(env, options, (db) =>
    db
      .select({ uid: pgOcrResultArtifactsTable.uid, objectKey: pgOcrResultArtifactsTable.objectKey })
      .from(pgOcrResultArtifactsTable)
      .where(
        and(
          inArray(pgOcrResultArtifactsTable.status, ["pending", "committed", "obsolete"]),
          isNull(pgOcrResultArtifactsTable.deletedAt),
          lte(pgOcrResultArtifactsTable.purgeAfter, new Date()),
        ),
      )
      .orderBy(asc(pgOcrResultArtifactsTable.purgeAfter))
      .limit(100),
  );
  if (purgeableArtifacts.length > 0) {
    await env.OCR_UPLOADS.delete(purgeableArtifacts.map(({ objectKey }) => objectKey));
    await withOcrDatabase(env, options, (db) =>
      db
        .update(pgOcrResultArtifactsTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          inArray(
            pgOcrResultArtifactsTable.uid,
            purgeableArtifacts.map(({ uid }) => uid),
          ),
        ),
    );
  }

  const expired = await withOcrDatabase(env, options, async (db) => {
    const jobs = await db
      .select({ uid: pgOcrJobsTable.uid })
      .from(pgOcrJobsTable)
      .where(and(lt(pgOcrJobsTable.purgeAfter, new Date()), isNull(pgOcrJobsTable.storagePurgedAt)))
      .orderBy(asc(pgOcrJobsTable.purgeAfter))
      .limit(25);
    const jobUids = jobs.map(({ uid }) => uid);
    if (jobUids.length === 0) return { jobUids, images: [], videos: [], artifacts: [] };
    const [images, videos, artifacts] = await Promise.all([
      db
        .select({ uid: pgOcrImagesTable.uid, objectKey: pgOcrImagesTable.objectKey })
        .from(pgOcrImagesTable)
        .where(inArray(pgOcrImagesTable.jobUid, jobUids)),
      db
        .select({
          uid: pgOcrVideoInputsTable.uid,
          objectKey: pgOcrVideoInputsTable.objectKey,
          deletedAt: pgOcrVideoInputsTable.rawInputDeletedAt,
        })
        .from(pgOcrVideoInputsTable)
        .where(inArray(pgOcrVideoInputsTable.jobUid, jobUids)),
      db
        .select({
          uid: pgOcrResultArtifactsTable.uid,
          objectKey: pgOcrResultArtifactsTable.objectKey,
          deletedAt: pgOcrResultArtifactsTable.deletedAt,
        })
        .from(pgOcrResultArtifactsTable)
        .where(inArray(pgOcrResultArtifactsTable.jobUid, jobUids)),
    ]);
    return { jobUids, images, videos, artifacts };
  });
  if (expired.jobUids.length === 0) return;

  const jobUids = expired.jobUids;
  const objectKeys = [
    ...expired.images.map(({ objectKey }) => objectKey),
    ...expired.videos.flatMap(({ objectKey, deletedAt }) => (deletedAt ? [] : [objectKey])),
    ...expired.artifacts.flatMap(({ objectKey, deletedAt }) => (deletedAt ? [] : [objectKey])),
  ];
  await deleteR2Objects(env.OCR_UPLOADS, objectKeys);

  await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const storagePurgedAt = new Date();
      await tx
        .update(pgOcrVideoInputsTable)
        .set({ rawInputDeletedAt: storagePurgedAt, updatedAt: storagePurgedAt })
        .where(and(inArray(pgOcrVideoInputsTable.jobUid, jobUids), isNull(pgOcrVideoInputsTable.rawInputDeletedAt)));
      await tx
        .update(pgOcrResultArtifactsTable)
        .set({ deletedAt: storagePurgedAt, updatedAt: storagePurgedAt })
        .where(and(inArray(pgOcrResultArtifactsTable.jobUid, jobUids), isNull(pgOcrResultArtifactsTable.deletedAt)));
      await tx
        .update(pgOcrJobsTable)
        .set({ storagePurgedAt, updatedAt: storagePurgedAt })
        .where(
          and(
            inArray(pgOcrJobsTable.uid, jobUids),
            lt(pgOcrJobsTable.purgeAfter, storagePurgedAt),
            isNull(pgOcrJobsTable.storagePurgedAt),
          ),
        );
    }),
  );
}

export async function markOcrTaskDeadLetter(
  env: Pick<Env, "HYPERDRIVE">,
  value: unknown,
  options: OcrRepositoryOptions = {},
): Promise<void> {
  const task = parseOcrTaskMessage(value);
  await withOcrDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      if (task.type === "ocr.student_detail_video.recognize.v1") {
        const completedAt = new Date();
        const videos = await tx
          .update(pgOcrVideoInputsTable)
          .set({
            status: "failed",
            lastErrorCode: "queue_retries_exhausted",
            lastErrorMessage: "처리 재시도 횟수를 초과했어요",
            rawInputPurgeAfter: new Date(completedAt.getTime() + OCR_VIDEO_RAW_INPUT_GRACE_MS),
            completedAt,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(pgOcrVideoInputsTable.jobUid, task.taskUid),
              eq(pgOcrVideoInputsTable.generation, task.generation),
              notInArray(pgOcrVideoInputsTable.status, ["succeeded", "failed", "cancelled"]),
            ),
          )
          .returning({ jobUid: pgOcrVideoInputsTable.jobUid });
        if (videos[0]) {
          await tx
            .update(pgOcrJobsTable)
            .set({ status: "failed", failedImages: 1, completedAt, updatedAt: completedAt })
            .where(
              and(
                eq(pgOcrJobsTable.uid, task.taskUid),
                eq(pgOcrJobsTable.generation, task.generation),
                notInArray(pgOcrJobsTable.status, ["review_ready", "failed", "cancelled", "expired"]),
              ),
            );
        }
        return;
      }
      if (task.type === "ocr.image.recognize.v1") {
        const completedAt = new Date();
        const images = await tx
          .update(pgOcrImagesTable)
          .set({
            status: "failed",
            lastErrorCode: "queue_retries_exhausted",
            lastErrorMessage: "처리 재시도 횟수를 초과했어요",
            completedAt,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(pgOcrImagesTable.uid, task.taskUid),
              eq(pgOcrImagesTable.generation, task.generation),
              notInArray(pgOcrImagesTable.status, ["succeeded", "failed", "cancelled"]),
            ),
          )
          .returning({ jobUid: pgOcrImagesTable.jobUid });
        const jobUid = images[0]?.jobUid;
        if (jobUid) {
          await updateJobCounts(tx, jobUid);
          await finalizeIfTerminal(tx, jobUid, task.generation);
        }
        return;
      }
      const completedAt = new Date();
      await tx
        .update(pgOcrJobsTable)
        .set({ status: "failed", completedAt, updatedAt: completedAt })
        .where(
          and(
            eq(pgOcrJobsTable.uid, task.taskUid),
            eq(pgOcrJobsTable.generation, task.generation),
            notInArray(pgOcrJobsTable.status, ["review_ready", "failed", "cancelled", "expired"]),
          ),
        );
    }),
  );
}

async function getOwnedJobRow(db: OcrDatabase, userId: number, jobUid: string, lock = false) {
  const query = db
    .select()
    .from(pgOcrJobsTable)
    .where(
      and(eq(pgOcrJobsTable.uid, jobUid), eq(pgOcrJobsTable.userId, userId), gt(pgOcrJobsTable.purgeAfter, new Date())),
    )
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  return rows[0] ?? null;
}

async function readOcrUploadQuota(db: OcrDatabase, userId: number): Promise<OcrUploadQuota> {
  const now = new Date();
  const submittedSince = new Date(now.getTime() - OCR_QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const reservationSince = new Date(now.getTime() - OCR_UPLOAD_EXPIRES_SECONDS * 1000);
  const [submittedJobs, uploadReservations] = await Promise.all([
    db
      .select({ totalImages: pgOcrJobsTable.totalImages, submittedAt: pgOcrJobsTable.submittedAt })
      .from(pgOcrJobsTable)
      .where(
        and(
          eq(pgOcrJobsTable.userId, userId),
          eq(pgOcrJobsTable.jobKind, "item_inventory_images_v1"),
          gt(pgOcrJobsTable.submittedAt, submittedSince),
        ),
      ),
    db
      .select({ totalImages: pgOcrJobsTable.totalImages, createdAt: pgOcrJobsTable.createdAt })
      .from(pgOcrJobsTable)
      .where(
        and(
          eq(pgOcrJobsTable.userId, userId),
          eq(pgOcrJobsTable.jobKind, "item_inventory_images_v1"),
          isNull(pgOcrJobsTable.submittedAt),
          eq(pgOcrJobsTable.status, "uploading"),
          gt(pgOcrJobsTable.createdAt, reservationSince),
        ),
      ),
  ]);
  const usages = [
    ...submittedJobs.flatMap((job) =>
      job.submittedAt
        ? [
            {
              totalImages: job.totalImages,
              releasesAt: new Date(job.submittedAt.getTime() + OCR_QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000),
            },
          ]
        : [],
    ),
    ...uploadReservations.map((job) => ({
      totalImages: job.totalImages,
      releasesAt: new Date(job.createdAt.getTime() + OCR_UPLOAD_EXPIRES_SECONDS * 1000),
    })),
  ];
  const used = usages.reduce((sum, usage) => sum + usage.totalImages, 0);
  const nextAvailableAt = usages.reduce<Date | null>(
    (earliest, usage) => (!earliest || usage.releasesAt < earliest ? usage.releasesAt : earliest),
    null,
  );
  return {
    limit: OCR_ROLLING_IMAGE_LIMIT,
    used,
    remaining: Math.max(0, OCR_ROLLING_IMAGE_LIMIT - used),
    nextAvailableAt: nextAvailableAt ? toIso(nextAvailableAt) : null,
  };
}

async function readOcrVideoUploadQuota(db: OcrDatabase, userId: number): Promise<OcrUploadQuota> {
  const now = new Date();
  const createdSince = new Date(now.getTime() - OCR_QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const jobs = await db
    .select({ createdAt: pgOcrJobsTable.createdAt })
    .from(pgOcrJobsTable)
    .where(
      and(
        eq(pgOcrJobsTable.userId, userId),
        eq(pgOcrJobsTable.jobKind, "student_detail_video_v1"),
        gt(pgOcrJobsTable.createdAt, createdSince),
      ),
    );
  const nextAvailableAt = jobs.reduce<Date | null>((earliest, job) => {
    const releasesAt = new Date(job.createdAt.getTime() + OCR_QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return !earliest || releasesAt < earliest ? releasesAt : earliest;
  }, null);
  return {
    limit: OCR_ROLLING_VIDEO_LIMIT,
    used: jobs.length,
    remaining: Math.max(0, OCR_ROLLING_VIDEO_LIMIT - jobs.length),
    nextAvailableAt: nextAvailableAt ? toIso(nextAvailableAt) : null,
  };
}

function applyQuotaUsage(quota: OcrUploadQuota, usageCount: number, reservationExpiresAt: string): OcrUploadQuota {
  const used = quota.used + usageCount;
  const nextAvailableAt =
    quota.nextAvailableAt && quota.nextAvailableAt < reservationExpiresAt
      ? quota.nextAvailableAt
      : reservationExpiresAt;
  return { ...quota, used, remaining: Math.max(0, quota.limit - used), nextAvailableAt };
}

async function listImageRows(db: OcrDatabase, jobUid: string): Promise<OcrImageRow[]> {
  return db
    .select()
    .from(pgOcrImagesTable)
    .where(eq(pgOcrImagesTable.jobUid, jobUid))
    .orderBy(asc(pgOcrImagesTable.id));
}

async function insertAttempt(
  db: OcrDatabase,
  task: OcrTaskMessage,
  attemptUid: string,
  workerId: string,
  queueAttempts: number,
) {
  await db.insert(pgOcrAttemptsTable).values({
    uid: attemptUid,
    taskType: task.type,
    taskUid: task.taskUid,
    generation: task.generation,
    workerId,
    status: "processing",
    queueAttempts,
  });
}

async function insertOutbox(db: OcrDatabase, task: OcrTaskMessage) {
  await db
    .insert(pgOcrOutboxTable)
    .values({
      uid: nanoid(16),
      eventType: task.type,
      aggregateUid: task.taskUid,
      generation: task.generation,
      payload: task,
    })
    .onConflictDoNothing({
      target: [pgOcrOutboxTable.eventType, pgOcrOutboxTable.aggregateUid, pgOcrOutboxTable.generation],
    });
}

async function readJobImageCounts(db: OcrDatabase, jobUid: string) {
  const images = await db
    .select({ status: pgOcrImagesTable.status })
    .from(pgOcrImagesTable)
    .where(eq(pgOcrImagesTable.jobUid, jobUid));
  return images.reduce(
    (counts, image) => {
      if (image.status === "succeeded") counts.succeeded += 1;
      if (image.status === "failed") counts.failed += 1;
      if (!["succeeded", "failed", "cancelled"].includes(image.status)) counts.active += 1;
      return counts;
    },
    { active: 0, succeeded: 0, failed: 0 },
  );
}

async function updateJobCounts(db: OcrDatabase, jobUid: string) {
  const counts = await readJobImageCounts(db, jobUid);
  await db
    .update(pgOcrJobsTable)
    .set({ completedImages: counts.succeeded, failedImages: counts.failed, updatedAt: new Date() })
    .where(eq(pgOcrJobsTable.uid, jobUid));
}

async function finalizeIfTerminal(db: OcrDatabase, jobUid: string, generation: number) {
  const state = await readJobImageCounts(db, jobUid);
  if (state.active > 0) return;
  if (state.succeeded === 0) {
    const completedAt = new Date();
    await db
      .update(pgOcrJobsTable)
      .set({ status: "failed", completedAt, updatedAt: completedAt })
      .where(
        and(
          eq(pgOcrJobsTable.uid, jobUid),
          notInArray(pgOcrJobsTable.status, ["review_ready", "cancelled", "expired"]),
        ),
      );
    return;
  }
  await insertOutbox(db, { type: "ocr.job.finalize.v1", taskUid: jobUid, generation });
  await db
    .update(pgOcrJobsTable)
    .set({ status: "finalizing", updatedAt: new Date() })
    .where(and(eq(pgOcrJobsTable.uid, jobUid), inArray(pgOcrJobsTable.status, ["queued", "processing", "finalizing"])));
}

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= OCR_SERIALIZABLE_RETRY_LIMIT || getPostgresErrorCode(error) !== "40001") throw error;
    }
  }
}

function getPostgresErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth += 1) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function withOcrDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  options: OcrRepositoryOptions,
  operation: (db: NodePgDatabase) => Promise<T>,
) {
  return withPostgresClient(
    env,
    (client) => operation(drizzle(client)),
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
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

function createR2Url(
  env: Env,
  key: string,
  method: "GET" | "HEAD" | "PUT",
  expiresSeconds: number,
  signedHeaders?: Record<string, string>,
): Promise<string> {
  assertR2PresignConfig(env);
  return createR2PresignedUrl({
    accountId: env.OCR_R2_ACCOUNT_ID,
    accessKeyId: env.OCR_R2_ACCESS_KEY_ID,
    secretAccessKey: env.OCR_R2_SECRET_ACCESS_KEY,
    bucket: env.OCR_R2_BUCKET_NAME,
    key,
    method,
    expiresSeconds,
    signedHeaders,
  });
}

function sha256HexToBase64(value: string): string {
  const bytes = value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16));
  if (bytes?.length !== 32) throw new Error("SHA-256 값을 확인해주세요");
  return btoa(String.fromCharCode(...bytes));
}

async function deleteR2Objects(bucket: R2Bucket, objectKeys: string[]): Promise<void> {
  for (let offset = 0; offset < objectKeys.length; offset += 1000) {
    await bucket.delete(objectKeys.slice(offset, offset + 1000));
  }
}

function getOcrObjectStage(env: Pick<Env, "STAGE">): string {
  return (env.STAGE ?? "local").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
