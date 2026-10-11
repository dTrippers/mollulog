import {
  CARD_FLIP_STRATEGIES,
  DEFAULT_CARD_FLIP_STRATEGY,
  type BonusStudentSelectionMode,
  type CardFlipStrategy,
  type MinigamePaymentQuantityMode,
  type Stage,
} from "~/domain/event-shop";

export type EventShopState = {
  itemQuantities: Record<string, number>;
  itemPurchaseDays: Record<string, number>;
  selectedBonusStudentUids: string[];
  bonusStudentSelectionMode: BonusStudentSelectionMode;
  selectedBonusStudentUidsByItem: Record<string, string[]>;
  enabledStages: Record<string, boolean>;
  includeRecruitedStudents: boolean;
  existingPaymentItemQuantities: Record<string, number>;
  includeFirstClear: boolean;
  extraStageRuns: Record<string, number>;
  minigameStartRound: number;
  minigamePlayCount: number;
  minigamePaymentQuantityMode: MinigamePaymentQuantityMode;
  cardFlipStrategy: CardFlipStrategy;
  overriddenRequiredQuantities: Record<string, number>;
};

export type EventShopOwnedQuantityPatch = Record<string, number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeRecordChanges(
  base: Record<string, unknown>,
  submitted: Record<string, unknown>,
  latest: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...latest };
  for (const key of new Set([...Object.keys(base), ...Object.keys(submitted)])) {
    const baseHasKey = Object.hasOwn(base, key);
    const submittedHasKey = Object.hasOwn(submitted, key);
    const latestHasKey = Object.hasOwn(latest, key);

    if (!submittedHasKey) {
      if (baseHasKey && latestHasKey && JSON.stringify(latest[key]) === JSON.stringify(base[key])) {
        delete merged[key];
      }
      continue;
    }

    if (!baseHasKey || JSON.stringify(submitted[key]) !== JSON.stringify(base[key])) {
      merged[key] = submitted[key];
    }
  }
  return merged;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNumberMap(value: unknown, omitZero = false): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (
    entries.some(
      ([key, quantity]) => !isNonEmptyString(key) || !Number.isSafeInteger(quantity) || (quantity as number) < 0,
    )
  ) {
    return null;
  }
  return Object.fromEntries(
    entries.filter(([, quantity]) => !omitZero || quantity !== 0).sort(([left], [right]) => compareKeys(left, right)),
  ) as Record<string, number>;
}

function normalizeStringMap(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (
    entries.some(
      ([key, selected]) =>
        !isNonEmptyString(key) || !Array.isArray(selected) || selected.some((item) => !isNonEmptyString(item)),
    )
  ) {
    return null;
  }
  return Object.fromEntries(
    entries
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([key, selected]) => [key, [...new Set(selected as string[])].sort(compareKeys)]),
  );
}

function normalizeBooleanMap(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([key, enabled]) => !isNonEmptyString(key) || typeof enabled !== "boolean")) return null;
  return Object.fromEntries(entries.sort(([left], [right]) => compareKeys(left, right))) as Record<string, boolean>;
}

function normalizeStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) return null;
  return [...new Set(value as string[])].sort(compareKeys);
}

export function normalizeEventShopOwnedQuantityPatch(value: unknown): EventShopOwnedQuantityPatch | null {
  return normalizeNumberMap(value);
}

