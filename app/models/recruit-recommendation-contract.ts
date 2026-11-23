// The request and answer of the recruit recommendation service, and a strict reader for the answer. The service owns the
// judgment; an answer that does not match this shape is treated as unavailable, never shown in part.
import { isRecruitGoal, type RecruitGoal, type RecruitVerdict } from "~/domain/recruit-recommendation";

export type RecruitRecommendationRequest = {
  goal: RecruitGoal;
  pickups: { studentUid: string; startAt: string }[];
};

export type RecruitBossUsage = {
  bossUid: string;
  bossName: string;
  /** 0–1. */
  usage: number;
  source: "window" | "past";
  raidType: "total_assault" | "elimination";
  /** The KR start of a window raid, or the JP start of a past season. */
  startAt: string;
};

export type RecruitGrowthTier = { tier: number; weaponTier: number | null };

export type RecruitGrowthSummary = {
  sampleCount: number;
  distribution: (RecruitGrowthTier & { count: number })[];
  modal: (RecruitGrowthTier & { share: number }) | null;
};

export type RecruitNewbieRank = {
  rank: number;
  group: "limited_support" | "limited" | "usual";
  evidence: "statistics" | "community";
};

export type RecruitGoalRecommendation = {
  verdict: RecruitVerdict;
  tileBosses: RecruitBossUsage[];
  bosses: RecruitBossUsage[];
  communityLevel: 0 | 1 | 2 | null;
  growth: RecruitGrowthSummary | null;
  newbie: RecruitNewbieRank | null;
};

export type RecruitCommunityTag = {
  kind: string;
  value: string;
  substituteStudentUid?: string;
  sourceCount: number;
};

export type RecruitRecommendationStudent = {
  studentUid: string;
  tags: RecruitCommunityTag[];
  recommendation: RecruitGoalRecommendation;
};

