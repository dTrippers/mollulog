import { OCR_CANDIDATE_SELECTION_LIMIT } from "./ocr";

/** A small subset of the image row returned by `getOcrJob`. */
export type OcrReviewImageRow = {
  uid: string;
  filename: string;
  status: string;
};

export type OcrReviewBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrReviewCandidate = {
  uid: string;
  score: number | null;
};

export type OcrReviewCellStatus = "recognized" | "quantity_failure" | "unrecognized";

export type OcrInventoryReviewCell = {
  imageIndex: number;
  position: number;
  imageUid: string;
  filename: string;
  width: number | null;
  height: number | null;
  bbox: OcrReviewBoundingBox | null;
  status: OcrReviewCellStatus;
  itemUid: string | null;
  quantity: number | null;
  quantityExact: boolean;
  quantityKnown: boolean;
  observedQuantities: number[];
  candidates: OcrReviewCandidate[];
  reasons: string[];
  /** The observation id is retained only on the server for evidence lookup. */
  observationId: string | null;
};

export type OcrInventoryReview =
  | {
      reviewMode: "cells";
      cells: OcrInventoryReviewCell[];
      reason: null;
    }
  | {
      reviewMode: "legacy";
      cells: [];
      reason: string;
    };

export type OcrCellAddress = Pick<OcrInventoryReviewCell, "imageIndex" | "position">;

export type OcrCellPatch = OcrCellAddress & {
  itemUid?: string;
  quantity?: number;
  excluded?: boolean;
};

export type OcrInventoryCellApplyRequest = {
  resultGeneration: number;
  cells: OcrCellPatch[];
};

export type OcrCellSelectionSource = "stored_recognition" | "ocr_candidate" | "catalog_search";

export type OcrEffectiveCell = OcrInventoryReviewCell & {
  effectiveItemUid: string | null;
  effectiveQuantity: number | null;
  excluded: boolean;
  patch: OcrCellPatch | null;
  selectionSource: OcrCellSelectionSource | null;
  candidateScore: number | null;
};

export type OcrReviewOmissionReason = "unresolved_item" | "unresolved_quantity" | "excluded" | "duplicate_uid";

export type OcrReviewOmittedCell = OcrCellAddress & {
  imageUid: string;
  filename: string;
  reason: OcrReviewOmissionReason;
  duplicateUid?: string;
};

export type OcrReviewSafeEntry = {
  itemUid: string;
  quantity: number;
  currentQuantity: number;
  changed: boolean;
  cells: OcrCellAddress[];
  selectionSource: OcrCellSelectionSource;
  candidateScore: number | null;
  reviewReasons: string[];
  quantityExact: boolean;
  observedQuantities: number[];
  sourceImages: string[];
  imageUids: string[];
};

export type OcrInventoryReviewEvaluation = {
  safeEntries: OcrReviewSafeEntry[];
  changedEntries: OcrReviewSafeEntry[];
  unchangedEntries: OcrReviewSafeEntry[];
  omittedCells: OcrReviewOmittedCell[];
  duplicateUids: string[];
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asSafeQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBoundingBox(value: unknown): OcrReviewBoundingBox | null {
  const record = asRecord(value);
  if (!record) return null;
  const x = asFiniteNumber(record.x);
  const y = asFiniteNumber(record.y);
  const width = asFiniteNumber(record.width);
  const height = asFiniteNumber(record.height);
  if (x === null || y === null || width === null || height === null || width < 0 || height < 0) return null;
  return { x, y, width, height };
}

function parseCandidates(value: unknown): OcrReviewCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: OcrReviewCandidate[] = [];
  const seen = new Set<string>();
  for (const candidateValue of value.slice(0, OCR_CANDIDATE_SELECTION_LIMIT)) {
    const candidate = asRecord(candidateValue);
    const uid = asNonEmptyString(candidate?.uid);
    if (!uid || seen.has(uid)) continue;
    const score = asFiniteNumber(candidate?.score);
    candidates.push({ uid, score });
    seen.add(uid);
  }
  return candidates;
}

function parseReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
}

