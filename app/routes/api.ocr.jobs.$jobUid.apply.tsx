import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OcrPublicError, toPublicOcrError } from "~/domain/ocr";
import { type CandidateEvidence, type CandidateSelection, findCandidateEvidence } from "~/domain/ocr-candidate";
import { buildStudentVideoSyncDraftEntries } from "~/domain/student-video-apply";
import { getLogger } from "~/lib/observability.server";
import { getOcrJob } from "~/models/ocr-job";
import { getAllStudentsMap } from "~/models/student";
import { createAndApplySyncDraft, getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";

type ApplyItem = { itemUid: string; quantity: number; candidateSelection?: CandidateSelection };
type ResultItem = {
  resource_uid: string;
  status?: unknown;
  quantity_exact?: unknown;
  observed_quantities?: unknown;
  source_images?: unknown;
};

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

    if (job.jobKind === "student_detail_video_v1") {
      const studentsMap = await getAllStudentsMap(env, true);
      const entries = buildStudentVideoSyncDraftEntries(
        job.result,
        await request.json(),
        new Set(Object.keys(studentsMap)),
      );
      const applied = await createAndApplySyncDraft(env, sensei.id, {
        source: "first_party_ocr",
        sourceRef: job.uid,
        type: "student_state",
        toolName: "학생 성장도 영상 인식",
        toolVersion: job.versions?.model,
        catalogVersion: job.versions?.catalog,
        entries,
      });
      return data(
        { application: toApplication(applied.draft), alreadyApplied: applied.alreadyApplied },
        { status: applied.alreadyApplied ? 200 : 201 },
      );
    }

    const resultItems = getResultItems(job.result);
    const resultItemsByUid = new Map(resultItems.map((item) => [item.resource_uid, item]));
    const submittedItems = parseApplyItems(await request.json());
    const candidateEvidenceByUid = new Map<string, CandidateEvidence>();
    for (const item of submittedItems) {
      if (item.candidateSelection) {
        const evidence = findCandidateEvidence(job.result, item.itemUid, item.candidateSelection);
        if (!evidence) throw new OcrPublicError("해당 셀의 인식 후보가 아닌 아이템은 반영할 수 없어요");
        candidateEvidenceByUid.set(item.itemUid, evidence);
      } else if (!resultItemsByUid.has(item.itemUid)) {
        throw new OcrPublicError("인식 결과에 없는 아이템은 반영할 수 없어요");
      }
    }

    const currentQuantities = await getUserResourceInventoryMapByItemUids(
      env,
      sensei.id,
      submittedItems.map((item) => item.itemUid),
    );
    const changedItems = submittedItems.filter((item) => item.quantity !== (currentQuantities[item.itemUid] ?? 0));
    if (changedItems.length === 0) throw new OcrPublicError("변경된 수량이 없어요");

    const applied = await createAndApplySyncDraft(env, sensei.id, {
      source: "first_party_ocr",
      sourceRef: job.uid,
      type: "item_inventory",
      toolName: "아이템 스크린샷 인식",
      toolVersion: job.versions?.model,
      catalogVersion: job.versions?.catalog,
      entries: changedItems.map((item) => {
        const candidateEvidence = candidateEvidenceByUid.get(item.itemUid);
        const resultItem = candidateEvidence ? undefined : resultItemsByUid.get(item.itemUid);
        return {
          entryKey: item.itemUid,
          value: item.quantity,
          meta: {
            reviewReasons: resultItem
              ? resultItem.status === "conflict"
                ? ["quantity_conflict"]
                : []
              : [
                  "resource_selected_manually",
                  ...(candidateEvidence?.quantity === item.quantity ? [] : ["quantity_entered_manually"]),
                ],
            quantityExact: resultItem
              ? resultItem.quantity_exact === true
              : candidateEvidence?.quantityExact === true && candidateEvidence.quantity === item.quantity,
            observedQuantities: resultItem
              ? Array.isArray(resultItem.observed_quantities)
                ? resultItem.observed_quantities
                : []
              : candidateEvidence?.quantity == null
                ? []
                : [candidateEvidence.quantity],
            sourceImages: resultItem
              ? Array.isArray(resultItem.source_images)
                ? resultItem.source_images
                : []
              : candidateEvidence
                ? [candidateEvidence.imageFilename]
                : [],
            observationId: candidateEvidence?.observationId,
            candidateScore: candidateEvidence?.candidateScore,
            modelVersion: job.versions?.model,
            catalogVersion: job.versions?.catalog,
          },
        };
      }),
    });
    return data(
      { application: toApplication(applied.draft), alreadyApplied: applied.alreadyApplied },
      { status: applied.alreadyApplied ? 200 : 201 },
    );
  } catch (error) {
    const publicError = toPublicOcrError(error, "인식 결과를 반영하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!publicError.expected) logger.error("OCR job application failed", error);
    return data({ error: publicError.message }, { status: publicError.status });
  }
};

function parseApplyItems(value: unknown): ApplyItem[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) {
    throw new OcrPublicError("반영할 아이템을 선택해주세요");
  }
  const items = (value as { items: unknown[] }).items.map(parseApplyItem);
  if (items.length === 0) throw new OcrPublicError("반영할 아이템을 선택해주세요");
  if (new Set(items.map((item) => item.itemUid)).size !== items.length) {
    throw new OcrPublicError("같은 아이템이 두 번 포함되어 있어요");
  }
  return items;
}

function parseApplyItem(value: unknown): ApplyItem {
  if (!value || typeof value !== "object") throw new OcrPublicError("반영할 아이템을 확인해주세요");
  const item = value as Record<string, unknown>;
  const itemUid = typeof item.itemUid === "string" ? item.itemUid.trim() : "";
  if (!itemUid) throw new OcrPublicError("반영할 아이템을 확인해주세요");
  if (!Number.isInteger(item.quantity) || (item.quantity as number) < 0) {
    throw new OcrPublicError("수량은 0 이상의 정수여야 해요");
  }
  return {
    itemUid,
    quantity: item.quantity as number,
    candidateSelection: parseCandidateSelection(item.candidateSelection),
  };
}

function parseCandidateSelection(value: unknown): CandidateSelection | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== "object") throw new OcrPublicError("아이템 후보 선택 정보를 확인해주세요");
  const selection = value as Record<string, unknown>;
  const imageFilename = typeof selection.imageFilename === "string" ? selection.imageFilename.trim() : "";
  const observationId = typeof selection.observationId === "string" ? selection.observationId.trim() : "";
  if (!imageFilename || !observationId) throw new OcrPublicError("아이템 후보 선택 정보를 확인해주세요");
  return { imageFilename, observationId };
}

function getResultItems(result: unknown): ResultItem[] {
  if (!result || typeof result !== "object") return [];
  const items = (result as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const itemUid = (item as { resource_uid?: unknown }).resource_uid;
    return typeof itemUid === "string" && itemUid ? [{ ...(item as ResultItem), resource_uid: itemUid }] : [];
  });
}

function toApplication(draft: { status: string; appliedAt: string | null }) {
  return { status: draft.status, appliedAt: draft.appliedAt };
}
