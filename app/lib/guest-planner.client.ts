import type { EventShopState } from "~/domain/event-shop-state";
import {
  createEmptyGuestEventShopPlanner,
  GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY,
  type GuestEventShopPlan,
  type GuestEventShopPlannerEnvelope,
  hasGuestEventShopPlannerData,
  normalizeGuestEventShopPlanner,
} from "~/domain/guest-event-shop-planner";
import {
  createEmptyGuestPlanner,
  createGuestPlannerFromLegacySources,
  createGuestPlannerLegacyMirror,
  GUEST_PLANNER_STORAGE_KEY,
  type GuestPlannerEnvelope,
  type GuestPlannerLegacyMirror,
  type GuestPlannerLegacySources,
  guestPlannerEnvelopeEqual,
  guestPlannerEventShopDataForLegacyMirror,
  guestPlannerHasData,
  guestPlannerPyroxeneDataForLegacyMirror,
  legacyGuestPlannerSources,
  mergeGuestPlannerEventShopPlan,
  mergeGuestPlannerLegacyChanges,
  normalizeGuestPlanner,
} from "~/domain/guest-planner";
import {
  createEmptyGuestPyroxenePlanner,
  GUEST_PYROXENE_PLANNER_STORAGE_KEY,
  type GuestPyroxenePlannerEnvelope,
  hasGuestPyroxenePlannerData,
  parseGuestPyroxenePlanner,
} from "~/domain/guest-pyroxene-planner";

export type GuestPlannerSnapshot =
  | {
      status: "ready" | "memory" | "conflict";
      envelope: GuestPlannerEnvelope;
      legacySources: GuestPlannerLegacySources;
    }
  | {
      status: "corrupt" | "unavailable";
      legacySources: GuestPlannerLegacySources;
    };

type GuestPlannerUpdate = (current: GuestPlannerEnvelope) => GuestPlannerEnvelope;
type RawStorage = { envelope: string | null; pyroxene: string | null; eventShops: string | null };

// M2 keeps AP opaque. A later AP writer must change this helper; otherwise AP-only edits are reverted and treated as unchanged.
function preserveGuestPlannerAp(current: GuestPlannerEnvelope, updated: GuestPlannerEnvelope): GuestPlannerEnvelope {
  return {
    ...updated,
    document: { ...updated.document, ap: current.document.ap },
  };
}

let memorySnapshot: GuestPlannerSnapshot | null = null;
let memoryBaseEnvelope: GuestPlannerEnvelope | null = null;
let publicSnapshotCache: GuestPlannerSnapshot | null = null;
let updateQueue: Promise<void> = Promise.resolve();
let reconcileQueued = false;
const listeners = new Set<() => void>();

function emptyLegacySources(): GuestPlannerLegacySources {
  return {
    pyroxene: null,
    eventShops: null,
    pyroxeneSignature: null,
    eventShopsSignature: null,
    pyroxeneCorrupt: false,
    eventShopsCorrupt: false,
  };
}

function readRawStorage(): RawStorage {
  return {
    envelope: window.localStorage.getItem(GUEST_PLANNER_STORAGE_KEY),
    pyroxene: window.localStorage.getItem(GUEST_PYROXENE_PLANNER_STORAGE_KEY),
    eventShops: window.localStorage.getItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY),
  };
}

function readSources(raw: RawStorage, envelope?: GuestPlannerEnvelope): GuestPlannerLegacySources {
  const sources = legacyGuestPlannerSources(raw.pyroxene, raw.eventShops);
  return {
    ...sources,
    pyroxeneCorrupt: sources.pyroxeneCorrupt || Boolean(envelope?.legacyUnreadable.pyroxene),
    eventShopsCorrupt: sources.eventShopsCorrupt || Boolean(envelope?.legacyUnreadable.eventShops),
  };
}

function sameEnvelope(left: GuestPlannerEnvelope, right: GuestPlannerEnvelope): boolean {
  return guestPlannerEnvelopeEqual(left, right);
}

function sameSnapshot(left: GuestPlannerSnapshot, right: GuestPlannerSnapshot): boolean {
  if (left.status !== right.status || "envelope" in left !== "envelope" in right) return false;
  if ("envelope" in left && "envelope" in right && !sameEnvelope(left.envelope, right.envelope)) return false;
  return JSON.stringify(left.legacySources) === JSON.stringify(right.legacySources);
}

