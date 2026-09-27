import {
  createEmptyGuestEventShopPlanner,
  GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY,
  type GuestEventShopPlan,
  type GuestEventShopPlannerData,
  type GuestEventShopPlannerEnvelope,
  guestEventShopPlansEqual,
  parseGuestEventShopPlanner,
  upsertGuestEventShopPlan,
} from "~/domain/guest-event-shop-planner";

export type GuestEventShopPlannerSnapshot =
  | { status: "ready" | "memory" | "conflict"; envelope: GuestEventShopPlannerEnvelope }
  | { status: "corrupt" | "unavailable" };

type Listener = () => void;

let memorySnapshot: GuestEventShopPlannerSnapshot | null = null;
let memoryBaseEnvelope: GuestEventShopPlannerEnvelope | null = null;
let updateQueue: Promise<void> = Promise.resolve();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function readStorage(): GuestEventShopPlannerSnapshot {
  if (typeof window === "undefined") return { status: "unavailable" };
  if (memorySnapshot?.status === "memory" || memorySnapshot?.status === "conflict") return memorySnapshot;
  try {
    const value = window.localStorage.getItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY);
    if (value === null) {
      return { status: "ready", envelope: createEmptyGuestEventShopPlanner() };
    }
    const envelope = parseGuestEventShopPlanner(value);
    return envelope ? { status: "ready", envelope } : { status: "corrupt" };
  } catch {
    if (memorySnapshot?.status === "ready") {
      memoryBaseEnvelope ??= memorySnapshot.envelope;
      memorySnapshot = { status: "memory", envelope: memorySnapshot.envelope };
      return memorySnapshot;
    }
    return memorySnapshot ?? { status: "unavailable" };
  }
}

function writeStorage(envelope: GuestEventShopPlannerEnvelope): GuestEventShopPlannerSnapshot {
  if (typeof window === "undefined") return { status: "unavailable" };
  try {
    window.localStorage.setItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, JSON.stringify(envelope));
    const snapshot: GuestEventShopPlannerSnapshot = { status: "ready", envelope };
    memorySnapshot = snapshot;
    memoryBaseEnvelope = null;
    return snapshot;
  } catch {
    const snapshot: GuestEventShopPlannerSnapshot = { status: "memory", envelope };
    memorySnapshot = snapshot;
    return snapshot;
  }
}

export function readGuestEventShopPlanner(): GuestEventShopPlannerSnapshot {
  const snapshot = readStorage();
  if (snapshot.status === "ready" || snapshot.status === "corrupt") memorySnapshot = snapshot;
  return snapshot;
}

export function updateGuestEventShopPlanner(
  update: (data: GuestEventShopPlannerData) => GuestEventShopPlannerData,
): Promise<GuestEventShopPlannerSnapshot> {
  const runUpdate = async () => {
    const current = readStorage();
    if (current.status === "corrupt" || current.status === "conflict") return current;

    let envelope =
      current.status === "ready" || current.status === "memory"
        ? current.envelope
        : memorySnapshot?.status === "memory"
          ? memorySnapshot.envelope
          : createEmptyGuestEventShopPlanner();
    if (current.status === "memory" && memoryBaseEnvelope && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY);
        const stored =
          raw === null
            ? memoryBaseEnvelope.revision === 0 && !hasPlans(memoryBaseEnvelope)
              ? memoryBaseEnvelope
              : null
            : parseGuestEventShopPlanner(raw);
        if (stored) {
          const merged = mergeMemoryWithStoredEnvelope(memoryBaseEnvelope, current.envelope, stored);
          if (!merged) {
            const conflict: GuestEventShopPlannerSnapshot = { status: "conflict", envelope: current.envelope };
            memorySnapshot = conflict;
            emit();
            return conflict;
          }
          envelope = merged;
        } else if (raw !== null || memoryBaseEnvelope.revision > 0 || hasPlans(memoryBaseEnvelope)) {
          const conflict: GuestEventShopPlannerSnapshot = { status: "conflict", envelope: current.envelope };
          memorySnapshot = conflict;
          emit();
          return conflict;
        }
      } catch {
        // Keep the current memory draft and let writeStorage report whether it can persist now.
      }
    }
    memoryBaseEnvelope ??= current.status === "ready" || current.status === "memory" ? current.envelope : envelope;
    const nextEnvelope: GuestEventShopPlannerEnvelope = {
      ...envelope,
      revision: envelope.revision + 1,
      updatedAt: new Date().toISOString(),
      data: update(envelope.data),
    };
    const snapshot = writeStorage(nextEnvelope);
    memorySnapshot = snapshot;
    emit();
    return snapshot;
  };

  const runWithLock = async (): Promise<GuestEventShopPlannerSnapshot> => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, runUpdate);
    }
    return await runUpdate();
  };

  const result = updateQueue.then(runWithLock);
  updateQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function persistGuestEventShopPlanImmediately(input: GuestEventShopPlan): GuestEventShopPlannerSnapshot {
  if (typeof window === "undefined") return { status: "unavailable" };
  if (memorySnapshot?.status === "corrupt" || memorySnapshot?.status === "conflict") return memorySnapshot;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY);
  } catch {
    const cached = memorySnapshot?.status === "ready" || memorySnapshot?.status === "memory" ? memorySnapshot : null;
    if (!cached) return { status: "unavailable" };
    memoryBaseEnvelope ??= cached.status === "ready" ? cached.envelope : null;
    const nextEnvelope = {
      ...cached.envelope,
      revision: cached.envelope.revision + 1,
      updatedAt: new Date().toISOString(),
      data: upsertGuestEventShopPlan(cached.envelope.data, input),
    };
    const snapshot: GuestEventShopPlannerSnapshot = { status: "memory", envelope: nextEnvelope };
    memorySnapshot = snapshot;
    emit();
    return snapshot;
  }

  let stored: GuestEventShopPlannerEnvelope;
  if (raw === null) {
    const base = memoryBaseEnvelope;
    if (base && (base.revision > 0 || hasPlans(base))) {
      const conflict: GuestEventShopPlannerSnapshot = {
        status: "conflict",
        envelope: memorySnapshot?.status === "memory" ? memorySnapshot.envelope : base,
      };
      memorySnapshot = conflict;
      emit();
      return conflict;
    }
    stored = base ?? createEmptyGuestEventShopPlanner();
  } else {
    const parsed = parseGuestEventShopPlanner(raw);
    if (!parsed) return { status: "corrupt" };
    stored = parsed;
  }

  let envelope = stored;
  if (memorySnapshot?.status === "memory") {
    const base = memoryBaseEnvelope;
    if (!base) return { status: "unavailable" };
    const merged = mergeMemoryWithStoredEnvelope(base, memorySnapshot.envelope, stored);
    if (!merged) {
      const conflict: GuestEventShopPlannerSnapshot = { status: "conflict", envelope: memorySnapshot.envelope };
      memorySnapshot = conflict;
      emit();
      return conflict;
    }
    envelope = merged;
  }

  memoryBaseEnvelope ??= stored;
  const nextEnvelope: GuestEventShopPlannerEnvelope = {
    ...envelope,
    revision: envelope.revision + 1,
    updatedAt: new Date().toISOString(),
    data: upsertGuestEventShopPlan(envelope.data, input),
  };
  const result = writeStorage(nextEnvelope);
  memorySnapshot = result;
  if (result.status === "memory") memoryBaseEnvelope ??= stored;
  emit();
  return result;
}

