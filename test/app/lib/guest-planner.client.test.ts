import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import {
  createEmptyGuestEventShopPlanner,
  GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY,
  normalizeGuestEventShopPlanner,
  upsertGuestEventShopPlan,
} from "~/domain/guest-event-shop-planner";
import {
  clearGuestPlannerSectionsIfUnchanged,
  createEmptyGuestPlanner,
  GUEST_PLANNER_STORAGE_KEY,
  upsertGuestPlannerEventShopPlan,
} from "~/domain/guest-planner";
import {
  createEmptyGuestPyroxenePlanner,
  GUEST_PYROXENE_PLANNER_STORAGE_KEY,
  type GuestPyroxeneRecord,
  parseGuestPyroxenePlanner,
} from "~/domain/guest-pyroxene-planner";
import {
  flushGuestPlannerEventShopPlan,
  readGuestPlanner,
  resetGuestPlanner,
  subscribeGuestPlanner,
  updateGuestPlanner,
} from "~/lib/guest-planner.client";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
let stored: Map<string, string>;
let operations: string[];
let storageListeners: Array<(event: StorageEvent) => void>;
let failWrites = false;
let failReads = false;

function setupWindow() {
  stored = new Map();
  operations = [];
  storageListeners = [];
  failWrites = false;
  failReads = false;
  const localStorage = {
    getItem(key: string) {
      if (failReads) throw new Error("storage unavailable");
      return stored.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (failWrites) throw new Error("storage unavailable");
      operations.push(`set:${key}`);
      stored.set(key, value);
    },
    removeItem(key: string) {
      operations.push(`remove:${key}`);
      stored.delete(key);
    },
  } as Storage;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "storage" && typeof listener === "function") {
          storageListeners.push(listener as (event: StorageEvent) => void);
        }
      },
      removeEventListener: () => undefined,
    },
  });
}

async function resetTestStorage() {
  setupWindow();
  await resetGuestPlanner();
  stored.clear();
  operations = [];
}

function legacyPyroxeneWithResource() {
  const envelope = createEmptyGuestPyroxenePlanner();
  envelope.data.resources = {
    inputAt: "2026-09-01T00:00:00.000Z",
    pyroxene: 1200,
    oneTimeTicket: 1,
    tenTimeTicket: 2,
  };
  return envelope;
}

function legacyEventShop() {
  const envelope = createEmptyGuestEventShopPlanner();
  return {
    ...envelope,
    data: upsertGuestEventShopPlan(envelope.data, {
      timelineUid: "event-timeline-1",
      shopStateUid: "shop-content-1",
      state: createDefaultEventShopState([], ["student-1"]),
    }),
  };
}

function legacyOtherRecord(recordId = "record000001", description = "보상"): GuestPyroxeneRecord {
  return {
    recordId,
    createdAt: "2026-09-01T00:00:00.000Z",
    kind: "other",
    resources: { pyroxene: 20, oneTimeTicket: 0, tenTimeTicket: 0 },
    description,
    date: "2026-09-02T00:00:00.000Z",
  };
}

async function flushQueuedStorageWork() {
  await updateGuestPlanner((current) => current);
}

function dispatchStorage(key: string) {
  for (const listener of storageListeners) listener({ key } as StorageEvent);
}

beforeEach(async () => resetTestStorage());

