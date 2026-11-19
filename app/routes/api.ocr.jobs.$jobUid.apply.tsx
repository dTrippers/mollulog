import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OcrPublicError, rejectOcrApply, toPublicOcrError } from "~/domain/ocr";
import {
  buildOcrInventoryReview,
  evaluateOcrInventoryReview,
  getOcrReviewCell,
  normalizeOcrInventoryReviewResourceUids,
  type OcrCellPatch,
  type OcrInventoryReviewEvaluation,
  parseOcrCellPatches,
} from "~/domain/ocr-inventory-review";
import { buildOcrInventoryCatalogResources } from "~/domain/ocr-resource-identity";
import { StudentStateMergeConflictError } from "~/domain/student-state-errors";
import { buildStudentImageSyncDraftEntries, buildStudentVideoSyncDraftEntries } from "~/domain/student-video-apply";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getAllStudentsMap } from "~/models/student";
import { createAndApplySyncDraft, getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.ocr.jobs.apply", jobUid: params.jobUid });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });

  let jobKind: string | undefined;
  try {
    const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
    jobKind = job?.jobKind;
    if (!job) throw rejectOcrApply("검토할 수 있는 인식 결과가 없어요", "job_not_found");
    if (job.status !== "review_ready") {
      throw rejectOcrApply("검토할 수 있는 인식 결과가 없어요", "job_not_review_ready");
    }

    const existing = await getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", job.uid);
    if (existing?.status === "applied") {
      return data({ application: toApplication(existing), alreadyApplied: true });
    }
    if (existing) throw rejectOcrApply("이미 처리 중인 인식 결과예요", "application_in_progress");

    if (job.jobKind === "student_detail_video_v1" || job.jobKind === "student_detail_images_v1") {
      const studentsMap = await getAllStudentsMap(env, true);
      const entries =
        job.jobKind === "student_detail_video_v1"
          ? buildStudentVideoSyncDraftEntries(job.result, await request.json(), new Set(Object.keys(studentsMap)))
          : buildStudentImageSyncDraftEntries(job.result, await request.json(), new Set(Object.keys(studentsMap)));
      const applied = await createAndApplySyncDraft(env, sensei.id, {
        source: "first_party_ocr",
        sourceRef: job.uid,
        type: "student_state",
        toolName: job.jobKind === "student_detail_video_v1" ? "학생 성장도 영상 인식" : "학생 성장도 이미지 인식",
        toolVersion: job.versions?.model,
        catalogVersion: job.versions?.catalog,
        entries,
      }).catch((error) => {
        // OCR confirms only some fields, so values left stored can conflict without a concurrent edit.
        if (error instanceof StudentStateMergeConflictError) {
          throw rejectOcrApply(
            "학생 성장도 값이 현재 성장 규칙에 맞지 않아요",
            "stored_state_conflict",
            error.fields.length > 0 ? error.fields.join(",") : undefined,
          );
        }
        throw error;
      });
      return data(
        { application: toApplication(applied.draft), alreadyApplied: applied.alreadyApplied },
        { status: applied.alreadyApplied ? 200 : 201 },
      );
    }

    const requestBody = await request.json().catch(() => null);
    if (hasOwn(requestBody, "items")) {
      throw rejectOcrApply("이 인식 결과는 현재 검토 화면에서 반영할 수 없어요", "unsupported_item_payload");
    }
    if (!hasOwn(requestBody, "cells")) {
      throw rejectOcrApply("반영할 셀을 선택해주세요", "cells_missing");
    }
    return await applyCellReview(env, sensei.id, job, requestBody);
  } catch (error) {
    const publicError = toPublicOcrError(error, "인식 결과를 반영하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!publicError.expected) {
      logger.error("OCR job application failed", error);
    } else {
      // Only fixed codes and field names: the request body, recognized values and student state stay out of logs.
      const details = error instanceof OcrPublicError ? error.details : {};
      logger.warn("OCR job application rejected", {
        jobKind,
        status: publicError.status,
        reason: details.reason,
        field: details.field,
      });
    }
    return data({ error: publicError.message }, { status: publicError.status });
  }
};

