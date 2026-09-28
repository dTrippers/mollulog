import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { withPlannerStateUpdate } from "~/db/postgres/planner-states";
import {
  type EventShopOwnedQuantityPatch,
  type EventShopState,
  mergeEventShopStateChanges,
} from "~/domain/event-shop-state";
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

export type PostgresEventShopStateUpsertOptions = PostgresEventShopStateOptions & {
  baseState?: EventShopState | null;
  fallbackEventUid?: string | null;
  replace?: boolean;
};

export type PostgresEventShopStatePatchOptions = PostgresEventShopStateOptions & {
  fallbackEventUid?: string | null;
};

function normalizeEventShopStateForStorage(state: EventShopState): EventShopState {
  return {
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
    minigameStartRound: Math.max(1, state.minigameStartRound ?? 1),
    minigamePlayCount: state.minigamePlayCount ?? 0,
    minigamePaymentQuantityMode: state.minigamePaymentQuantityMode ?? "expected",
    overriddenRequiredQuantities: state.overriddenRequiredQuantities ?? {},
  };
}

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
  options: PostgresEventShopStateUpsertOptions = {},
): Promise<void> {
  const submittedState = normalizeEventShopStateForStorage(state);
  const historySource = parseEventShopStateHistorySource("autosave");
  await withEventShopStateDatabase(
    env,
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const currentState =
            document.eventShops[eventUid] ??
            (options.fallbackEventUid ? document.eventShops[options.fallbackEventUid] : undefined) ??
            null;
          const stateToSave = normalizeEventShopStateForStorage(
            !options.replace && options.baseState && currentState
              ? mergeEventShopStateChanges(options.baseState, submittedState, currentState)
              : submittedState,
          );
          await tx
            .insert(pgEventShopStatesTable)
            .values({
              uid: nanoid(8),
              userId,
              eventUid,
              ...stateToSave,
            })
            .onConflictDoUpdate({
              target: [pgEventShopStatesTable.userId, pgEventShopStatesTable.eventUid],
              set: {
                ...stateToSave,
                updatedAt: new Date(),
              },
            });
          await tx.insert(pgEventShopStatesHistoryTable).values({
            userId,
            eventUid,
            state: stateToSave,
            source: historySource,
          });
          return {
            document: {
              ...document,
              eventShops: { ...document.eventShops, [eventUid]: stateToSave },
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
  options: PostgresEventShopStatePatchOptions = {},
): Promise<void> {
  await withEventShopStateDatabase(
    env,
    (db) =>
      withPlannerStateUpdate(
        db,
        userId,
        async (tx, document) => {
          const currentState =
            document.eventShops[eventUid] ??
            (options.fallbackEventUid ? document.eventShops[options.fallbackEventUid] : undefined) ??
            defaultState;
          const nextState = normalizeEventShopStateForStorage({
            ...currentState,
            existingPaymentItemQuantities: { ...currentState.existingPaymentItemQuantities, ...patch },
          });
          await tx
            .insert(pgEventShopStatesTable)
            .values({
              uid: nanoid(8),
              userId,
              eventUid,
              ...nextState,
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
