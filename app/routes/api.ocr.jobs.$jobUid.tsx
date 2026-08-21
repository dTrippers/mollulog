import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { buildOcrInventoryReview } from "~/domain/ocr-inventory-review";
import { parseStudentDetailImagesResult } from "~/domain/student-image-ocr";
import { parseStudentDetailVideoResult } from "~/domain/student-video-ocr";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResourceMap } from "~/models/item-catalog";
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

  if (job.jobKind === "student_detail_video_v1" || job.jobKind === "student_detail_images_v1") {
    let result = null;
    if (job.result) {
      try {
        result =
          job.jobKind === "student_detail_video_v1"
            ? parseStudentDetailVideoResult(job.result)
            : parseStudentDetailImagesResult(job.result);
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

  if (job.status !== "review_ready") {
    return data({
      ...job,
      result: null,
      cells: [],
      currentQuantities: {},
      application: null,
    });
  }

  const review = buildOcrInventoryReview(job.result, job.images);
  if (review.reviewMode === "cells") {
    const conflictImageUids = getConflictImageUids(job.result, review.cells);
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
      conflictImageUids,
      application: draft ? { status: draft.status, appliedAt: draft.appliedAt } : null,
    });
  }

  const draft = await getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", job.uid);
  return data({
    ...job,
    result: null,
    cells: [],
    reviewError: true as const,
    currentQuantities: {},
    application: draft ? { status: draft.status, appliedAt: draft.appliedAt } : null,
  });
};

function getConflictImageUids(result: unknown, cells: Array<{ imageUid: string; filename: string }>): string[] {
  if (!result || typeof result !== "object") return [];
  const items = (result as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const conflictFilenames = new Set(
    items.flatMap((item) => {
      if (!item || typeof item !== "object" || (item as { status?: unknown }).status === "recognized") return [];
      const sourceImages = (item as { source_images?: unknown }).source_images;
      return Array.isArray(sourceImages)
        ? sourceImages.filter((filename): filename is string => typeof filename === "string")
        : [];
    }),
  );
  return [...new Set(cells.filter((cell) => conflictFilenames.has(cell.filename)).map((cell) => cell.imageUid))];
}