function cacheSnapshot(snapshot: GuestPlannerSnapshot): GuestPlannerSnapshot {
  if (publicSnapshotCache && sameSnapshot(publicSnapshotCache, snapshot)) return publicSnapshotCache;
  publicSnapshotCache = snapshot;
  return snapshot;
}

function emit() {
  for (const listener of listeners) listener();
}

function emptyPyroxeneFromMirror(mirror: GuestPlannerLegacyMirror["pyroxene"]): GuestPyroxenePlannerEnvelope {
  const empty = createEmptyGuestPyroxenePlanner();
  return {
    ...empty,
    datasetId: mirror.datasetId,
    revision: mirror.revision,
    updatedAt: mirror.updatedAt,
    data: {
      ...empty.data,
      options: mirror.data.options,
    },
  };
}

function emptyEventShopsFromMirror(mirror: GuestPlannerLegacyMirror["eventShops"]): GuestEventShopPlannerEnvelope {
  const empty = createEmptyGuestEventShopPlanner();
  return { ...empty, datasetId: mirror.datasetId, revision: mirror.revision, updatedAt: mirror.updatedAt };
}

function parseLegacy(raw: RawStorage) {
  const sources = legacyGuestPlannerSources(raw.pyroxene, raw.eventShops);
  return {
    sources,
    pyroxene: sources.pyroxene,
    eventShops: sources.eventShops,
  };
}

function initialEnvelope(raw: RawStorage): GuestPlannerEnvelope {
  const legacy = parseLegacy(raw);
  const envelope =
    legacy.pyroxene || legacy.eventShops
      ? createGuestPlannerFromLegacySources({ pyroxene: legacy.pyroxene, eventShops: legacy.eventShops })
      : createEmptyGuestPlanner();
  envelope.legacyUnreadable = {
    pyroxene: raw.pyroxene !== null && !legacy.pyroxene ? raw.pyroxene : null,
    eventShops: raw.eventShops !== null && !legacy.eventShops ? raw.eventShops : null,
  };
  const blankPyroxene = createEmptyGuestPyroxenePlanner();
  const blankEventShops = createEmptyGuestEventShopPlanner();
  envelope.legacyMirror = createGuestPlannerLegacyMirror(envelope, {
    pyroxene: legacy.pyroxene ?? blankPyroxene,
    eventShops: legacy.eventShops ?? blankEventShops,
  });
  return envelope;
}

function withCurrentMirror(envelope: GuestPlannerEnvelope): GuestPlannerEnvelope {
  if (envelope.legacyMirror) return envelope;
  return { ...envelope, legacyMirror: createGuestPlannerLegacyMirror(envelope, null) };
}

function mirrorForWrite(envelope: GuestPlannerEnvelope, raw: RawStorage): GuestPlannerEnvelope {
  const legacy = parseLegacy(raw);
  const previous = envelope.legacyMirror ?? createGuestPlannerLegacyMirror(envelope, null);
  const now = new Date().toISOString();
  const pyroxeneRevision = Math.max(previous.pyroxene.revision, legacy.pyroxene?.revision ?? 0) + 1;
  const eventShopsRevision = Math.max(previous.eventShops.revision, legacy.eventShops?.revision ?? 0) + 1;
  const mirror: GuestPlannerLegacyMirror = {
    pyroxene: {
      version: 1,
      datasetId: previous.pyroxene.datasetId,
      revision: pyroxeneRevision,
      updatedAt: now,
      data: guestPlannerPyroxeneDataForLegacyMirror(envelope, previous.pyroxene.data),
    },
    eventShops: {
      version: 1,
      datasetId: previous.eventShops.datasetId,
      revision: eventShopsRevision,
      updatedAt: now,
      data: guestPlannerEventShopDataForLegacyMirror(envelope),
    },
  };
  return { ...envelope, legacyMirror: mirror };
}