function parseCell(
  image: RawRecord,
  imageIndex: number,
  position: number,
  imageRow: OcrReviewImageRow,
): OcrInventoryReviewCell | null {
  const observation = asRecord(Array.isArray(image.observations) ? image.observations[position] : null);
  if (!observation) return null;

  const itemUid = asNonEmptyString(observation.resource_uid);
  const quantity = asSafeQuantity(observation.quantity);
  const quantityExact = observation.quantity_exact === true;
  const quantityKnown = quantity !== null;
  const observedQuantities = Array.isArray(observation.observed_quantities)
    ? observation.observed_quantities.filter((value): value is number => asSafeQuantity(value) !== null)
    : quantity === null
      ? []
      : [quantity];
  const status: OcrReviewCellStatus =
    itemUid === null ? "unrecognized" : quantityKnown ? "recognized" : "quantity_failure";
  const observationId = asNonEmptyString(observation.observation_id);
  const width = asSafeQuantity(image.width);
  const height = asSafeQuantity(image.height);
  const reasons = parseReasons(observation.reasons);

  return {
    imageIndex,
    position,
    imageUid: imageRow.uid,
    filename: imageRow.filename,
    width,
    height,
    bbox: parseBoundingBox(observation.bbox),
    status,
    itemUid,
    quantity,
    quantityExact,
    quantityKnown,
    observedQuantities,
    candidates: parseCandidates(observation.candidates),
    reasons,
    observationId,
  };
}

/**
 * Build the only safe cell mapping we can make from a stored OCR result.
 *
 * The worker's result contains succeeded images only. The database image rows contain
 * every upload, so the result index is intentionally mapped to the succeeded rows in
 * their database order. Filenames are checked as a consistency assertion; they are
 * never used as an identity key.
 */
export function buildOcrInventoryReview(result: unknown, imageRows: OcrReviewImageRow[]): OcrInventoryReview {
  const resultRecord = asRecord(result);
  const resultImages = resultRecord?.images;
  const succeededRows = imageRows.filter((image) => image.status === "succeeded");
  if (!Array.isArray(resultImages) || resultImages.length === 0 || resultImages.length !== succeededRows.length) {
    return { reviewMode: "legacy", cells: [], reason: "result_image_mapping_unusable" };
  }

  const cells: OcrInventoryReviewCell[] = [];
  for (const [imageIndex, imageValue] of resultImages.entries()) {
    const image = asRecord(imageValue);
    const imageRow = succeededRows[imageIndex];
    const filename = asNonEmptyString(image?.filename);
    if (!image || !imageRow || filename === null || filename !== imageRow.filename) {
      return { reviewMode: "legacy", cells: [], reason: "result_image_mapping_unusable" };
    }
    if (!Array.isArray(image.observations)) {
      return { reviewMode: "legacy", cells: [], reason: "raw_observations_unusable" };
    }
    for (const [position] of image.observations.entries()) {
      const cell = parseCell(image, imageIndex, position, imageRow);
      if (!cell) return { reviewMode: "legacy", cells: [], reason: "raw_observations_unusable" };
      cells.push(cell);
    }
  }

  return { reviewMode: "cells", cells, reason: null };
}

/** Compatibility aliases make the pure parser convenient for route and focused tests. */
export const buildInventoryReview = buildOcrInventoryReview;
export const buildOcrReviewCells = buildOcrInventoryReview;

export function getOcrReviewCell(review: OcrInventoryReview, address: OcrCellAddress): OcrInventoryReviewCell | null {
  if (review.reviewMode !== "cells") return null;
  return (
    review.cells.find((cell) => cell.imageIndex === address.imageIndex && cell.position === address.position) ?? null
  );
}