afterEach(() => {
  if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("unified guest planner storage", () => {
  it("flushes a pending shop plan to the envelope and both legacy mirrors synchronously", () => {
    const plan = {
      timelineUid: "event-timeline-1",
      shopStateUid: "shop-content-1",
      state: createDefaultEventShopState([], ["student-1"]),
    };

    const snapshot = flushGuestPlannerEventShopPlan(plan);

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    const storedEnvelope = JSON.parse(stored.get(GUEST_PLANNER_STORAGE_KEY) ?? "null") as {
      datasetId: string;
      document: { eventShops: Record<string, unknown> };
    };
    const storedPyroxene = parseGuestPyroxenePlanner(stored.get(GUEST_PYROXENE_PLANNER_STORAGE_KEY) ?? "");
    const storedEventShops = normalizeGuestEventShopPlanner(
      JSON.parse(stored.get(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY) ?? "null") as unknown,
    );

    expect(storedEnvelope.document.eventShops[plan.shopStateUid]).toEqual(plan.state);
    expect(storedEventShops?.data.plans[plan.shopStateUid]).toEqual(plan);
    expect(storedPyroxene?.datasetId).toBe(snapshot.envelope.legacyMirror?.pyroxene.datasetId);
    expect(storedEventShops?.datasetId).toBe(snapshot.envelope.legacyMirror?.eventShops.datasetId);
    expect(operations).toEqual([
      `set:${GUEST_PYROXENE_PLANNER_STORAGE_KEY}`,
      `set:${GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY}`,
      `set:${GUEST_PLANNER_STORAGE_KEY}`,
      `set:${GUEST_PYROXENE_PLANNER_STORAGE_KEY}`,
      `set:${GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY}`,
      `set:${GUEST_PLANNER_STORAGE_KEY}`,
    ]);
  });

  it("returns the same snapshot until the stored guest envelope changes", () => {
    const envelope = createEmptyGuestPlanner();
    stored.set(GUEST_PLANNER_STORAGE_KEY, JSON.stringify(envelope));

    const first = readGuestPlanner();
    const unchanged = readGuestPlanner();
    expect(unchanged).toBe(first);

    const changed = {
      ...envelope,
      revision: 1,
      updatedAt: "2026-09-27T00:00:00.000Z",
      document: {
        ...envelope.document,
        pyroxene: {
          ...envelope.document.pyroxene,
          resources: {
            inputAt: "2026-09-27T00:00:00.000Z",
            pyroxene: 1200,
            oneTimeTicket: 1,
            tenTimeTicket: 2,
          },
        },
      },
    };
    stored.set(GUEST_PLANNER_STORAGE_KEY, JSON.stringify(changed));

    const updated = readGuestPlanner();
    expect(updated).not.toBe(first);
    expect(updated.status).toBe("ready");
    if (updated.status === "ready") expect(updated.envelope.document.pyroxene.resources?.pyroxene).toBe(1200);
  });

  it("migrates both legacy keys, keeps them as mirrors, and preserves their receipt dataset IDs", async () => {
    const oldPyroxene = legacyPyroxeneWithResource();
    const oldEventShops = legacyEventShop();
    stored.set(GUEST_PYROXENE_PLANNER_STORAGE_KEY, JSON.stringify(oldPyroxene));
    stored.set(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, JSON.stringify(oldEventShops));

    const beforePersist = readGuestPlanner();
    expect(beforePersist.status).toBe("ready");
    if (beforePersist.status !== "ready") return;
    expect(beforePersist.envelope.document.pyroxene.resources).toMatchObject({ pyroxene: 1200 });
    expect(beforePersist.envelope.document.eventShops["shop-content-1"]).toBeDefined();

    await flushQueuedStorageWork();
    const snapshot = readGuestPlanner();
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(stored.has(GUEST_PYROXENE_PLANNER_STORAGE_KEY)).toBe(true);
    expect(stored.has(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY)).toBe(true);
    expect(operations.filter((operation) => operation.startsWith("remove:"))).toEqual([]);

    const mirroredPyroxene = parseGuestPyroxenePlanner(stored.get(GUEST_PYROXENE_PLANNER_STORAGE_KEY) ?? "");
    const mirroredEventShops = normalizeGuestEventShopPlanner(
      JSON.parse(stored.get(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY) ?? "null") as unknown,
    );
    expect(mirroredPyroxene?.datasetId).toBe(oldPyroxene.datasetId);
    expect(mirroredEventShops?.datasetId).toBe(oldEventShops.datasetId);
    expect(mirroredPyroxene?.revision).toBeGreaterThan(oldPyroxene.revision);
    expect(mirroredEventShops?.revision).toBeGreaterThan(oldEventShops.revision);
    expect(snapshot.envelope.datasetId).toBe(oldPyroxene.datasetId);
    expect(mirroredPyroxene?.data).toEqual(snapshot.envelope.legacyMirror?.pyroxene.data);
    expect(mirroredEventShops?.data).toEqual(snapshot.envelope.legacyMirror?.eventShops.data);
  });

  it("mirrors every canonical write back to both legacy formats", async () => {
    const initial = createEmptyGuestPlanner();
    stored.set(GUEST_PLANNER_STORAGE_KEY, JSON.stringify(initial));
    await flushQueuedStorageWork();
    const before = readGuestPlanner();
    expect(before.status).toBe("ready");
    if (before.status !== "ready") return;
    const pyroId = before.envelope.legacyMirror?.pyroxene.datasetId;
    const shopId = before.envelope.legacyMirror?.eventShops.datasetId;
    const pyroRevision = before.envelope.legacyMirror?.pyroxene.revision ?? 0;
    const shopRevision = before.envelope.legacyMirror?.eventShops.revision ?? 0;

    const saved = await updateGuestPlanner((current) =>
      upsertGuestPlannerEventShopPlan(
        {
          ...current,
          document: {
            ...current.document,
            pyroxene: {
              ...current.document.pyroxene,
              resources: {
                inputAt: "2026-09-02T00:00:00.000Z",
                pyroxene: 2500,
                oneTimeTicket: 2,
                tenTimeTicket: 3,
              },
            },
          },
        },
        {
          timelineUid: "event-timeline-1",
          shopStateUid: "shop-1",
          state: createDefaultEventShopState([], []),
        },
      ),
    );

    expect(saved.status).toBe("ready");
    const mirroredPyroxene = parseGuestPyroxenePlanner(stored.get(GUEST_PYROXENE_PLANNER_STORAGE_KEY) ?? "");
    const mirroredEventShops = normalizeGuestEventShopPlanner(
      JSON.parse(stored.get(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY) ?? "null") as unknown,
    );
    expect(mirroredPyroxene?.data.resources?.pyroxene).toBe(2500);
    expect(mirroredEventShops?.data.plans["shop-1"]?.timelineUid).toBe("event-timeline-1");
    expect(mirroredPyroxene?.datasetId).toBe(pyroId);
    expect(mirroredEventShops?.datasetId).toBe(shopId);
    expect(mirroredPyroxene?.revision).toBeGreaterThan(pyroRevision);
    expect(mirroredEventShops?.revision).toBeGreaterThan(shopRevision);
  });

  it("merges an old-tab record edit and re-mirrors it without changing the legacy dataset ID", async () => {
    const oldPyroxene = legacyPyroxeneWithResource();
    stored.set(GUEST_PYROXENE_PLANNER_STORAGE_KEY, JSON.stringify(oldPyroxene));
    readGuestPlanner();
    await flushQueuedStorageWork();

    const oldTabWrite = parseGuestPyroxenePlanner(stored.get(GUEST_PYROXENE_PLANNER_STORAGE_KEY) ?? "");
    expect(oldTabWrite).not.toBeNull();
    if (!oldTabWrite) return;
    const added = legacyOtherRecord();
    oldTabWrite.data.records = [...oldTabWrite.data.records, added];
    oldTabWrite.revision += 1;
    oldTabWrite.updatedAt = "2026-09-03T00:00:00.000Z";
    stored.set(GUEST_PYROXENE_PLANNER_STORAGE_KEY, JSON.stringify(oldTabWrite));
    dispatchStorage(GUEST_PYROXENE_PLANNER_STORAGE_KEY);

    await flushQueuedStorageWork();
    const snapshot = readGuestPlanner();
    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.envelope.document.pyroxene.records.some((record) => record.uid.startsWith(added.recordId))).toBe(
      true,
    );
    expect(snapshot.envelope.document.pyroxene.resources?.pyroxene).toBe(1200);
    const mirrored = parseGuestPyroxenePlanner(stored.get(GUEST_PYROXENE_PLANNER_STORAGE_KEY) ?? "");
    expect(mirrored?.datasetId).toBe(oldPyroxene.datasetId);
    expect(mirrored?.data.records).toContainEqual(expect.objectContaining({ recordId: added.recordId }));
    expect(mirrored?.revision).toBeGreaterThan(oldTabWrite.revision);
    expect(snapshot.envelope.legacyConflicts).toHaveLength(0);
  });

  it("keeps malformed legacy data and reports the explicit corrupt state", async () => {
    stored.set(GUEST_PYROXENE_PLANNER_STORAGE_KEY, JSON.stringify(legacyPyroxeneWithResource()));
    stored.set(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY, "not-json");
    const snapshot = readGuestPlanner();
    await flushQueuedStorageWork();
    const latest = readGuestPlanner();
    expect(latest.status).toBe("ready");
    if (latest.status !== "ready") return;
    expect(latest.envelope.document.pyroxene.resources?.pyroxene).toBe(1200);
    expect(latest.legacySources.eventShopsCorrupt).toBe(true);
    expect(latest.envelope.legacyUnreadable.eventShops).toBe("not-json");
    expect(stored.get(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY)).toBe("not-json");
    expect(snapshot.status).toBe("ready");
  });

  it("reports storage access failures explicitly", () => {
    failReads = true;
    expect(readGuestPlanner().status).toBe("unavailable");
  });

  it("does not schedule a mirror loop when the new code sees its own mirrored keys", async () => {
    const initial = createEmptyGuestPlanner();
    stored.set(GUEST_PLANNER_STORAGE_KEY, JSON.stringify(initial));
    await flushQueuedStorageWork();
    operations = [];
    const unsubscribe = subscribeGuestPlanner(() => {
      readGuestPlanner();
    });
    dispatchStorage(GUEST_PYROXENE_PLANNER_STORAGE_KEY);
    await flushQueuedStorageWork();
    unsubscribe();
    const writesAfterStorageEvent = operations.filter((operation) => operation.startsWith("set:")).length;
    readGuestPlanner();
    await flushQueuedStorageWork();
    const writesAfterSubsequentReads = operations.filter((operation) => operation.startsWith("set:")).length;
    expect(writesAfterSubsequentReads).toBe(writesAfterStorageEvent);
  });

  it("clears successful import sections from the document and both legacy mirrors", async () => {
    let envelope = createEmptyGuestPlanner();
    envelope.document.pyroxene.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    envelope = upsertGuestPlannerEventShopPlan(envelope, {
      timelineUid: "event-timeline-1",
      shopStateUid: "shop-1",
      state: createDefaultEventShopState([], []),
    });
    stored.set(GUEST_PLANNER_STORAGE_KEY, JSON.stringify(envelope));
    await flushQueuedStorageWork();
    const current = readGuestPlanner();
    expect(current.status).toBe("ready");
    if (current.status !== "ready") return;

    const cleared = await updateGuestPlanner((latest) =>
      clearGuestPlannerSectionsIfUnchanged(latest, current.envelope, ["resources", "eventShops"]),
    );

    expect(cleared.status).toBe("ready");
    if (cleared.status !== "ready") return;
    expect(cleared.envelope.document.pyroxene.resources).toBeNull();
    expect(cleared.envelope.document.eventShops).toEqual({});
    const mirroredPyroxene = parseGuestPyroxenePlanner(stored.get(GUEST_PYROXENE_PLANNER_STORAGE_KEY) ?? "");
    const mirroredEventShops = normalizeGuestEventShopPlanner(
      JSON.parse(stored.get(GUEST_EVENT_SHOP_PLANNER_STORAGE_KEY) ?? "null") as unknown,
    );
    expect(mirroredPyroxene?.data.resources).toBeNull();
    expect(mirroredEventShops?.data.plans).toEqual({});
  });
});