function writeConfirmed(envelope: GuestPlannerEnvelope, raw: RawStorage): GuestPlannerEnvelope | null {
  const validEnvelope = normalizeGuestPlanner(envelope);
  if (!validEnvelope) return null;
  let next: GuestPlannerEnvelope;
  try {
    next = mirrorForWrite(validEnvelope, raw);
  } catch {
    return null;
  }
  if (!normalizeGuestPlanner(next)) return null;
  const pyroCorrupt = raw.pyroxene !== null && !parseGuestPyroxenePlanner(raw.pyroxene);
  let eventShopCorrupt = false;
  if (raw.eventShops !== null) {
    try {
      eventShopCorrupt = !normalizeGuestEventShopPlanner(JSON.parse(raw.eventShops) as unknown);
    } catch {
      eventShopCorrupt = true;
    }
  }
  try {
    if (!pyroCorrupt) {
      const serializedPyroxene = JSON.stringify(next.legacyMirror?.pyroxene);
      window.localStorage.setItem(GUEST_PYROXENE_PLANNER_STORAGE_KEY, serializedPyroxene);
      if (window.localStorage.getItem(GUEST_PYROXENE_PLANNER_STORAGE_KEY) !== serializedPyroxene) return null;
    }
    if (!eventShopCorrupt) {
      const serializedEventShops = JSON.stringify(next.legacyMirror?.eventShops);
      window.localStorage.setItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, serializedEventShops);
      if (window.localStorage.getItem(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY) !== serializedEventShops) return null;
    }
    const serializedEnvelope = JSON.stringify(next);
    window.localStorage.setItem(GUEST_PLANNER_STORAGE_KEY, serializedEnvelope);
    const stored = window.localStorage.getItem(GUEST_PLANNER_STORAGE_KEY);
    if (stored !== serializedEnvelope || !normalizeGuestPlanner(JSON.parse(stored) as unknown)) return null;
    return next;
  } catch {
    return null;
  }
}

function makeSnapshot(envelope: GuestPlannerEnvelope, status: "ready" | "memory" | "conflict", raw: RawStorage) {
  return { status, envelope, legacySources: readSources(raw, envelope) } satisfies GuestPlannerSnapshot;
}

function noDataEnvelope(raw: RawStorage): GuestPlannerEnvelope {
  if (memorySnapshot && "envelope" in memorySnapshot) {
    if (
      memorySnapshot.status === "memory" ||
      memorySnapshot.status === "conflict" ||
      guestPlannerHasData(memorySnapshot.envelope) ||
      (raw.pyroxene === null && raw.eventShops === null)
    ) {
      return memorySnapshot.envelope;
    }
  }
  return initialEnvelope(raw);
}

function detectLegacyChanges(envelope: GuestPlannerEnvelope, raw: RawStorage): boolean {
  const mirror = envelope.legacyMirror;
  if (!mirror) return true;
  const legacy = parseLegacy(raw);
  const unreadableChanged =
    (raw.pyroxene !== null && !legacy.pyroxene && envelope.legacyUnreadable.pyroxene !== raw.pyroxene) ||
    (raw.eventShops !== null && !legacy.eventShops && envelope.legacyUnreadable.eventShops !== raw.eventShops);
  if (raw.pyroxene === null && hasGuestPyroxenePlannerData(mirror.pyroxene.data)) return true;
  if (raw.eventShops === null && hasGuestEventShopPlannerData(mirror.eventShops.data)) return true;
  const pyroxeneData =
    legacy.pyroxene?.data ??
    (raw.pyroxene !== null ? mirror.pyroxene.data : emptyPyroxeneFromMirror(mirror.pyroxene).data);
  const eventShopData =
    legacy.eventShops?.data ??
    (raw.eventShops !== null ? mirror.eventShops.data : emptyEventShopsFromMirror(mirror.eventShops).data);
  return (
    unreadableChanged ||
    JSON.stringify(pyroxeneData) !== JSON.stringify(mirror.pyroxene.data) ||
    JSON.stringify(eventShopData) !== JSON.stringify(mirror.eventShops.data)
  );
}

