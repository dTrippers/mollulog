import { calculateCumulativeTierEleph } from "~/domain/growth-resource";
import type { RecruitmentChargeScope } from "~/domain/recruitment-cost";

// Target tiers a planner event can aim for: ★3 to ★5, then exclusive weapon 1-4 (tiers 6-9).
export const RECRUITMENT_TARGET_TIERS = [3, 4, 5, 6, 7, 8, 9] as const;
export type RecruitmentTargetTier = (typeof RECRUITMENT_TARGET_TIERS)[number];
export const DEFAULT_RECRUITMENT_TARGET_TIER: RecruitmentTargetTier = 3;

// Eleph from recruiting a ★3 pickup student: the first copy in the recruitment period gives the
// first-acquisition bonus, and each duplicate gives the same amount. The bonus is tied to the
// recruitment period, not to first ownership, so an owned student also gets it on a rerun.
const FIRST_ACQUISITION_ELEPH = 100;
const DUPLICATE_ELEPH = 100;

// A pickup ★3 student that the account does not own starts at its initial tier (★3).
const UNOWNED_START_TIER = 3;

// The highest stack a scope can hold before its next pull: the 200th pull always yields the pickup.
export const MAX_RECRUITMENT_STACK = 199;

export type RecruitmentStacks = Record<RecruitmentChargeScope, number>;

export const EMPTY_RECRUITMENT_STACKS: RecruitmentStacks = { regular: 0, limited: 0 };

export function isRecruitmentTargetTier(value: unknown): value is RecruitmentTargetTier {
  return RECRUITMENT_TARGET_TIERS.includes(value as RecruitmentTargetTier);
}

/** The account's current state of a pickup student. `tier` is null when the account does not own it. */
export type RecruitmentOwnedState = { tier: number | null; eleph: number };

/** Owned states by student UID. A student without an entry is unowned and has no eleph. */
export type RecruitmentOwnedStates = Record<string, RecruitmentOwnedState>;

/**
 * Owned states as read at `readAt` (UTC ISO). They describe the account at that moment, so they only
 * apply to recruitments that start at or after it: copies pulled in an earlier recruitment may already
 * be part of the owned state.
 */
export type RecruitmentOwnedSnapshot = { readAt: string; states: RecruitmentOwnedStates };

export function getRecruitmentTargetEleph(targetTier: RecruitmentTargetTier): number {
  return calculateCumulativeTierEleph(UNOWNED_START_TIER, targetTier);
}

/**
 * Number of copies of a pickup ★3 student needed to reach the target tier through recruitment alone,
 * starting from the account's owned tier and held eleph. Without an owned state the student is treated
 * as unowned with no eleph. An unowned student always needs one copy to be acquired.
 */
export function getRecruitmentTargetCopies(targetTier: RecruitmentTargetTier, owned?: RecruitmentOwnedState): number {
  const heldEleph = owned?.eleph ?? 0;
  const ownedTier = owned?.tier ?? null;
  if (ownedTier === null) {
    const missingEleph = Math.max(0, getRecruitmentTargetEleph(targetTier) - heldEleph - FIRST_ACQUISITION_ELEPH);
    return 1 + Math.ceil(missingEleph / DUPLICATE_ELEPH);
  }

  const missingEleph = Math.max(0, calculateCumulativeTierEleph(ownedTier, targetTier) - heldEleph);
  if (missingEleph === 0) return 0;
  // The first copy of an owned student gives both the duplicate eleph and the first-acquisition bonus.
  const afterFirstCopy = Math.max(0, missingEleph - FIRST_ACQUISITION_ELEPH - DUPLICATE_ELEPH);
  return 1 + Math.ceil(afterFirstCopy / DUPLICATE_ELEPH);
}

/**
 * Eleph the student still lacks for the target tier, after its held eleph. An unowned student counts from
 * its initial tier (★3), which the first copy gives.
 */
export function getRecruitmentRemainingEleph(targetTier: RecruitmentTargetTier, owned?: RecruitmentOwnedState): number {
  const startTier = owned?.tier ?? UNOWNED_START_TIER;
  return Math.max(0, calculateCumulativeTierEleph(startTier, targetTier) - (owned?.eleph ?? 0));
}

/** Merges owned tiers and held eleph for the given students; returns null when either source is unavailable. */
export function buildRecruitmentOwnedSnapshot(
  readAt: string,
  studentUids: readonly string[],
  ownedTiers: Readonly<Record<string, number>>,
  heldEleph: Readonly<Record<string, number>>,
): RecruitmentOwnedSnapshot;
export function buildRecruitmentOwnedSnapshot(
  readAt: string,
  studentUids: readonly string[],
  ownedTiers: Readonly<Record<string, number>> | null,
  heldEleph: Readonly<Record<string, number>> | null,
): RecruitmentOwnedSnapshot | null;
export function buildRecruitmentOwnedSnapshot(
  readAt: string,
  studentUids: readonly string[],
  ownedTiers: Readonly<Record<string, number>> | null,
  heldEleph: Readonly<Record<string, number>> | null,
): RecruitmentOwnedSnapshot | null {
  if (ownedTiers === null || heldEleph === null) return null;
  const states: RecruitmentOwnedStates = {};
  for (const studentUid of new Set(studentUids)) {
    const tier = ownedTiers[studentUid] ?? null;
    const eleph = heldEleph[studentUid] ?? 0;
    if (tier !== null || eleph > 0) states[studentUid] = { tier, eleph };
  }
  return { readAt, states };
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
