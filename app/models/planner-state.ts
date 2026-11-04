import {
  getPostgresPlannerStateDocument,
  type PlannerStateDatabase,
  type PlannerStateDatabaseOptions,
  PlannerStateRevisionConflictError,
  updatePostgresPlannerStateDocument,
} from "~/db/postgres/planner-states";
import { type ApPlannerState, normalizeApPlannerState } from "~/domain/ap-planner";
import type { EventShopState } from "~/domain/event-shop-state";
import {
  type JankenPlannerEntry,
  normalizeJankenPlannerProgress,
  type PlannerStateDocumentV1,
} from "~/domain/planner-state";

export { PLANNER_STATE_REVISION_CONFLICT_MESSAGE } from "~/db/postgres/planner-states";

export type PlannerState = PlannerStateDocumentV1;
export type PyroxenePlannerState = PlannerStateDocumentV1["pyroxene"];
export type EventShopPlannerStates = PlannerStateDocumentV1["eventShops"];
export type ApPlannerStoredState = ApPlannerState | null;

export class InvalidJankenPlannerEntryError extends Error {
  constructor() {
    super("Invalid planner entry.");
    this.name = "InvalidJankenPlannerEntryError";
  }
}

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

export async function saveJankenPlannerEntry(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  shopStateUid: string,
  submitted: JankenPlannerEntry,
  base: JankenPlannerEntry | null,
  options: PlannerStateDatabaseOptions = {},
): Promise<JankenPlannerEntry> {
  const normalizedSubmitted = normalizeJankenPlannerProgress({ [shopStateUid]: submitted })?.[shopStateUid];
  if (!normalizedSubmitted) throw new InvalidJankenPlannerEntryError();
  const normalizedBase =
    base === null ? null : (normalizeJankenPlannerProgress({ [shopStateUid]: base })?.[shopStateUid] ?? null);
  if (base !== null && normalizedBase === null) throw new InvalidJankenPlannerEntryError();
  return updatePostgresPlannerStateDocument(
    env,
    userId,
    async (_tx, document) => {
      const latest = document.jankenProgress[shopStateUid] ?? null;
      const equal = (left: JankenPlannerEntry | null, right: JankenPlannerEntry | null) =>
        JSON.stringify(left) === JSON.stringify(right);
      if (!equal(latest, normalizedBase) && !equal(latest, normalizedSubmitted))
        throw new PlannerStateRevisionConflictError();
      return {
        document: { ...document, jankenProgress: { ...document.jankenProgress, [shopStateUid]: normalizedSubmitted } },
        result: normalizedSubmitted,
      };
    },
    { ...options, retryable: true },
  );
}