function readSnapshot(): GuestPlannerSnapshot {
  if (typeof window === "undefined") return { status: "unavailable", legacySources: emptyLegacySources() };
  if (memorySnapshot?.status === "memory" || memorySnapshot?.status === "conflict") {
    return cacheSnapshot(memorySnapshot);
  }
  let raw: RawStorage;
  try {
    raw = readRawStorage();
  } catch {
    return { status: "unavailable", legacySources: emptyLegacySources() };
  }
  if (raw.envelope === null) {
    const memoryEnvelopeSnapshot = memorySnapshot && "envelope" in memorySnapshot ? memorySnapshot : null;
    const useMemoryEnvelope = Boolean(
      memoryEnvelopeSnapshot &&
        (memoryEnvelopeSnapshot.status === "memory" ||
          memoryEnvelopeSnapshot.status === "conflict" ||
          guestPlannerHasData(memoryEnvelopeSnapshot.envelope) ||
          (raw.pyroxene === null && raw.eventShops === null)),
    );
    const shouldMigrateLegacyKeys = !useMemoryEnvelope && (raw.pyroxene !== null || raw.eventShops !== null);
    const envelope = useMemoryEnvelope ? noDataEnvelope(raw) : initialEnvelope(raw);
    if (shouldMigrateLegacyKeys || detectLegacyChanges(envelope, raw)) scheduleReconcile();
    const snapshot = cacheSnapshot(makeSnapshot(envelope, "ready", raw));
    memorySnapshot = snapshot;
    return snapshot;
  }
  let envelope: GuestPlannerEnvelope | null = null;
  try {
    envelope = normalizeGuestPlanner(JSON.parse(raw.envelope) as unknown);
  } catch {
    // Report malformed saved data below.
  }
  if (!envelope) return cacheSnapshot({ status: "corrupt", legacySources: parseLegacy(raw).sources });
  const needsMirrorInitialization = envelope.legacyMirror === null;
  envelope = withCurrentMirror(envelope);
  if (needsMirrorInitialization || detectLegacyChanges(envelope, raw)) scheduleReconcile();
  const snapshot = makeSnapshot(envelope, "ready", raw);
  memorySnapshot = snapshot;
  return cacheSnapshot(snapshot);
}

function withLocks<T>(operation: () => Promise<T> | T): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(operation());
  return (async () => {
    let result!: T;
    await navigator.locks.request(GUEST_PLANNER_STORAGE_KEY, async () => {
      await navigator.locks.request(GUEST_PYROXENE_PLANNER_STORAGE_KEY, async () => {
        await navigator.locks.request(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, async () => {
          result = await operation();
        });
      });
    });
    return result;
  })();
}

function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
  const result = updateQueue.then(() => withLocks(operation));
  updateQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function updateIncomingLegacyUnreadable(envelope: GuestPlannerEnvelope, raw: RawStorage): GuestPlannerEnvelope {
  const legacy = parseLegacy(raw);
  const unreadable = {
    pyroxene: raw.pyroxene !== null && !legacy.pyroxene ? raw.pyroxene : null,
    eventShops: raw.eventShops !== null && !legacy.eventShops ? raw.eventShops : null,
  };
  if (
    envelope.legacyUnreadable.pyroxene === unreadable.pyroxene &&
    envelope.legacyUnreadable.eventShops === unreadable.eventShops
  ) {
    return envelope;
  }
  return { ...envelope, legacyUnreadable: unreadable };
}

