import {
  getPostgresPlannerStateDocument,
  type PlannerStateDatabase,
  type PlannerStateDatabaseOptions,
  type PlannerStateRevisionConflictError,
  updatePostgresPlannerStateDocument,
} from "~/db/postgres/planner-states";
import { type ApPlannerState, normalizeApPlannerState } from "~/domain/ap-planner";
import type { EventShopState } from "~/domain/event-shop-state";
import type { PlannerStateDocumentV1 } from "~/domain/planner-state";

export { PLANNER_STATE_REVISION_CONFLICT_MESSAGE } from "~/db/postgres/planner-states";

export type PlannerState = PlannerStateDocumentV1;
export type PyroxenePlannerState = PlannerStateDocumentV1["pyroxene"];
export type EventShopPlannerStates = PlannerStateDocumentV1["eventShops"];
export type ApPlannerStoredState = ApPlannerState | null;

export function isPlannerStateRevisionConflictError(error: unknown): error is PlannerStateRevisionConflictError {
  return error instanceof Error && error.name === "PlannerStateRevisionConflictError";
}

export async function getPlannerState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PlannerStateDatabaseOptions = {},
): Promise<PlannerState> {
  return getPostgresPlannerStateDocument(env, userId, options);
}

export async function getPyroxenePlannerState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PlannerStateDatabaseOptions = {},
): Promise<PyroxenePlannerState> {
  return (await getPlannerState(env, userId, options)).pyroxene;
}

export async function getEventShopPlannerState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  options: PlannerStateDatabaseOptions = {},
): Promise<EventShopState | null> {
  const state = (await getPlannerState(env, userId, options)).eventShops[eventUid];
  return state ?? null;
}

export async function getEventShopPlannerStates(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUids: readonly string[],
  options: PlannerStateDatabaseOptions = {},
): Promise<Record<string, EventShopState>> {
  if (eventUids.length === 0) return {};
  const states = (await getPlannerState(env, userId, options)).eventShops;
  return Object.fromEntries(
    [...new Set(eventUids)].flatMap((eventUid) => {
      const state = states[eventUid];
      return state ? [[eventUid, state]] : [];
    }),
  );
}

export async function getApPlannerState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PlannerStateDatabaseOptions = {},
): Promise<ApPlannerStoredState> {
  return (await getPlannerState(env, userId, options)).ap;
}

export async function updateApPlannerState<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  update: (
    transaction: PlannerStateDatabase,
    current: ApPlannerStoredState,
  ) => Promise<{ state: ApPlannerStoredState; result: T }>,
  options: PlannerStateDatabaseOptions = {},
): Promise<T> {
  return updatePostgresPlannerStateDocument(
    env,
    userId,
    async (transaction, currentDocument) => {
      const { state, result } = await update(transaction, currentDocument.ap);
      const normalized = state === null ? null : normalizeApPlannerState(state);
      if (state !== null && normalized === null) throw new Error("AP 플래너 내용을 확인해주세요.");
      return { document: { ...currentDocument, ap: normalized }, result };
    },
    { ...options, retryable: true },
  );
}

export async function updatePyroxenePlannerState<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  update: (
    transaction: PlannerStateDatabase,
    current: PyroxenePlannerState,
  ) => Promise<{ state: PyroxenePlannerState; result: T }>,
  options: PlannerStateDatabaseOptions = {},
): Promise<T> {
  return updatePostgresPlannerStateDocument(
    env,
    userId,
    async (transaction, currentDocument) => {
      const { state, result } = await update(transaction, currentDocument.pyroxene);
      return { document: { ...currentDocument, pyroxene: state }, result };
    },
    { ...options, retryable: true },
  );
}

export async function updateEventShopState<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  eventUid: string,
  update: (
    transaction: PlannerStateDatabase,
    current: EventShopState | null,
  ) => Promise<{ state: EventShopState | null; result: T }>,
  options: PlannerStateDatabaseOptions = {},
): Promise<T> {
  return updatePostgresPlannerStateDocument(
    env,
    userId,
    async (transaction, currentDocument) => {
      const { state, result } = await update(transaction, currentDocument.eventShops[eventUid] ?? null);
      const eventShops = { ...currentDocument.eventShops };
      if (state === null) delete eventShops[eventUid];
      else eventShops[eventUid] = state;
      return { document: { ...currentDocument, eventShops }, result };
    },
    { ...options, retryable: true },
  );
}
