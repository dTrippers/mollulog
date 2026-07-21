import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OCR_CANDIDATE_SELECTION_LIMIT } from "~/domain/ocr";
import { getItemCatalogResourceDescriptionMap, getItemCatalogResourceMap } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getSyncDraftBySourceRef } from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });
  const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
  if (!job) return data({ error: "OCR 작업을 찾을 수 없어요" }, { status: 404 });

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