function reconcileCurrentStorage(): GuestPlannerSnapshot {
  let raw: RawStorage;
  try {
    raw = readRawStorage();
  } catch {
    if (memorySnapshot?.status === "memory" || memorySnapshot?.status === "conflict") return memorySnapshot;
    return { status: "unavailable", legacySources: emptyLegacySources() };
  }
  let legacy = parseLegacy(raw);
  let envelope: GuestPlannerEnvelope | null = null;
  if (raw.envelope !== null) {
    try {
      envelope = normalizeGuestPlanner(JSON.parse(raw.envelope) as unknown);
    } catch {
      envelope = null;
    }
    if (!envelope) {
      const corrupt: GuestPlannerSnapshot = { status: "corrupt", legacySources: legacy.sources };
      memorySnapshot = corrupt;
      return corrupt;
    }
  } else if (memorySnapshot && "envelope" in memorySnapshot) {
    envelope = memorySnapshot.envelope;
  } else {
    envelope = initialEnvelope(raw);
  }
  if (!envelope) envelope = initialEnvelope(raw);

  if (memorySnapshot?.status === "memory" && memoryBaseEnvelope) {
    if (raw.envelope !== null) {
      const stored = normalizeGuestPlanner(JSON.parse(raw.envelope) as unknown);
      if (stored && stored.revision !== memoryBaseEnvelope.revision) {
        const conflict = makeSnapshot(memorySnapshot.envelope, "conflict", raw);
        memorySnapshot = conflict;
        return conflict;
      }
    }
    envelope = memorySnapshot.envelope;
  }

  legacy = parseLegacy(raw);

  const hadLegacyMirror = envelope.legacyMirror !== null;
  const oldUnreadable = envelope.legacyUnreadable;
  envelope = updateIncomingLegacyUnreadable(withCurrentMirror(envelope), raw);
  const mirror = envelope.legacyMirror;
  if (!mirror) throw new Error("Guest planner mirror is missing.");
  const submittedPyroxene =
    raw.pyroxene === null && hadLegacyMirror
      ? emptyPyroxeneFromMirror(mirror.pyroxene)
      : raw.pyroxene === null
        ? mirror.pyroxene
        : (legacy.pyroxene ?? mirror.pyroxene);
  const submittedEventShops =
    raw.eventShops === null && hadLegacyMirror
      ? emptyEventShopsFromMirror(mirror.eventShops)
      : raw.eventShops === null
        ? mirror.eventShops
        : (legacy.eventShops ?? mirror.eventShops);
  const merged = mergeGuestPlannerLegacyChanges(envelope, submittedPyroxene, submittedEventShops);
  let next = preserveGuestPlannerAp(envelope, merged.envelope);
  const unreadableChanged =
    envelope.legacyUnreadable.pyroxene !== oldUnreadable.pyroxene ||
    envelope.legacyUnreadable.eventShops !== oldUnreadable.eventShops;
  const mustInitializeMirror = !hadLegacyMirror;
  const mustCreateMissingKeys = raw.pyroxene === null || raw.eventShops === null;
  const needsWrite =
    raw.envelope === null || merged.changed || unreadableChanged || mustInitializeMirror || mustCreateMissingKeys;
  if (!needsWrite) {
    const status = memorySnapshot?.status === "memory" && memoryBaseEnvelope ? "memory" : "ready";
    const snapshot = makeSnapshot(next, status, raw);
    memorySnapshot = snapshot;
    return snapshot;
  }

  next = {
    ...next,
    revision: envelope.revision + (merged.changed || unreadableChanged ? 1 : 0),
    updatedAt: new Date().toISOString(),
  };
  const confirmed = writeConfirmed(next, raw);
  if (confirmed) {
    const afterRaw = readRawStorage();
    const snapshot = makeSnapshot(confirmed, "ready", afterRaw);
    memoryBaseEnvelope = null;
    memorySnapshot = snapshot;
    publicSnapshotCache = snapshot;
    return snapshot;
  }
  memoryBaseEnvelope ??= envelope;
  const snapshot = makeSnapshot(next, "memory", raw);
  memorySnapshot = snapshot;
  return snapshot;
}

function scheduleReconcile() {
  if (reconcileQueued || typeof window === "undefined") return;
  reconcileQueued = true;
  void enqueue(() => reconcileCurrentStorage())
    .catch(() => undefined)
    .finally(() => {
      reconcileQueued = false;
      publicSnapshotCache = null;
      emit();
    });
}

export function readGuestPlanner(): GuestPlannerSnapshot {
  return readSnapshot();
}

