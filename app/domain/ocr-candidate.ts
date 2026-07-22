import { OCR_CANDIDATE_SELECTION_LIMIT } from "./ocr";

export type CandidateSelection = { imageFilename: string; observationId: string };

export type CandidateEvidence = {
  imageFilename: string;
  observationId: string;
  quantity: number | null;
  quantityExact: boolean;
  candidateScore: number | null;
};

export function findCandidateEvidence(
  result: unknown,
  itemUid: string,
  selection: CandidateSelection,
): CandidateEvidence | null {
  if (!result || typeof result !== "object") return null;
  const images = (result as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;
  const image = images.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      (candidate as { filename?: unknown }).filename === selection.imageFilename,
  );
  if (!image || typeof image !== "object") return null;
  const observations = (image as { observations?: unknown }).observations;
  if (!Array.isArray(observations)) return null;
  const observation = observations.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      (candidate as { observation_id?: unknown }).observation_id === selection.observationId,
  );
  if (!observation || typeof observation !== "object") return null;
  const observationRecord = observation as Record<string, unknown>;
  const candidates = observationRecord.candidates;
  if (!Array.isArray(candidates)) return null;
  const matchedCandidate = candidates
    .slice(0, OCR_CANDIDATE_SELECTION_LIMIT)
    .find(
      (candidate) => candidate && typeof candidate === "object" && (candidate as { uid?: unknown }).uid === itemUid,
    );
  if (!matchedCandidate || typeof matchedCandidate !== "object") return null;

  return {
    imageFilename: selection.imageFilename,
    observationId: selection.observationId,
    quantity: typeof observationRecord.quantity === "number" ? observationRecord.quantity : null,
    quantityExact: observationRecord.quantity_exact === true,
    candidateScore:
      typeof (matchedCandidate as { score?: unknown }).score === "number"
        ? ((matchedCandidate as { score: number }).score as number)
        : null,
  };
}