export function normalizeEventShopState(value: unknown): EventShopState | null {
  if (!isRecord(value)) return null;

  const itemQuantities = normalizeNumberMap(value.itemQuantities, true);
  const itemPurchaseDays = normalizeNumberMap(value.itemPurchaseDays);
  const selectedBonusStudentUids = normalizeStringList(value.selectedBonusStudentUids);
  const selectedBonusStudentUidsByItem = normalizeStringMap(value.selectedBonusStudentUidsByItem);
  const enabledStages = normalizeBooleanMap(value.enabledStages);
  const existingPaymentItemQuantities = normalizeNumberMap(value.existingPaymentItemQuantities, true);
  const extraStageRuns = normalizeNumberMap(value.extraStageRuns, true);
  const overriddenRequiredQuantities = normalizeNumberMap(value.overriddenRequiredQuantities);
  const bonusStudentSelectionMode = value.bonusStudentSelectionMode;
  const minigamePaymentQuantityMode = value.minigamePaymentQuantityMode;
  const cardFlipStrategy = value.cardFlipStrategy ?? DEFAULT_CARD_FLIP_STRATEGY;

  if (
    !itemQuantities ||
    !itemPurchaseDays ||
    !selectedBonusStudentUids ||
    !selectedBonusStudentUidsByItem ||
    !enabledStages ||
    !existingPaymentItemQuantities ||
    !extraStageRuns ||
    !overriddenRequiredQuantities ||
    (bonusStudentSelectionMode !== "shared" && bonusStudentSelectionMode !== "perItem") ||
    typeof value.includeRecruitedStudents !== "boolean" ||
    typeof value.includeFirstClear !== "boolean" ||
    !Number.isSafeInteger(value.minigameStartRound) ||
    (value.minigameStartRound as number) < 1 ||
    !Number.isSafeInteger(value.minigamePlayCount) ||
    (value.minigamePlayCount as number) < 0 ||
    (minigamePaymentQuantityMode !== "expected" &&
      minigamePaymentQuantityMode !== "min" &&
      minigamePaymentQuantityMode !== "max") ||
    !CARD_FLIP_STRATEGIES.includes(cardFlipStrategy as CardFlipStrategy)
  ) {
    return null;
  }

  return {
    itemQuantities,
    itemPurchaseDays,
    selectedBonusStudentUids,
    bonusStudentSelectionMode,
    selectedBonusStudentUidsByItem,
    enabledStages,
    includeRecruitedStudents: value.includeRecruitedStudents,
    existingPaymentItemQuantities,
    includeFirstClear: value.includeFirstClear,
    extraStageRuns,
    minigameStartRound: value.minigameStartRound as number,
    minigamePlayCount: value.minigamePlayCount as number,
    minigamePaymentQuantityMode,
    cardFlipStrategy: cardFlipStrategy as CardFlipStrategy,
    overriddenRequiredQuantities,
  };
}

export function createDefaultEventShopState(
  stages: readonly Stage[],
  recruitedStudentUids: readonly string[],
): EventShopState {
  const enabledStages: Record<string, boolean> = {};
  for (const stage of stages) {
    enabledStages[stage.uid] = Number.parseInt(stage.index, 10) >= 9;
  }

  return {
    itemQuantities: {},
    itemPurchaseDays: {},
    selectedBonusStudentUids: [...recruitedStudentUids],
    bonusStudentSelectionMode: "shared",
    selectedBonusStudentUidsByItem: {},
    enabledStages,
    includeRecruitedStudents: true,
    existingPaymentItemQuantities: {},
    includeFirstClear: false,
    extraStageRuns: {},
    minigameStartRound: 1,
    minigamePlayCount: 0,
    minigamePaymentQuantityMode: "expected",
    cardFlipStrategy: DEFAULT_CARD_FLIP_STRATEGY,
    overriddenRequiredQuantities: {},
  };
}

export function patchEventShopOwnedQuantities(
  state: EventShopState,
  patch: EventShopOwnedQuantityPatch,
): EventShopState {
  return {
    ...state,
    existingPaymentItemQuantities: {
      ...state.existingPaymentItemQuantities,
      ...patch,
    },
  };
}

export function mergeEventShopStateChanges(
  baseState: EventShopState,
  submittedState: EventShopState,
  latestState: EventShopState,
): EventShopState {
  const base = normalizeEventShopState(baseState);
  const submitted = normalizeEventShopState(submittedState);
  const latest = normalizeEventShopState(latestState);
  if (!base || !submitted || !latest) throw new Error("상점 계획 내용을 확인해주세요");

  const merged: EventShopState = { ...latest };
  for (const key of Object.keys(base) as Array<keyof EventShopState>) {
    const baseValue = base[key];
    const submittedValue = submitted[key];
    const latestValue = latest[key];

    if (isRecord(baseValue) && isRecord(submittedValue) && isRecord(latestValue)) {
      Object.assign(merged, {
        [key]: mergeRecordChanges(baseValue, submittedValue, latestValue),
      });
    } else if (JSON.stringify(baseValue) !== JSON.stringify(submittedValue)) {
      Object.assign(merged, { [key]: submittedValue });
    }
  }

  const normalized = normalizeEventShopState(merged);
  if (!normalized) throw new Error("상점 계획 내용을 확인해주세요");
  return normalized;
}

export function eventShopStatesEqual(left: unknown, right: unknown): boolean {
  const a = normalizeEventShopState(left);
  const b = normalizeEventShopState(right);
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
