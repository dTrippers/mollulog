import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OcrPublicError, toPublicOcrError } from "~/domain/ocr";
import { buildOcrInventoryReview, getOcrReviewCell } from "~/domain/ocr-inventory-review";
import { buildOcrInventoryCatalogResources } from "~/domain/ocr-resource-identity";
import { getLogger } from "~/lib/observability.server";
import { getItemCatalogResourceDescriptionMap, getItemCatalogResources } from "~/models/item-catalog";
import { getOcrJob } from "~/models/ocr-job";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";

type CatalogCandidate = {
  uid: string;
  assetUid: string;
  name: string;
  description?: string;
  resourceType: string;
  rarity: number;
  currentQuantity: number;
  score: number | null;
  selectionSource: "stored_recognition" | "ocr_candidate" | "catalog_search";
};

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.ocr.jobs.candidates", jobUid: params.jobUid });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });

  try {
    const imageIndex = parseIndex(new URL(request.url).searchParams.get("imageIndex"), "imageIndex");
    const position = parseIndex(new URL(request.url).searchParams.get("position"), "position");
    const searchParams = new URL(request.url).searchParams;
    const query = (searchParams.get("q") ?? searchParams.get("query") ?? searchParams.get("search"))?.trim() ?? "";
    const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
    if (!job) throw new OcrPublicError("OCR 작업을 찾을 수 없어요", 404);
    if (job.status !== "review_ready") throw new OcrPublicError("검토할 수 있는 인식 결과가 없어요");

    const review = buildOcrInventoryReview(job.result, job.images);
    if (review.reviewMode !== "cells") throw new OcrPublicError("이 인식 결과는 이전 검토 화면에서 확인해야 해요");
    const cell = getOcrReviewCell(review, { imageIndex, position });
    if (!cell) throw new OcrPublicError("검토할 셀을 찾을 수 없어요", 404);

    const resources = buildOcrInventoryCatalogResources(await getItemCatalogResources(env));
    const resourceByUid = new Map(resources.map((resource) => [resource.inventoryUid, resource]));
    if (query) {
      const normalizedQuery = query.toLocaleLowerCase();
      const matchingResources = resources
        .filter(
          (resource) =>
            resource.inventoryUid.toLocaleLowerCase().includes(normalizedQuery) ||
            resource.name.toLocaleLowerCase().includes(normalizedQuery),
        )
        .slice(0, 20);
      const matchingUids = matchingResources.map((resource) => resource.inventoryUid);
      const [currentQuantities, descriptions] = await Promise.all([
        getUserResourceInventoryMapByItemUids(env, sensei.id, matchingUids),
        getItemCatalogResourceDescriptionMap(matchingUids),
      ]);
      const candidates = matchingResources.map((resource) => ({
        uid: resource.inventoryUid,
        assetUid: resource.uid,
        name: resource.name,
        description: descriptions[resource.inventoryUid],
        resourceType: resource.type,
        rarity: resource.rarity,
        currentQuantity: currentQuantities[resource.inventoryUid] ?? 0,
        score: null,
        selectionSource: "catalog_search" as const,
      }));
      return data({
        reviewMode: "cells" as const,
        imageIndex,
        position,
        query,
        candidates,
      });
    }

    const candidates: CatalogCandidate[] = [];
    const addCandidate = (uid: string, score: number | null, selectionSource: CatalogCandidate["selectionSource"]) => {
      const resource = resourceByUid.get(uid);
      if (!resource || candidates.some((candidate) => candidate.uid === uid)) return;
      candidates.push({
        uid,
        assetUid: resource.uid,
        name: resource.name,
        resourceType: resource.type,
        rarity: resource.rarity,
        currentQuantity: 0,
        score,
        selectionSource,
      });
    };
    if (cell.itemUid) addCandidate(cell.itemUid, null, "stored_recognition");
    for (const candidate of cell.candidates) {
      addCandidate(candidate.uid, candidate.score, "ocr_candidate");
    }
    const candidateUids = candidates.map((candidate) => candidate.uid);
    const [currentQuantities, descriptions] = await Promise.all([
      getUserResourceInventoryMapByItemUids(env, sensei.id, candidateUids),
      getItemCatalogResourceDescriptionMap(candidateUids),
    ]);
    for (const candidate of candidates) {
      candidate.currentQuantity = currentQuantities[candidate.uid] ?? 0;
      candidate.description = descriptions[candidate.uid];
    }

    return data({
      reviewMode: "cells" as const,
      imageIndex,
      position,
      current: cell.itemUid
        ? resourceByUid.has(cell.itemUid)
          ? {
              uid: cell.itemUid,
              assetUid: resourceByUid.get(cell.itemUid)?.uid,
              name: resourceByUid.get(cell.itemUid)?.name,
              rarity: resourceByUid.get(cell.itemUid)?.rarity,
              resourceType: resourceByUid.get(cell.itemUid)?.type,
              description: descriptions[cell.itemUid],
              currentQuantity: currentQuantities[cell.itemUid] ?? 0,
            }
          : { uid: cell.itemUid, unavailable: true, currentQuantity: currentQuantities[cell.itemUid] ?? 0 }
        : null,
      candidates,
      quantity: cell.quantity,
      quantityExact: cell.quantityExact,
      status: cell.status,
    });
  } catch (error) {
    const publicError = toPublicOcrError(error, "아이템 후보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!publicError.expected) logger.error("OCR candidate lookup failed", error);
    return data({ error: publicError.message }, { status: publicError.status });
  }
};

function parseIndex(value: string | null, name: string): number {
  if (value === null || !/^\d+$/.test(value)) throw new OcrPublicError(`${name}을 확인해주세요`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new OcrPublicError(`${name}을 확인해주세요`);
  return parsed;
}
