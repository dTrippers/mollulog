import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  patchPostgresEventShopStateOwnedQuantities,
  upsertPostgresEventShopState,
} from "~/db/postgres/event-shop-state";
import { createDefaultEventShopState, type EventShopState } from "~/domain/event-shop-state";
import { type PlannerStateDocumentV1, projectPlannerStateDocument } from "~/domain/planner-state";
import { getEventShopStates } from "~/models/event-shop-state";
import { FakePostgresClient } from "../../../helpers/fake-postgres";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function createClient(options: { failOn?: string } = {}) {
  const events: string[] = [];
  const query = jest.fn(async (config: { text: string; values?: unknown[] } | string, _values?: unknown[]) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (options.failOn && text.toLowerCase().includes(options.failOn.toLowerCase())) {
      throw new Error("query failed");
    }
    if (text.includes('insert into "planner_states"')) return { rows: [[1]], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, events, query };
}

function findStatementValues(query: ReturnType<typeof createClient>["query"], table: string): unknown[] {
  const call = query.mock.calls.find(([config]) => {
    const text = typeof config === "string" ? config : config.text;
    return text.includes(`insert into "${table}"`);
  });
  return (call?.[1] ?? []) as unknown[];
}

function createProjectionClient(eventShopStates: Record<string, unknown>[] = []) {
  const tables = { event_shop_state_history: [] };
  const plannerStates = eventShopStates.length
    ? [
        {
          id: 1,
          userId: 7,
          revision: 1,
          document: projectPlannerStateDocument({
            resources: [],
            timelineItems: [],
            plannerOptions: [],
            collectedSources: [],
            eventData: [],
            eventShops: eventShopStates,
          }),
        },
      ]
    : [];
  return new FakePostgresClient({ ...tables, planner_states: plannerStates });
}

function expectNoLegacyShopStateStatements(client: FakePostgresClient) {
  expect(client.statements.some((statement) => statement.includes('"event_shop_states"'))).toBe(false);
}

function getStoredPlannerDocument(client: FakePostgresClient): PlannerStateDocumentV1 {
  const row = client.tables.planner_states?.[0];
  if (!row) throw new Error("Expected a planner state row");
  return (typeof row.document === "string" ? JSON.parse(row.document) : row.document) as PlannerStateDocumentV1;
}

describe("PostgreSQL event shop state", () => {
  it("loads a deduplicated batch from planner_states without querying legacy shop rows", async () => {
    const savedState = { ...createDefaultEventShopState([], ["student-1"]), itemQuantities: { "daily-ticket": 60 } };
    const client = createProjectionClient([{ uid: "shop-state-1", userId: 7, eventUid: "shop-1", ...savedState }]);

    const states = await getEventShopStates(env, 7, ["shop-1", "shop-2", "shop-1"], {
      createClient: () => client as unknown as Client,
    });

    expect(states).toEqual({ "shop-1": savedState });
    expect(client.statements.some((statement) => statement.includes('from "planner_states"'))).toBe(true);
    expect(client.statements.some((statement) => statement.includes('from "event_shop_states"'))).toBe(false);
  });

  it("stores an event shop upsert in the planner state document", async () => {
    const client = createProjectionClient();
    const state: EventShopState = {
      ...createDefaultEventShopState([], ["student-1"]),
      itemQuantities: { "daily-ticket": 60 },
      itemPurchaseDays: { "daily-ticket": 1 },
      minigamePlayCount: 3,
    };

    await upsertPostgresEventShopState(env, 7, "event-1", state, {
      createClient: () => client as unknown as Client,
    });

    expect(getStoredPlannerDocument(client).eventShops["event-1"]).toEqual(state);
    expect(client.tables.event_shop_state_history).toHaveLength(1);
    expectNoLegacyShopStateStatements(client);
  });

  it("merges an owned-quantity patch into the stored shop state without replacing other settings", async () => {
    const existingState: EventShopState = {
      ...createDefaultEventShopState([], ["student-existing"]),
      itemQuantities: { "daily-ticket": 60 },
      existingPaymentItemQuantities: { "currency-1": 10, "currency-kept": 5 },
    };
    const client = createProjectionClient([{ uid: "shop-state-1", userId: 7, eventUid: "shop-1", ...existingState }]);
    const patch = { "currency-1": 0, "currency-2": 240 };

    await patchPostgresEventShopStateOwnedQuantities(
      env,
      7,
      "shop-1",
      patch,
      createDefaultEventShopState([], ["student-new"]),
      { createClient: () => client as unknown as Client },
    );

    expect(getStoredPlannerDocument(client).eventShops["shop-1"]).toEqual({
      ...existingState,
      existingPaymentItemQuantities: { "currency-1": 0, "currency-kept": 5, "currency-2": 240 },
    });
    expect(client.tables.event_shop_state_history).toEqual([]);
    expectNoLegacyShopStateStatements(client);
  });

  it("merges stale submissions against the latest locked document and preserves unrelated fields", async () => {
    const fallbackEventUid = "timeline-event-1";
    const canonicalEventUid = "shop-content-1";
    const baseState: EventShopState = {
      ...createDefaultEventShopState([], ["student-existing"]),
      itemQuantities: { "daily-ticket": 1 },
      itemPurchaseDays: { "daily-ticket": 2 },
      existingPaymentItemQuantities: { "currency-1": 10 },
      minigamePlayCount: 3,
    };
    const client = createProjectionClient([
      { uid: "fallback-state", userId: 7, eventUid: fallbackEventUid, ...baseState },
    ]);
    const requestedPurchase = { ...baseState, itemQuantities: { "daily-ticket": 3 } };
    const requestedCurrency = {
      ...baseState,
      existingPaymentItemQuantities: { "currency-1": 42 },
    };
    const saveOptions = {
      baseState,
      fallbackEventUid,
      createClient: () => client as unknown as Client,
    };

    await upsertPostgresEventShopState(env, 7, canonicalEventUid, requestedPurchase, saveOptions);
    await upsertPostgresEventShopState(env, 7, canonicalEventUid, requestedCurrency, saveOptions);

    const document = getStoredPlannerDocument(client);
    expect(document.eventShops[canonicalEventUid]).toMatchObject({
      itemQuantities: { "daily-ticket": 3 },
      itemPurchaseDays: { "daily-ticket": 2 },
      existingPaymentItemQuantities: { "currency-1": 42 },
      minigamePlayCount: 3,
    });
    expect(document.eventShops[fallbackEventUid]).toEqual(baseState);
    expectNoLegacyShopStateStatements(client);
  });

  it("preserves different item quantity keys from stale submissions in the locked save path", async () => {
    const canonicalEventUid = "shop-content-1";
    const baseState: EventShopState = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { "item-a": 1, "item-b": 2 },
    };
    const client = createProjectionClient([
      { uid: "canonical-state", userId: 7, eventUid: canonicalEventUid, ...baseState },
    ]);
    const saveOptions = { baseState, createClient: () => client as unknown as Client };

    await upsertPostgresEventShopState(
      env,
      7,
      canonicalEventUid,
      { ...baseState, itemQuantities: { "item-a": 3, "item-b": 2 } },
      saveOptions,
    );
    await upsertPostgresEventShopState(
      env,
      7,
      canonicalEventUid,
      { ...baseState, itemQuantities: { "item-a": 1, "item-b": 4 } },
      saveOptions,
    );

    expect(getStoredPlannerDocument(client).eventShops[canonicalEventUid]?.itemQuantities).toEqual({
      "item-a": 3,
      "item-b": 4,
    });
    expectNoLegacyShopStateStatements(client);
  });

  it("lets the later stale submission win when both requests change the same field", async () => {
    const canonicalEventUid = "shop-content-1";
    const baseState: EventShopState = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { "daily-ticket": 1 },
    };
    const client = createProjectionClient([
      { uid: "canonical-state", userId: 7, eventUid: canonicalEventUid, ...baseState },
    ]);
    const saveOptions = { baseState, createClient: () => client as unknown as Client };

    await upsertPostgresEventShopState(
      env,
      7,
      canonicalEventUid,
      { ...baseState, itemQuantities: { "daily-ticket": 3 } },
      saveOptions,
    );
    await upsertPostgresEventShopState(
      env,
      7,
      canonicalEventUid,
      { ...baseState, itemQuantities: { "daily-ticket": 5 } },
      saveOptions,
    );

    expect(getStoredPlannerDocument(client).eventShops[canonicalEventUid]?.itemQuantities).toEqual({
      "daily-ticket": 5,
    });
    expectNoLegacyShopStateStatements(client);
  });

  it("keeps fallback-only purchase settings when patching owned quantities", async () => {
    const fallbackEventUid = "timeline-event-1";
    const canonicalEventUid = "shop-content-1";
    const fallbackState: EventShopState = {
      ...createDefaultEventShopState([], ["student-fallback"]),
      itemQuantities: { "daily-ticket": 60 },
      itemPurchaseDays: { "daily-ticket": 4 },
      enabledStages: { "stage-fallback": false },
      minigamePlayCount: 7,
      existingPaymentItemQuantities: { "currency-1": 10 },
    };
    const defaultState: EventShopState = {
      ...createDefaultEventShopState([], ["student-default"]),
      itemQuantities: {},
      itemPurchaseDays: {},
      enabledStages: {},
    };
    const client = createProjectionClient([
      { uid: "fallback-state", userId: 7, eventUid: fallbackEventUid, ...fallbackState },
    ]);

    await patchPostgresEventShopStateOwnedQuantities(env, 7, canonicalEventUid, { "currency-1": 42 }, defaultState, {
      fallbackEventUid,
      createClient: () => client as unknown as Client,
    });

    const document = getStoredPlannerDocument(client);
    expect(document.eventShops[canonicalEventUid]).toMatchObject({
      itemQuantities: { "daily-ticket": 60 },
      itemPurchaseDays: { "daily-ticket": 4 },
      selectedBonusStudentUids: ["student-fallback"],
      enabledStages: { "stage-fallback": false },
      minigamePlayCount: 7,
      existingPaymentItemQuantities: { "currency-1": 42 },
    });
    expect(document.eventShops[fallbackEventUid]).toEqual(fallbackState);
    expectNoLegacyShopStateStatements(client);
  });

  it("replaces the canonical plan as submitted without merging current or fallback fields", async () => {
    const fallbackEventUid = "timeline-event-1";
    const canonicalEventUid = "shop-content-1";
    const fallbackState: EventShopState = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { "daily-ticket": 60 },
    };
    const currentCanonical: EventShopState = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { "daily-ticket": 25 },
    };
    const submitted: EventShopState = {
      ...createDefaultEventShopState([], ["student-imported"]),
      itemQuantities: { "daily-ticket": 9 },
    };
    const client = createProjectionClient([
      { uid: "fallback-state", userId: 7, eventUid: fallbackEventUid, ...fallbackState },
      { uid: "canonical-state", userId: 7, eventUid: canonicalEventUid, ...currentCanonical },
    ]);

    await upsertPostgresEventShopState(env, 7, canonicalEventUid, submitted, {
      baseState: null,
      fallbackEventUid,
      replace: true,
      createClient: () => client as unknown as Client,
    });

    expect(getStoredPlannerDocument(client).eventShops[canonicalEventUid]).toEqual(submitted);
    expect(getStoredPlannerDocument(client).eventShops[fallbackEventUid]).toEqual(fallbackState);
    expectNoLegacyShopStateStatements(client);
  });

  it("writes the history snapshot and the planner state document inside one transaction", async () => {
    const { client, events, query } = createClient();
    const state: EventShopState = {
      ...createDefaultEventShopState([], ["student-1"]),
      itemQuantities: { "daily-ticket": 60 },
      itemPurchaseDays: { "daily-ticket": 1 },
      minigamePlayCount: 3,
    };

    await upsertPostgresEventShopState(env, 7, "event-1", state, { createClient: () => client });

    const lowered = events.map((event) => event.toLowerCase());
    expect(lowered).toContain("begin");
    expect(lowered).toContain("commit");

    const historyIndex = events.findIndex((event) => event.includes('insert into "event_shop_state_history"'));
    const documentIndex = events.findIndex((event) => event.includes('into "planner_states"'));
    const commitIndex = lowered.indexOf("commit");
    expect(events.some((event) => event.includes('"event_shop_states"'))).toBe(false);
    expect(historyIndex).toBeGreaterThanOrEqual(0);
    expect(documentIndex).toBeGreaterThan(historyIndex);
    expect(commitIndex).toBeGreaterThan(documentIndex);

    const historyValues = findStatementValues(query, "event_shop_state_history");
    expect(historyValues).toContain("autosave");
    const snapshot = historyValues
      .filter((value): value is string => typeof value === "string" && value.startsWith("{"))
      .map((value) => JSON.parse(value) as EventShopState)
      .find((parsed) => parsed.itemQuantities !== undefined);
    expect(snapshot).toEqual(state);
  });

  it("fails the whole save and rolls back when the history insert fails", async () => {
    const { client, events } = createClient({ failOn: "event_shop_state_history" });

    await expect(
      upsertPostgresEventShopState(env, 7, "event-1", createDefaultEventShopState([], []), {
        createClient: () => client,
      }),
    ).rejects.toThrow();

    expect(events.some((event) => event.includes('insert into "event_shop_state_history"'))).toBe(true);
    const lowered = events.map((event) => event.toLowerCase());
    expect(lowered).toContain("rollback");
    expect(lowered).not.toContain("commit");
  });
});
