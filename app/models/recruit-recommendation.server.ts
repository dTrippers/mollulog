import {
  parseRecruitRecommendationAnswer,
  type RecruitRecommendationAnswer,
  type RecruitRecommendationRequest,
} from "./recruit-recommendation-contract";

export type RecruitRecommendationCall =
  | { ok: true; answer: RecruitRecommendationAnswer }
  | { ok: false; reason: "unavailable" | "unexpected_result" };

/**
 * Asks the recommendation service for one goal. A missing binding, a thrown call, the service's own "unavailable", and
 * an answer that does not match the contract are all failures; the caller shows an error state, never a partial answer.
 */
export async function getRecruitRecommendations(
  env: Partial<Pick<Env, "AL1S_RECOMMENDATIONS">>,
  request: RecruitRecommendationRequest,
): Promise<RecruitRecommendationCall> {
  if (!env.AL1S_RECOMMENDATIONS) return { ok: false, reason: "unavailable" };
  let value: unknown;
  try {
    value = await env.AL1S_RECOMMENDATIONS.getRecruitRecommendations(request);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const parsed = parseRecruitRecommendationAnswer(value);
  if (parsed.status === "ok") {
    return parsed.answer.goal === request.goal
      ? { ok: true, answer: parsed.answer }
      : { ok: false, reason: "unexpected_result" };
  }
  return { ok: false, reason: parsed.status === "unavailable" ? "unavailable" : "unexpected_result" };
}
