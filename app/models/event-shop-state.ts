import type { BonusStudentSelectionMode, MinigamePaymentQuantityMode } from "~/domain/event-shop";
import { getPostgresEventShopState, upsertPostgresEventShopState } from "~/db/postgres/event-shop-state";

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
  overriddenRequiredQuantities: Record<string, number>;
};

export async function getEventShopState(env: Env, userId: number, eventUid: string): Promise<EventShopState | null> {
  return getPostgresEventShopState(env, userId, eventUid);
}

export async function upsertEventShopState(
  env: Env,
  userId: number,
  eventUid: string,
  state: EventShopState,
): Promise<void> {
  await upsertPostgresEventShopState(env, userId, eventUid, state);
}
