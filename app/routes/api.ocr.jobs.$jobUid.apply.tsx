import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OcrPublicError, toPublicOcrError } from "~/domain/ocr";
import {
  buildOcrInventoryReview,
  evaluateOcrInventoryReview,
  getOcrReviewCell,
  type OcrCellPatch,
  type OcrInventoryReviewEvaluation,
  parseOcrCellPatches,
} from "~/domain/ocr-inventory-review";
import { buildOcrInventoryCatalogResources } from "~/domain/ocr-resource-identity";
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

  try {
    const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
    if (job?.status !== "review_ready") throw new OcrPublicError("검토할 수 있는 인식 결과가 없어요");

    const existing = await getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", job.uid);
    if (existing?.status === "applied") {
      return data({ application: toApplication(existing), alreadyApplied: true });
    }
    if (existing) throw new OcrPublicError("이미 처리 중인 인식 결과예요");

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
      });
      return data(
        { application: toApplication(applied.draft), alreadyApplied: applied.alreadyApplied },
        { status: applied.alreadyApplied ? 200 : 201 },
      );
    }

    const requestBody = await request.json().catch(() => null);
    if (hasOwn(requestBody, "items")) {
      throw new OcrPublicError("이 인식 결과는 현재 검토 화면에서 반영할 수 없어요");
    }
    if (!hasOwn(requestBody, "cells")) {
      throw new OcrPublicError("반영할 셀을 선택해주세요");
    }
    return await applyCellReview(env, sensei.id, job, requestBody);
  } catch (error) {
    const publicError = toPublicOcrError(error, "인식 결과를 반영하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!publicError.expected) logger.error("OCR job application failed", error);
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
  if (!body) throw new OcrPublicError("반영할 셀을 확인해주세요");
  if (!Number.isSafeInteger(body.resultGeneration) || (body.resultGeneration as number) !== job.generation) {
    throw new OcrPublicError("인식 결과가 최신 상태가 아니에요. 결과를 새로고침해 주세요", 409);
  }
  const review = buildOcrInventoryReview(job.result, job.images);
  if (review.reviewMode !== "cells") {
    throw new OcrPublicError("인식 결과를 확인하지 못했어요. 새로 업로드해 주세요.");
  }
  let patches: OcrCellPatch[];
  try {
    patches = parseOcrCellPatches(body.cells);
  } catch {
    throw new OcrPublicError("반영할 셀 정보를 확인해주세요");
  }
  for (const patch of patches) {
    if (!getOcrReviewCell(review, patch)) throw new OcrPublicError("존재하지 않는 셀은 반영할 수 없어요");
  }

  const resources = await getItemCatalogResources(env);
  const catalogUids = new Set(buildOcrInventoryCatalogResources(resources).map((resource) => resource.inventoryUid));
  for (const patch of patches) {
    if (patch.itemUid && !catalogUids.has(patch.itemUid)) {
      throw new OcrPublicError("현재 아이템 카탈로그에 없는 아이템은 반영할 수 없어요");
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
      throw new OcrPublicError("안전하게 반영할 수 있는 인식 항목이 없어요");
    }
    throw new OcrPublicError("변경된 수량이 없어요");
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
