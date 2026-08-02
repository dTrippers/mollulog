import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OCR_CANDIDATE_SELECTION_LIMIT } from "~/domain/ocr";
import { buildOcrInventoryReview } from "~/domain/ocr-inventory-review";
import { parseStudentDetailVideoResult } from "~/domain/student-video-ocr";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResourceDescriptionMap, getItemCatalogResourceMap } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import { getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.ocr.jobs.detail", jobUid: params.jobUid });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });
  const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
  if (!job) return data({ error: "OCR 작업을 찾을 수 없어요" }, { status: 404 });

  if (job.jobKind === "student_detail_video_v1") {
    let result = null;
    if (job.result) {
      try {
        result = parseStudentDetailVideoResult(job.result);
      } catch (error) {
        logger.error("Stored student video OCR result is invalid", error);
        return data({ error: "인식 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
      }
    }
    if (job.status !== "review_ready" || !result) {
      return data({
        ...job,
        result,
        currentStudentStates: {},
        studentCatalog: {},
        application: null,
      });
    }

    const resultStudentUids = [...new Set(result.students.map(({ studentUid }) => studentUid))];
    const [recruitedStudents, relationshipLevels, draft, studentsMap] = await Promise.all([
      getRecruitedStudents(env, sensei.id, resultStudentUids),
      getRelationshipLevels(env, sensei.id, resultStudentUids),
      getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", job.uid),
      getAllStudentsMap(env, true),
    ]);
    const relationshipByStudentUid = new Map(
      relationshipLevels.map((relationship) => [relationship.studentId, relationship.currentLevel]),
    );
    const currentStudentStates: Record<
      string,
      Partial<RecruitedStudent> & { studentUid: string; bond: number | null }
    > = Object.fromEntries(
      recruitedStudents.map((student) => [
        student.studentUid,
        { ...student, bond: relationshipByStudentUid.get(student.studentUid) ?? null },
      ]),
    );
    for (const relationship of relationshipLevels) {
      currentStudentStates[relationship.studentId] ??= {
        studentUid: relationship.studentId,
        bond: relationship.currentLevel,
      };
    }
    return data({
      ...job,
      result,
      currentStudentStates,
      studentCatalog: Object.fromEntries(
        (result?.students ?? []).flatMap(({ studentUid }) => {
          const student = studentsMap[studentUid];
          return student
            ? [[studentUid, { uid: student.uid, name: student.name, initialTier: student.initialTier }]]
            : [];
        }),
      ),
      application: draft ? { status: draft.status, appliedAt: draft.appliedAt } : null,
    });
  }

  const review = buildOcrInventoryReview(job.result, job.images);
  if (review.reviewMode === "cells") {
    const currentItemUids = [...new Set(review.cells.flatMap(({ itemUid }) => (itemUid ? [itemUid] : [])))];
    const [currentQuantities, draft, catalogResourceMap] = await Promise.all([
      getUserResourceInventoryMapByItemUids(env, sensei.id, currentItemUids),
      getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", job.uid),
      getItemCatalogResourceMap(env),
    ]);
    return data({
      ...job,
      result: null,
      reviewMode: "cells" as const,
      cells: review.cells.map(({ observationId: _observationId, candidates: _candidates, itemUid, ...cell }) => {
        const resource = itemUid ? catalogResourceMap[itemUid] : undefined;
        return {
          ...cell,
          itemUid,
          resource: itemUid
            ? resource
              ? {
                  uid: itemUid,
                  assetUid: resource.uid,
                  resourceType: resource.type,
                  name: resource.name,
                  rarity: resource.rarity,
                }
              : { uid: itemUid, unavailable: true }
            : null,
          currentQuantity: itemUid ? (currentQuantities[itemUid] ?? 0) : null,
        };
      }),
      currentQuantities,
      resourceRarities: {},
      resourceDescriptions: {},
      application: draft ? { status: draft.status, appliedAt: draft.appliedAt } : null,
    });
  }

  const candidateUids = [...new Set(getResultCandidateUids(job.result))];
  const itemUids = [...new Set([...getResultItemUids(job.result), ...candidateUids])];
  const [currentQuantities, draft, catalogResourceMap, resourceDescriptions] = await Promise.all([
    getUserResourceInventoryMapByItemUids(env, sensei.id, itemUids),
    getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", job.uid),
    getItemCatalogResourceMap(env),
    getItemCatalogResourceDescriptionMap(candidateUids),
  ]);
  return data({
    ...job,
    reviewMode: "legacy" as const,
    cells: [],
    reviewModeReason: review.reason,
    currentQuantities,
    resourceRarities: Object.fromEntries(
      itemUids.flatMap((itemUid) => {
        const resource = catalogResourceMap[itemUid];
        return resource ? [[itemUid, resource.rarity]] : [];
      }),
    ),
    resourceDescriptions,
    application: draft ? { status: draft.status, appliedAt: draft.appliedAt } : null,
  });
};

function getResultItemUids(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const items = (result as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const itemUid = (item as { resource_uid?: unknown }).resource_uid;
    return typeof itemUid === "string" && itemUid ? [itemUid] : [];
  });
}

function getResultCandidateUids(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const images = (result as { images?: unknown }).images;
  if (!Array.isArray(images)) return [];

  return images.flatMap((image) => {
    if (!image || typeof image !== "object") return [];
    const observations = (image as { observations?: unknown }).observations;
    if (!Array.isArray(observations)) return [];
    return observations.flatMap((observation) => {
      if (!observation || typeof observation !== "object") return [];
      const observationRecord = observation as { candidates?: unknown; resource_uid?: unknown };
      if (typeof observationRecord.resource_uid === "string" && observationRecord.resource_uid) return [];
      const candidates = observationRecord.candidates;
      if (!Array.isArray(candidates)) return [];
      return candidates.slice(0, OCR_CANDIDATE_SELECTION_LIMIT).flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const uid = (candidate as { uid?: unknown }).uid;
        return typeof uid === "string" && uid ? [uid] : [];
      });
    });
  });
}