export function updateGuestPlanner(update: GuestPlannerUpdate): Promise<GuestPlannerSnapshot> {
  return enqueue(() => {
    const reconciled = reconcileCurrentStorage();
    if (!("envelope" in reconciled) || reconciled.status === "conflict") {
      return reconciled;
    }
    const nextFromUpdate = preserveGuestPlannerAp(reconciled.envelope, update(reconciled.envelope));
    if (guestPlannerEnvelopeEqual(nextFromUpdate, reconciled.envelope)) return reconciled;
    const envelope: GuestPlannerEnvelope = {
      ...nextFromUpdate,
      datasetId: reconciled.envelope.datasetId,
      revision: reconciled.envelope.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    let raw: RawStorage;
    try {
      raw = readRawStorage();
    } catch {
      memoryBaseEnvelope ??= reconciled.envelope;
      const snapshot = makeSnapshot(envelope, "memory", { envelope: null, pyroxene: null, eventShops: null });
      memorySnapshot = snapshot;
      emit();
      return snapshot;
    }
    const confirmed = writeConfirmed(envelope, raw);
    if (confirmed) {
      const afterRaw = readRawStorage();
      const snapshot = makeSnapshot(confirmed, "ready", afterRaw);
      memoryBaseEnvelope = null;
      memorySnapshot = snapshot;
      publicSnapshotCache = snapshot;
      emit();
      return snapshot;
    }
    memoryBaseEnvelope ??= reconciled.envelope;
    const snapshot = makeSnapshot(envelope, "memory", raw);
    memorySnapshot = snapshot;
    publicSnapshotCache = snapshot;
    emit();
    return snapshot;
  });
}

function updateGuestPlannerImmediately(update: GuestPlannerUpdate): GuestPlannerSnapshot {
  if (typeof window === "undefined") return { status: "unavailable", legacySources: emptyLegacySources() };
  const reconciled = reconcileCurrentStorage();
  if (!("envelope" in reconciled) || reconciled.status === "conflict") return reconciled;

  const nextFromUpdate = preserveGuestPlannerAp(reconciled.envelope, update(reconciled.envelope));
  if (guestPlannerEnvelopeEqual(nextFromUpdate, reconciled.envelope)) return reconciled;
  const envelope: GuestPlannerEnvelope = {
    ...nextFromUpdate,
    datasetId: reconciled.envelope.datasetId,
    revision: reconciled.envelope.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  let raw: RawStorage;
  try {
    raw = readRawStorage();
  } catch {
    memoryBaseEnvelope ??= reconciled.envelope;
    const snapshot = makeSnapshot(envelope, "memory", { envelope: null, pyroxene: null, eventShops: null });
    memorySnapshot = snapshot;
    emit();
    return snapshot;
  }

  const confirmed = writeConfirmed(envelope, raw);
  if (confirmed) {
    const snapshot = makeSnapshot(confirmed, "ready", {
      envelope: JSON.stringify(confirmed),
      pyroxene: JSON.stringify(confirmed.legacyMirror?.pyroxene ?? null),
      eventShops: JSON.stringify(confirmed.legacyMirror?.eventShops ?? null),
    });
    memoryBaseEnvelope = null;
    memorySnapshot = snapshot;
    publicSnapshotCache = snapshot;
    emit();
    return snapshot;
  }

  memoryBaseEnvelope ??= reconciled.envelope;
  const snapshot = makeSnapshot(envelope, "memory", raw);
  memorySnapshot = snapshot;
  publicSnapshotCache = snapshot;
  emit();
  return snapshot;
}

/** Flush a pending event-shop edit against a fresh synchronous storage read before page teardown. */
export function flushGuestPlannerEventShopPlan(
  plan: GuestEventShopPlan,
  baseState: EventShopState,
): GuestPlannerSnapshot {
  return updateGuestPlannerImmediately((envelope) => mergeGuestPlannerEventShopPlan(envelope, { ...plan, baseState }));
}

export function resetGuestPlanner(): Promise<GuestPlannerSnapshot> {
  return enqueue(() => {
    let raw: RawStorage;
    try {
      raw = readRawStorage();
    } catch {
      const snapshot: GuestPlannerSnapshot = { status: "unavailable", legacySources: emptyLegacySources() };
      memorySnapshot = snapshot;
      return snapshot;
    }
    const current = reconcileCurrentStorage();
    const currentEnvelope = "envelope" in current ? current.envelope : null;
    const emptyEnvelope = createEmptyGuestPlanner(currentEnvelope?.datasetId ?? createEmptyGuestPlanner().datasetId);
    const envelope = currentEnvelope ? preserveGuestPlannerAp(currentEnvelope, emptyEnvelope) : emptyEnvelope;
    envelope.revision = "envelope" in current ? current.envelope.revision + 1 : 1;
    envelope.updatedAt = new Date().toISOString();
    if ("envelope" in current) envelope.legacyMirror = current.envelope.legacyMirror;
    const confirmed = writeConfirmed(envelope, raw);
    if (!confirmed) {
      memorySnapshot = makeSnapshot(envelope, "memory", raw);
      memoryBaseEnvelope = "envelope" in current ? current.envelope : null;
      emit();
      return memorySnapshot;
    }
    memoryBaseEnvelope = null;
    memorySnapshot = makeSnapshot(confirmed, "ready", readRawStorage());
    publicSnapshotCache = memorySnapshot;
    emit();
    return memorySnapshot;
  });
}

export function subscribeGuestPlanner(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === GUEST_PLANNER_STORAGE_KEY ||
      event.key === GUEST_PYROXENE_PLANNER_STORAGE_KEY ||
      event.key === GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY
    ) {
      publicSnapshotCache = null;
      if (event.key !== GUEST_PLANNER_STORAGE_KEY) scheduleReconcile();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