async function applyCellReview(
  env: Env,
  userId: number,
  job: NonNullable<Awaited<ReturnType<typeof getOcrJob>>>,
  requestBody: unknown,
) {
  const body = asRecord(requestBody);
  if (!body) throw rejectOcrApply("반영할 셀을 확인해주세요", "cells_invalid");
  if (!Number.isSafeInteger(body.resultGeneration) || (body.resultGeneration as number) !== job.generation) {
    throw new OcrPublicError("인식 결과가 최신 상태가 아니에요. 결과를 새로고침해 주세요", 409, {
      reason: "result_generation_stale",
    });
  }
  const resources = buildOcrInventoryCatalogResources(await getItemCatalogResources(env));
  const review = normalizeOcrInventoryReviewResourceUids(buildOcrInventoryReview(job.result, job.images), resources);
  if (review.reviewMode !== "cells") {
    throw rejectOcrApply("인식 결과를 확인하지 못했어요. 새로 업로드해 주세요.", "review_mode_unsupported");
  }
  let patches: OcrCellPatch[];
  try {
    patches = parseOcrCellPatches(body.cells);
  } catch {
    throw rejectOcrApply("반영할 셀 정보를 확인해주세요", "cells_invalid");
  }
  for (const patch of patches) {
    if (!getOcrReviewCell(review, patch)) throw rejectOcrApply("존재하지 않는 셀은 반영할 수 없어요", "cell_not_found");
  }

  const catalogUids = new Set(resources.map((resource) => resource.inventoryUid));
  for (const patch of patches) {
    if (patch.itemUid && !catalogUids.has(patch.itemUid)) {
      throw rejectOcrApply("현재 아이템 카탈로그에 없는 아이템은 반영할 수 없어요", "item_not_in_catalog");
    }
  }

  const itemUids = [
    ...new Set([
      ...review.cells.flatMap(({ itemUid }) => (itemUid ? [itemUid] : [])),
      ...patches.flatMap(({ itemUid }) => (itemUid ? [itemUid] : [])),
    ]),
  ].filter((itemUid) => catalogUids.has(itemUid));
  const currentQuantities = await getUserResourceInventoryMapByItemUids(env, userId, itemUids);
  const evaluation = evaluateOcrInventoryReview(review, patches, catalogUids, currentQuantities);
  if (evaluation.changedEntries.length === 0) {
    if (evaluation.safeEntries.length === 0) {
      throw rejectOcrApply("안전하게 반영할 수 있는 인식 항목이 없어요", "no_safe_entries");
    }
    throw rejectOcrApply("변경된 수량이 없어요", "no_changed_quantities");
  }

  const applied = await createAndApplySyncDraft(env, userId, {
    source: "first_party_ocr",
    sourceRef: job.uid,
    type: "item_inventory",
    toolName: "아이템 스크린샷 인식",
    toolVersion: job.versions?.model,
    catalogVersion: job.versions?.catalog,
    entries: evaluation.changedEntries.map((entry) => ({
      entryKey: entry.itemUid,
      value: entry.quantity,
      meta: {
        reviewReasons: entry.reviewReasons,
        quantityExact: entry.quantityExact,
        observedQuantities: entry.observedQuantities,
        sourceImages: entry.sourceImages,
        imageUids: entry.imageUids,
        cells: entry.cells,
        candidateScore: entry.candidateScore,
        selectionSource: entry.selectionSource,
        resourceSelectedManually: entry.selectionSource === "catalog_search",
        resource_selected_manually: entry.selectionSource === "catalog_search",
        modelVersion: job.versions?.model,
        catalogVersion: job.versions?.catalog,
      },
    })),
  });

  const summary = toReviewSummary(evaluation);
  return data(
    {
      application: toApplication(applied.draft),
      alreadyApplied: applied.alreadyApplied,
      summary,
      reviewSummary: summary,
    },
    { status: applied.alreadyApplied ? 200 : 201 },
  );
}

function toReviewSummary(evaluation: OcrInventoryReviewEvaluation) {
  return {
    applicableChanged: evaluation.changedEntries.length,
    changed: evaluation.changedEntries.length,
    unchangedSafe: evaluation.unchangedEntries.length,
    unchanged: evaluation.unchangedEntries.length,
    omitted: evaluation.omittedCells.length,
    omittedCells: evaluation.omittedCells,
    duplicateUids: evaluation.duplicateUids,
    appliedItemUids: evaluation.changedEntries.map((entry) => entry.itemUid),
    unchangedItemUids: evaluation.unchangedEntries.map((entry) => entry.itemUid),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasOwn(value: unknown, key: string): boolean {
  const record = asRecord(value);
  return record ? Object.hasOwn(record, key) : false;
}

function toApplication(draft: { status: string; appliedAt: string | null }) {
  return { status: draft.status, appliedAt: draft.appliedAt };
}