export type RecruitRecommendationAnswer = {
  goal: RecruitGoal;
  computedAt: string;
  students: RecruitRecommendationStudent[];
  pickups: { studentUid: string; startAt: string; aiRecommended: boolean }[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function share(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function level(value: unknown): value is 0 | 1 | 2 {
  return value === 0 || value === 1 || value === 2;
}

function list<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}

function parseVerdict(value: unknown): RecruitVerdict | null {
  const verdict = record(value);
  if (!verdict || !level(verdict.level)) return null;
  const kind = verdict.kind;
  const evidence = verdict.evidence;
  if (kind !== null && kind !== "general" && kind !== "boss") return null;
  if (evidence !== null && evidence !== "window" && evidence !== "past" && evidence !== "community") return null;
  return { kind, level: verdict.level, evidence };
}

function parseBoss(value: unknown): RecruitBossUsage | null {
  const boss = record(value);
  if (
    !boss ||
    !nonEmptyString(boss.bossUid) ||
    !nonEmptyString(boss.bossName) ||
    !share(boss.usage) ||
    (boss.source !== "window" && boss.source !== "past") ||
    (boss.raidType !== "total_assault" && boss.raidType !== "elimination") ||
    !instant(boss.startAt)
  ) {
    return null;
  }
  return {
    bossUid: boss.bossUid,
    bossName: boss.bossName,
    usage: boss.usage,
    source: boss.source,
    raidType: boss.raidType,
    startAt: boss.startAt,
  };
}

function parseGrowthTier(value: Record<string, unknown>): RecruitGrowthTier | null {
  if (!count(value.tier) || value.tier < 1 || value.tier > 5) return null;
  if (value.weaponTier !== null && (!count(value.weaponTier) || value.weaponTier < 1 || value.weaponTier > 4)) return null;
  return { tier: value.tier, weaponTier: value.weaponTier as number | null };
}

function parseGrowth(value: unknown): RecruitGrowthSummary | null | undefined {
  if (value === null) return null;
  const growth = record(value);
  if (!growth || !count(growth.sampleCount)) return undefined;
  const distribution = list(growth.distribution, (item) => {
    const entry = record(item);
    const tier = entry ? parseGrowthTier(entry) : null;
    return entry && tier && count(entry.count) ? { ...tier, count: entry.count } : null;
  });
  if (!distribution) return undefined;
  let modal: RecruitGrowthSummary["modal"] = null;
  if (growth.modal !== null) {
    const entry = record(growth.modal);
    const tier = entry ? parseGrowthTier(entry) : null;
    if (!entry || !tier || !share(entry.share)) return undefined;
    modal = { ...tier, share: entry.share };
  }
  return { sampleCount: growth.sampleCount, distribution, modal };
}

function parseNewbie(value: unknown): RecruitNewbieRank | null | undefined {
  if (value === null) return null;
  const newbie = record(value);
  if (
    !newbie ||
    !count(newbie.rank) ||
    newbie.rank < 1 ||
    (newbie.group !== "limited_support" && newbie.group !== "limited" && newbie.group !== "usual") ||
    (newbie.evidence !== "statistics" && newbie.evidence !== "community")
  ) {
    return undefined;
  }
  return { rank: newbie.rank, group: newbie.group, evidence: newbie.evidence };
}

function parseRecommendation(value: unknown): RecruitGoalRecommendation | null {
  const item = record(value);
  if (!item) return null;
  const verdict = parseVerdict(item.verdict);
  const tileBosses = list(item.tileBosses, parseBoss);
  const bosses = list(item.bosses, parseBoss);
  const growth = parseGrowth(item.growth);
  const newbie = parseNewbie(item.newbie);
  const communityLevel = item.communityLevel;
  if (!verdict || !tileBosses || !bosses || growth === undefined || newbie === undefined) return null;
  if (communityLevel !== null && !level(communityLevel)) return null;
  return { verdict, tileBosses, bosses, communityLevel, growth, newbie };
}

function parseTag(value: unknown): RecruitCommunityTag | null {
  const tag = record(value);
  if (!tag || !nonEmptyString(tag.kind) || !nonEmptyString(tag.value) || !count(tag.sourceCount)) return null;
  if (tag.substituteStudentUid !== undefined && !nonEmptyString(tag.substituteStudentUid)) return null;
  return {
    kind: tag.kind,
    value: tag.value,
    sourceCount: tag.sourceCount,
    ...(tag.substituteStudentUid === undefined ? {} : { substituteStudentUid: tag.substituteStudentUid }),
  };
}

export type RecruitRecommendationParse =
  | { status: "ok"; answer: RecruitRecommendationAnswer }
  | { status: "unavailable" }
  | { status: "invalid_request" }
  | { status: "unexpected" };

/** Reads an answer of the service. Any part that does not match makes the whole answer unexpected. */
export function parseRecruitRecommendationAnswer(value: unknown): RecruitRecommendationParse {
  const answer = record(value);
  if (!answer) return { status: "unexpected" };
  if (answer.status === "unavailable") return { status: "unavailable" };
  if (answer.status === "invalid_request") return { status: "invalid_request" };
  if (answer.status !== "ok" || !isRecruitGoal(answer.goal) || !instant(answer.computedAt)) return { status: "unexpected" };
  const students = list(answer.students, (item) => {
    const student = record(item);
    if (!student || !nonEmptyString(student.studentUid)) return null;
    const tags = list(student.tags, parseTag);
    const recommendation = parseRecommendation(student.recommendation);
    return tags && recommendation ? { studentUid: student.studentUid, tags, recommendation } : null;
  });
  const pickups = list(answer.pickups, (item) => {
    const pickup = record(item);
    return pickup && nonEmptyString(pickup.studentUid) && instant(pickup.startAt) && typeof pickup.aiRecommended === "boolean"
      ? { studentUid: pickup.studentUid, startAt: pickup.startAt, aiRecommended: pickup.aiRecommended }
      : null;
  });
  if (!students || !pickups) return { status: "unexpected" };
  return { status: "ok", answer: { goal: answer.goal, computedAt: answer.computedAt, students, pickups } };
}
