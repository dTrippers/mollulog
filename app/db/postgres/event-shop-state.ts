import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import type { EventShopState } from "~/models/event-shop-state";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgEventShopStatesTable } from "./schema";

type EventShopStateDatabase = NodePgDatabase;

export type PostgresEventShopStateOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

async function withEventShopStateDatabase<T>(
  env: Env,
  operation: (db: EventShopStateDatabase) => Promise<T>,
  options: PostgresEventShopStateOptions = {},
): Promise<T> {
  const { createClient = createPostgresClient, ctx } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = () => operation(drizzle(client));
      return ctx ? ctx.tracing.enterSpan("postgres.event_shop_states.operation", run) : run();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresEventShopState(
  env: Env,
  userId: number,
  eventUid: string,
  options: PostgresEventShopStateOptions = {},
): Promise<EventShopState | null> {
  const row = await withEventShopStateDatabase(
    env,
    (db) =>
      db
        .select()
        .from(pgEventShopStatesTable)
        .where(and(eq(pgEventShopStatesTable.userId, userId), eq(pgEventShopStatesTable.eventUid, eventUid)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    options,
  );
  return row ? toEventShopStateModel(row) : null;
}

export async function upsertPostgresEventShopState(
  env: Env,
  userId: number,
  eventUid: string,
  state: EventShopState,
  options: PostgresEventShopStateOptions = {},
): Promise<void> {
  const minigameStartRound = Math.max(1, state.minigameStartRound ?? 1);
  await withEventShopStateDatabase(
    env,
    async (db) => {
      await db
        .insert(pgEventShopStatesTable)
        .values({
          uid: nanoid(8),
          userId,
          eventUid,
          itemQuantities: state.itemQuantities,
          itemPurchaseDays: state.itemPurchaseDays ?? {},
          selectedBonusStudentUids: state.selectedBonusStudentUids,
          bonusStudentSelectionMode: state.bonusStudentSelectionMode ?? "shared",
          selectedBonusStudentUidsByItem: state.selectedBonusStudentUidsByItem ?? {},
          enabledStages: state.enabledStages,
          includeRecruitedStudents: state.includeRecruitedStudents,
          existingPaymentItemQuantities: state.existingPaymentItemQuantities ?? {},
          includeFirstClear: state.includeFirstClear,
          extraStageRuns: state.extraStageRuns ?? {},
          minigameStartRound,
          minigamePlayCount: state.minigamePlayCount ?? 0,
          minigamePaymentQuantityMode: state.minigamePaymentQuantityMode ?? "expected",
          overriddenRequiredQuantities: state.overriddenRequiredQuantities ?? {},
        })
        .onConflictDoUpdate({
          target: [pgEventShopStatesTable.userId, pgEventShopStatesTable.eventUid],
          set: {
            itemQuantities: state.itemQuantities,
            itemPurchaseDays: state.itemPurchaseDays ?? {},
            selectedBonusStudentUids: state.selectedBonusStudentUids,
            bonusStudentSelectionMode: state.bonusStudentSelectionMode ?? "shared",
            selectedBonusStudentUidsByItem: state.selectedBonusStudentUidsByItem ?? {},
            enabledStages: state.enabledStages,
            includeRecruitedStudents: state.includeRecruitedStudents,
            existingPaymentItemQuantities: state.existingPaymentItemQuantities ?? {},
            includeFirstClear: state.includeFirstClear,
            extraStageRuns: state.extraStageRuns ?? {},
            minigameStartRound,
            minigamePlayCount: state.minigamePlayCount ?? 0,
            minigamePaymentQuantityMode: state.minigamePaymentQuantityMode ?? "expected",
            overriddenRequiredQuantities: state.overriddenRequiredQuantities ?? {},
            updatedAt: new Date(),
          },
        });
    },
    options,
  );
}

function parseJson<T>(value: T | string, field: string): T {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Invalid PostgreSQL JSON value: ${field}`);
  }
}

function toEventShopStateModel(row: typeof pgEventShopStatesTable.$inferSelect): EventShopState {
  return {
    itemQuantities: parseJson(row.itemQuantities, "event_shop_states.item_quantities"),
    itemPurchaseDays: parseJson(row.itemPurchaseDays, "event_shop_states.item_purchase_days"),
    selectedBonusStudentUids: parseJson(row.selectedBonusStudentUids, "event_shop_states.selected_bonus_student_uids"),
    bonusStudentSelectionMode: row.bonusStudentSelectionMode === "perItem" ? "perItem" : "shared",
    selectedBonusStudentUidsByItem: parseJson(
      row.selectedBonusStudentUidsByItem,
      "event_shop_states.selected_bonus_student_uids_by_item",
    ),
    enabledStages: parseJson(row.enabledStages, "event_shop_states.enabled_stages"),
    includeRecruitedStudents: row.includeRecruitedStudents,
    existingPaymentItemQuantities: parseJson(
      row.existingPaymentItemQuantities,
      "event_shop_states.existing_payment_item_quantities",
    ),
    includeFirstClear: row.includeFirstClear,
    extraStageRuns: parseJson(row.extraStageRuns, "event_shop_states.extra_stage_runs"),
    minigameStartRound: Math.max(1, row.minigameStartRound ?? 1),
    minigamePlayCount: row.minigamePlayCount ?? 0,
    minigamePaymentQuantityMode:
      row.minigamePaymentQuantityMode === "min" || row.minigamePaymentQuantityMode === "max"
        ? row.minigamePaymentQuantityMode
        : "expected",
    overriddenRequiredQuantities: parseJson(
      row.overriddenRequiredQuantities,
      "event_shop_states.overridden_required_quantities",
    ),
  };
}