export function parseOcrCellPatches(value: unknown): OcrCellPatch[] {
  const rawPatches = Array.isArray(value) ? value : asRecord(value)?.cells;
  if (!Array.isArray(rawPatches)) throw new Error("cells must be an array");
  const addresses = new Set<string>();
  return rawPatches.map((patchValue) => {
    const patch = asRecord(patchValue);
    if (!patch) throw new Error("cell patch must be an object");
    const imageIndex = patch.imageIndex;
    const position = patch.position;
    if (!Number.isSafeInteger(imageIndex) || (imageIndex as number) < 0)
      throw new Error("imageIndex must be safe integer");
    if (!Number.isSafeInteger(position) || (position as number) < 0) throw new Error("position must be safe integer");
    const addressKey = `${imageIndex}:${position}`;
    if (addresses.has(addressKey)) throw new Error("duplicate cell patch");
    addresses.add(addressKey);

    const itemUidValue = patch.itemUid;
    if (itemUidValue !== undefined && (typeof itemUidValue !== "string" || !itemUidValue.trim())) {
      throw new Error("itemUid must be a non-empty string");
    }
    const quantityValue = patch.quantity;
    if (quantityValue !== undefined && (!Number.isSafeInteger(quantityValue) || (quantityValue as number) < 0)) {
      throw new Error("quantity must be a non-negative safe integer");
    }
    const excludedValue = patch.excluded;
    if (excludedValue !== undefined && typeof excludedValue !== "boolean") {
      throw new Error("excluded must be boolean");
    }
    if (excludedValue === true && (itemUidValue !== undefined || quantityValue !== undefined)) {
      throw new Error("excluded cells cannot contain itemUid or quantity");
    }

    return {
      imageIndex: imageIndex as number,
      position: position as number,
      ...(itemUidValue === undefined ? {} : { itemUid: (itemUidValue as string).trim() }),
      ...(quantityValue === undefined ? {} : { quantity: quantityValue as number }),
      ...(excludedValue === undefined ? {} : { excluded: excludedValue }),
    };
  });
}

export function parseOcrInventoryCellApplyRequest(value: unknown): OcrInventoryCellApplyRequest {
  const record = asRecord(value);
  if (!record || !Number.isSafeInteger(record.resultGeneration) || (record.resultGeneration as number) < 1) {
    throw new Error("resultGeneration must be a positive safe integer");
  }
  return {
    resultGeneration: record.resultGeneration as number,
    cells: parseOcrCellPatches(record.cells),
  };
}

export function applyOcrCellPatches(review: OcrInventoryReview, patches: OcrCellPatch[]): OcrEffectiveCell[] {
  if (review.reviewMode !== "cells") throw new Error("cell review is unavailable");
  const patchByAddress = new Map(patches.map((patch) => [cellAddressKey(patch), patch]));
  return review.cells.map((cell) => {
    const patch = patchByAddress.get(cellAddressKey(cell)) ?? null;
    const excluded = patch?.excluded === true;
    const effectiveItemUid = patch?.itemUid ?? cell.itemUid;
    const effectiveQuantity = patch?.quantity ?? cell.quantity;
    const selection = resolveSelectionSource(cell, patch);
    return {
      ...cell,
      effectiveItemUid,
      effectiveQuantity,
      excluded,
      patch,
      selectionSource: selection.selectionSource,
      candidateScore: selection.candidateScore,
    };
  });
}

function resolveSelectionSource(
  cell: OcrInventoryReviewCell,
  patch: OcrCellPatch | null,
): { selectionSource: OcrCellSelectionSource | null; candidateScore: number | null } {
  if (!patch?.itemUid) {
    return cell.itemUid
      ? { selectionSource: "stored_recognition", candidateScore: null }
      : { selectionSource: null, candidateScore: null };
  }
  if (patch.itemUid === cell.itemUid) {
    return { selectionSource: "stored_recognition", candidateScore: null };
  }
  const candidate = cell.candidates.find(({ uid }) => uid === patch.itemUid);
  return candidate
    ? { selectionSource: "ocr_candidate", candidateScore: candidate.score }
    : { selectionSource: "catalog_search", candidateScore: null };
}

function cellAddressKey(cell: OcrCellAddress): string {
  return `${cell.imageIndex}:${cell.position}`;
}

function omitCell(
  cell: OcrEffectiveCell,
  reason: OcrReviewOmissionReason,
  duplicateUid?: string,
): OcrReviewOmittedCell {
  return {
    imageIndex: cell.imageIndex,
    position: cell.position,
    imageUid: cell.imageUid,
    filename: cell.filename,
    reason,
    ...(duplicateUid ? { duplicateUid } : {}),
  };
}