function sameStoredPlan(left: GuestEventShopPlan | undefined, right: GuestEventShopPlan | undefined): boolean {
  if (!left || !right) return left === right;
  return left.timelineUid === right.timelineUid && guestEventShopPlansEqual(left, right);
}

function hasPlans(envelope: GuestEventShopPlannerEnvelope): boolean {
  return Object.keys(envelope.data.plans).length > 0;
}

function mergeMemoryWithStoredEnvelope(
  base: GuestEventShopPlannerEnvelope,
  local: GuestEventShopPlannerEnvelope,
  stored: GuestEventShopPlannerEnvelope,
): GuestEventShopPlannerEnvelope | null {
  if (stored.datasetId !== base.datasetId) return null;

  const plans = { ...stored.data.plans };
  const keys = new Set([...Object.keys(base.data.plans), ...Object.keys(local.data.plans)]);
  for (const shopStateUid of keys) {
    const basePlan = base.data.plans[shopStateUid];
    const localPlan = local.data.plans[shopStateUid];
    if (sameStoredPlan(basePlan, localPlan)) continue;

    const storedPlan = stored.data.plans[shopStateUid];
    if (!sameStoredPlan(basePlan, storedPlan) && !sameStoredPlan(localPlan, storedPlan)) return null;
    if (localPlan) plans[shopStateUid] = localPlan;
    else delete plans[shopStateUid];
  }

  return {
    ...stored,
    revision: Math.max(stored.revision, local.revision) + 1,
    updatedAt: new Date().toISOString(),
    data: { ...stored.data, plans },
  };
}

export function retryGuestEventShopPlannerPersistence(): Promise<GuestEventShopPlannerSnapshot> {
  const initialSnapshot = memorySnapshot;
  if (initialSnapshot?.status !== "memory") {
    return Promise.resolve(initialSnapshot ?? readGuestEventShopPlanner());
  }

  const runRetry = async (): Promise<GuestEventShopPlannerSnapshot> => {
    const localSnapshot = memorySnapshot;
    if (localSnapshot?.status !== "memory") return localSnapshot ?? readGuestEventShopPlanner();
    const base = memoryBaseEnvelope;
    if (!base || typeof window === "undefined") return { status: "unavailable" };

    let raw: string | null;
    try {
      raw = window.localStorage.getItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY);
    } catch {
      return localSnapshot;
    }

    let stored: GuestEventShopPlannerEnvelope;
    if (raw === null) {
      if (base.revision > 0 || hasPlans(base)) {
        const conflict: GuestEventShopPlannerSnapshot = { status: "conflict", envelope: localSnapshot.envelope };
        memorySnapshot = conflict;
        emit();
        return conflict;
      }
      stored = base;
    } else {
      const parsed = parseGuestEventShopPlanner(raw);
      if (!parsed) {
        const conflict: GuestEventShopPlannerSnapshot = { status: "conflict", envelope: localSnapshot.envelope };
        memorySnapshot = conflict;
        emit();
        return conflict;
      }
      stored = parsed;
    }

    const merged = mergeMemoryWithStoredEnvelope(base, localSnapshot.envelope, stored);
    if (!merged) {
      const conflict: GuestEventShopPlannerSnapshot = { status: "conflict", envelope: localSnapshot.envelope };
      memorySnapshot = conflict;
      emit();
      return conflict;
    }

    const result = writeStorage(merged);
    memorySnapshot = result;
    if (result.status === "memory") memoryBaseEnvelope = base;
    emit();
    return result;
  };

  const runWithLock = async (): Promise<GuestEventShopPlannerSnapshot> => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, runRetry);
    }
    return await runRetry();
  };
  const result = updateQueue.then(runWithLock);
  updateQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function subscribeGuestEventShopPlanner(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window === "undefined") {
    return () => listeners.delete(listener);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY) {
      if (memorySnapshot?.status !== "memory" && memorySnapshot?.status !== "conflict") {
        memorySnapshot = readStorage();
      }
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
