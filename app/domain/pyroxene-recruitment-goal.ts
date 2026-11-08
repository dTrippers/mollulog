import { calculateCumulativeTierEleph } from "~/domain/growth-resource";
import type { RecruitmentChargeScope } from "~/domain/recruitment-cost";

// Target tiers a planner event can aim for: ★3 to ★5, then exclusive weapon 1-4 (tiers 6-9).
export const RECRUITMENT_TARGET_TIERS = [3, 4, 5, 6, 7, 8, 9] as const;
export type RecruitmentTargetTier = (typeof RECRUITMENT_TARGET_TIERS)[number];
export const DEFAULT_RECRUITMENT_TARGET_TIER: RecruitmentTargetTier = 3;

// Eleph from recruiting a ★3 pickup student: the first copy in the recruitment period gives the
// first-acquisition bonus, and each duplicate gives the same amount.
const FIRST_ACQUISITION_ELEPH = 100;
const DUPLICATE_ELEPH = 100;

// The planner always starts from an unowned student at its initial tier (★3).
const PLANNER_START_TIER = 3;

// The highest stack a scope can hold before its next pull: the 200th pull always yields the pickup.
export const MAX_RECRUITMENT_STACK = 199;

export type RecruitmentStacks = Record<RecruitmentChargeScope, number>;

export const EMPTY_RECRUITMENT_STACKS: RecruitmentStacks = { regular: 0, limited: 0 };

export function isRecruitmentTargetTier(value: unknown): value is RecruitmentTargetTier {
  return RECRUITMENT_TARGET_TIERS.includes(value as RecruitmentTargetTier);
}

export function getRecruitmentTargetEleph(targetTier: RecruitmentTargetTier): number {
  return calculateCumulativeTierEleph(PLANNER_START_TIER, targetTier);
}

/** Number of copies of an unowned ★3 student needed to reach the target tier through recruitment alone. */
export function getRecruitmentTargetCopies(targetTier: RecruitmentTargetTier): number {
  const missingEleph = Math.max(0, getRecruitmentTargetEleph(targetTier) - FIRST_ACQUISITION_ELEPH);
  return 1 + Math.ceil(missingEleph / DUPLICATE_ELEPH);
}

function isRecruitmentStack(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_RECRUITMENT_STACK;
}

/** Returns the stacks, or null when the value is not a valid stack pair. */
export function normalizeRecruitmentStacks(value: unknown): RecruitmentStacks | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { regular, limited } = value as Record<string, unknown>;
  if (!isRecruitmentStack(regular) || !isRecruitmentStack(limited)) return null;
  return { regular, limited };
}

export type RecruitmentTargetTiers = Record<string, RecruitmentTargetTier>;

/** Keeps only tiers above the default; returns null when the value is not a student-to-tier map. */
export function normalizeRecruitmentTargetTiers(value: unknown, maxCount = 50): RecruitmentTargetTiers | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > maxCount) return null;
  const result: RecruitmentTargetTiers = {};
  for (const [studentUid, tier] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (studentUid.length === 0 || studentUid.length > 64 || !isRecruitmentTargetTier(tier)) return null;
    if (tier !== DEFAULT_RECRUITMENT_TARGET_TIER) result[studentUid] = tier;
  }
  return result;
}