/**
 * Evaluate the complete effective raw-cell set. No representative or auto-dedupe is
 * selected: an included UID that occurs more than once makes every member unsafe.
 */
export function evaluateOcrInventoryReview(
  review: OcrInventoryReview,
  patches: OcrCellPatch[],
  catalogUids: ReadonlySet<string>,
  currentQuantities: Record<string, number>,
): OcrInventoryReviewEvaluation {
  const effectiveCells = applyOcrCellPatches(review, patches);
  const omittedCells: OcrReviewOmittedCell[] = [];
  const includedByUid = new Map<string, OcrEffectiveCell[]>();

  for (const cell of effectiveCells) {
    if (cell.excluded) {
      omittedCells.push(omitCell(cell, "excluded"));
      continue;
    }
    if (!cell.effectiveItemUid || !catalogUids.has(cell.effectiveItemUid)) {
      omittedCells.push(omitCell(cell, "unresolved_item"));
      continue;
    }
    includedByUid.set(cell.effectiveItemUid, [...(includedByUid.get(cell.effectiveItemUid) ?? []), cell]);
  }

  const duplicateUids = [...includedByUid.entries()]
    .filter(([, cells]) => cells.length > 1)
    .map(([itemUid]) => itemUid)
    .sort();
  const duplicateUidSet = new Set(duplicateUids);
  const safeCells: OcrEffectiveCell[] = [];

  for (const [itemUid, cells] of includedByUid) {
    if (duplicateUidSet.has(itemUid)) {
      for (const cell of cells) omittedCells.push(omitCell(cell, "duplicate_uid", itemUid));
      continue;
    }
    const cell = cells[0];
    const quantityUnresolved = cell.effectiveQuantity === null;
    if (quantityUnresolved) {
      omittedCells.push(omitCell(cell, "unresolved_quantity"));
      continue;
    }
    safeCells.push(cell);
  }

  const safeEntries = safeCells.map((cell) => {
    const itemUid = cell.effectiveItemUid as string;
    const quantity = cell.effectiveQuantity as number;
    const currentQuantity = currentQuantities[itemUid] ?? 0;
    const manuallyEnteredQuantity =
      cell.patch?.quantity !== undefined &&
      (cell.patch.quantity !== cell.quantity || !cell.quantityKnown || cell.status === "quantity_failure");
    const reviewReasons = [
      ...(cell.selectionSource === "catalog_search" ? ["resource_selected_manually"] : []),
      ...(manuallyEnteredQuantity || !cell.quantityKnown ? ["quantity_entered_manually"] : []),
      ...(cell.quantityKnown && !cell.quantityExact ? ["quantity_approximate"] : []),
    ];
    return {
      itemUid,
      quantity,
      currentQuantity,
      changed: quantity !== currentQuantity,
      cells: [{ imageIndex: cell.imageIndex, position: cell.position }],
      selectionSource: cell.selectionSource ?? "stored_recognition",
      candidateScore: cell.candidateScore,
      reviewReasons,
      quantityExact: cell.quantityExact && !manuallyEnteredQuantity,
      observedQuantities: cell.observedQuantities,
      sourceImages: [cell.filename],
      imageUids: [cell.imageUid],
    } satisfies OcrReviewSafeEntry;
  });

  const changedEntries = safeEntries.filter((entry) => entry.changed);
  const unchangedEntries = safeEntries.filter((entry) => !entry.changed);
  return { safeEntries, changedEntries, unchangedEntries, omittedCells, duplicateUids };
}

export const evaluateInventoryReview = evaluateOcrInventoryReview;

export function getOcrCellEvidence(review: OcrInventoryReview, address: OcrCellAddress) {
  const cell = getOcrReviewCell(review, address);
  if (!cell) return null;
  return {
    imageIndex: cell.imageIndex,
    position: cell.position,
    imageUid: cell.imageUid,
    filename: cell.filename,
    itemUid: cell.itemUid,
    quantity: cell.quantity,
    quantityExact: cell.quantityExact,
    candidates: cell.candidates,
  };
}
