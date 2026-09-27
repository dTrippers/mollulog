import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { withPlannerStateUpdate } from "~/db/postgres/planner-states";
import type { EventShopOwnedQuantityPatch, EventShopState } from "~/domain/event-shop-state";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgEventShopStatesHistoryTable, pgEventShopStatesTable } from "./schema";

type EventShopStateDatabase = NodePgDatabase;

const eventShopStateHistorySources = ["autosave"] as const;

export type EventShopStateHistorySource = (typeof eventShopStateHistorySources)[number];

function parseEventShopStateHistorySource(value: string): EventShopStateHistorySource {
  if (!(eventShopStateHistorySources as readonly string[]).includes(value)) {
    throw new Error(`Invalid event shop state history source: ${value}`);
  }
  return value as EventShopStateHistorySource;
}

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

export async function upsertPostgresEventShopState(
  env: Env,
  userId: number,
  eventUid: string,
  state: EventShopState,
  options: PostgresEventShopStateOptions = {},
): Promise<void> {
  const minigameStartRound = Math.max(1, state.minigameStartRound ?? 1);
  const historySource = parseEventShopStateHistorySource("autosave");
  const normalizedState: EventShopState = {
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
  };
  await withEventShopStateDatabase(
    env,
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          await tx
            .insert(pgEventShopStatesTable)
            .values({
              uid: nanoid(8),
              userId,
              eventUid,
              ...normalizedState,
            })
            .onConflictDoUpdate({
              target: [pgEventShopStatesTable.userId, pgEventShopStatesTable.eventUid],
              set: {
                ...normalizedState,
                updatedAt: new Date(),
              },
            });
          await tx.insert(pgEventShopStatesHistoryTable).values({
            userId,
            eventUid,
            state: normalizedState,
            source: historySource,
          });
          return {
            document: {
              ...document,
              eventShops: { ...document.eventShops, [eventUid]: normalizedState },
            },
            result: undefined,
          };
        },
        { retryable: true },
      ),
    options,
  );
}

export async function patchPostgresEventShopStateOwnedQuantities(
  env: Env,
  userId: number,
  eventUid: string,
  patch: EventShopOwnedQuantityPatch,
  defaultState: EventShopState,
  options: PostgresEventShopStateOptions = {},
): Promise<void> {
  await withEventShopStateDatabase(
    env,
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const currentState = document.eventShops[eventUid] ?? defaultState;
          const nextState: EventShopState = {
            ...currentState,
            existingPaymentItemQuantities: { ...currentState.existingPaymentItemQuantities, ...patch },
          };
          await tx
            .insert(pgEventShopStatesTable)
            .values({
              uid: nanoid(8),
              userId,
              eventUid,
              itemQuantities: defaultState.itemQuantities,
              itemPurchaseDays: defaultState.itemPurchaseDays,
              selectedBonusStudentUids: defaultState.selectedBonusStudentUids,
              bonusStudentSelectionMode: defaultState.bonusStudentSelectionMode,
              selectedBonusStudentUidsByItem: defaultState.selectedBonusStudentUidsByItem,
              enabledStages: defaultState.enabledStages,
              includeRecruitedStudents: defaultState.includeRecruitedStudents,
              existingPaymentItemQuantities: {
                ...defaultState.existingPaymentItemQuantities,
                ...patch,
              },
              includeFirstClear: defaultState.includeFirstClear,
              extraStageRuns: defaultState.extraStageRuns,
              minigameStartRound: defaultState.minigameStartRound,
              minigamePlayCount: defaultState.minigamePlayCount,
              minigamePaymentQuantityMode: defaultState.minigamePaymentQuantityMode,
              overriddenRequiredQuantities: defaultState.overriddenRequiredQuantities,
            })
            .onConflictDoUpdate({
              target: [pgEventShopStatesTable.userId, pgEventShopStatesTable.eventUid],
              set: {
                existingPaymentItemQuantities: sql<
                  Record<string, number>
                >`${pgEventShopStatesTable.existingPaymentItemQuantities} || ${JSON.stringify(patch)}::jsonb`,
                updatedAt: new Date(),
              },
            });
          return {
            document: { ...document, eventShops: { ...document.eventShops, [eventUid]: nextState } },
            result: undefined,
          };
        },
        { retryable: true },
      ),
    options,
  );
}
