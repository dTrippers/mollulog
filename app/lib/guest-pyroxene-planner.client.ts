import {
  createEmptyGuestPyroxenePlanner,
  GUEST_PYROXENE_PLANNER_STORAGE_KEY,
  type GuestPyroxenePlannerData,
  type GuestPyroxenePlannerEnvelope,
  parseGuestPyroxenePlanner,
} from "~/domain/guest-pyroxene-planner";

export type GuestPyroxeneStorageStatus = "ready" | "memory" | "corrupt";
export type GuestPyroxeneSnapshot = { status: GuestPyroxeneStorageStatus; envelope: GuestPyroxenePlannerEnvelope };

let memorySnapshot: GuestPyroxeneSnapshot | null = null;
let updateQueue = Promise.resolve();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readStorage(): GuestPyroxeneSnapshot {
  if (memorySnapshot?.status === "memory") return memorySnapshot;
  try {
    const raw = window.localStorage.getItem(GUEST_PYROXENE_PLANNER_STORAGE_KEY);
    if (!raw) return { status: "ready", envelope: createEmptyGuestPyroxenePlanner() };
    const envelope = parseGuestPyroxenePlanner(raw);
    if (!envelope) return { status: "corrupt", envelope: createEmptyGuestPyroxenePlanner() };
    return { status: "ready", envelope };
  } catch {
    return memorySnapshot ?? { status: "memory", envelope: createEmptyGuestPyroxenePlanner() };
  }
}

function writeStorage(envelope: GuestPyroxenePlannerEnvelope): GuestPyroxeneSnapshot {
  try {
    window.localStorage.setItem(GUEST_PYROXENE_PLANNER_STORAGE_KEY, JSON.stringify(envelope));
    memorySnapshot = { status: "ready", envelope };
  } catch {
    memorySnapshot = { status: "memory", envelope };
  }
  emit();
  return memorySnapshot;
}

export function readGuestPyroxenePlanner(): GuestPyroxeneSnapshot {
  const snapshot = readStorage();
  memorySnapshot = snapshot;
  return snapshot;
}

export function updateGuestPyroxenePlanner(
  update: (data: GuestPyroxenePlannerData) => GuestPyroxenePlannerData,
): Promise<GuestPyroxeneSnapshot> {
  let result: GuestPyroxeneSnapshot;
  updateQueue = updateQueue.then(async () => {
    const performUpdate = () => {
      const current = readStorage();
      if (current.status === "corrupt") return current;
      const envelope = {
        ...current.envelope,
        revision: current.envelope.revision + 1,
        updatedAt: new Date().toISOString(),
        data: update(current.envelope.data),
      };
      return writeStorage(envelope);
    };
    result = navigator.locks
      ? await navigator.locks.request(GUEST_PYROXENE_PLANNER_STORAGE_KEY, performUpdate)
      : performUpdate();
  });
  return updateQueue.then(() => result);
}

export function resetGuestPyroxenePlanner(): GuestPyroxeneSnapshot {
  const envelope = createEmptyGuestPyroxenePlanner();
  try {
    window.localStorage.removeItem(GUEST_PYROXENE_PLANNER_STORAGE_KEY);
    memorySnapshot = { status: "ready", envelope };
  } catch {
    memorySnapshot = { status: "memory", envelope };
  }
  emit();
  return memorySnapshot;
}

export function subscribeGuestPyroxenePlanner(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === GUEST_PYROXENE_PLANNER_STORAGE_KEY) {
      memorySnapshot = readStorage();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
