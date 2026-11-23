// 모집 추천: the goals a Sensei can pick and the names the screens give to a recommendation's values. The judgment itself
// comes from the recommendation service; this module only reads it.

export const RECRUIT_GOALS = ["top", "platinum", "newbie"] as const;
export type RecruitGoal = (typeof RECRUIT_GOALS)[number];

export function isRecruitGoal(value: unknown): value is RecruitGoal {
  return typeof value === "string" && (RECRUIT_GOALS as readonly string[]).includes(value);
}

export const recruitGoalLabels: Record<RecruitGoal, string> = {
  top: "최상위권",
  platinum: "플래티넘",
  newbie: "뉴비",
};

export type RecruitVerdict = {
  kind: "general" | "boss" | null;
  level: 0 | 1 | 2;
  evidence: "window" | "past" | "community" | null;
};

/** The verdict's name: 최우선 / 우선 / 여유 시 for a general pick, 특정 보스 특화 / 기용 for a boss pick. */
export function recruitVerdictLabel(goal: RecruitGoal, verdict: RecruitVerdict): string | null {
  if (verdict.kind === "general") {
    if (verdict.level === 2) return goal === "top" ? "최우선" : "우선";
    if (verdict.level === 1) return "여유 시";
    return null;
  }
  if (verdict.kind === "boss") {
    if (verdict.level === 2) return "특정 보스 특화";
    if (verdict.level === 1) return "특정 보스 기용";
  }
  return null;
}

/** The verdict's evidence, as the detail view names it. */
export const recruitEvidenceLabels: Record<NonNullable<RecruitVerdict["evidence"]>, string> = {
  window: "이번 일정 통계 기준",
  past: "과거 통계 기준",
  community: "커뮤니티 평가 기준",
};

export const communityLevelLabels: Record<0 | 1 | 2, string> = { 0: "낮음", 1: "보통", 2: "높음" };

export const newbieGroupLabels: Record<"limited_support" | "limited" | "usual", string> = {
  limited_support: "한정 서포터",
  limited: "한정",
  usual: "상시",
};

/** The name of the rate column: whose usage the value is. */
export function usageColumnLabel(goal: RecruitGoal): string {
  return goal === "top" ? "최상위권 채용률" : "플래티넘 채용률";
}

/** The one-line description of the criteria panel for a goal. */
export function recruitCriteriaSummary(goal: RecruitGoal): string {
  if (goal === "top") return "일본 1~1,000위 채용률";
  if (goal === "platinum") return "일본 플래티넘 구간 채용률";
  return "플래티넘 통계와 커뮤니티 평가";
}

/** Whether a student has a recommendation of its own under the goal, so it gets a row rather than a chip. */
export function hasRecruitRecommendation(
  goal: RecruitGoal,
  recommendation: { verdict: RecruitVerdict; newbie: unknown | null },
): boolean {
  if (goal === "newbie") return recommendation.newbie !== null;
  return recommendation.verdict.kind !== null && recruitVerdictLabel(goal, recommendation.verdict) !== null;
}

export const RECRUIT_GOAL_STORAGE_KEY = "recruit-recommendation::goal";
