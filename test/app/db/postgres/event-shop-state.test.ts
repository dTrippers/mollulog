import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { upsertPostgresEventShopState } from "~/db/postgres/event-shop-state";
import type { EventShopState } from "~/models/event-shop-state";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function createState(overrides: Partial<EventShopState> = {}): EventShopState {
  return {
    itemQuantities: { "daily-ticket": 60 },
    itemPurchaseDays: { "daily-ticket": 1 },
    selectedBonusStudentUids: ["student-1"],
    bonusStudentSelectionMode: "shared",
    selectedBonusStudentUidsByItem: {},
    enabledStages: { "stage-1": true },
    includeRecruitedStudents: true,
    existingPaymentItemQuantities: {},
    includeFirstClear: false,
    extraStageRuns: {},
    minigameStartRound: 1,
    minigamePlayCount: 0,
    minigamePaymentQuantityMode: "expected",
    overriddenRequiredQuantities: {},
    ...overrides,
  };
}

function createClient(options: { failOn?: string } = {}) {
  const events: string[] = [];
  const query = jest.fn(async (config: { text: string } | string, _values?: unknown[]) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (options.failOn && text.toLowerCase().includes(options.failOn.toLowerCase())) {
      throw new Error("query failed");
    }
    return { rows: [], rowCount: 0 };
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

describe("PostgreSQL event shop state repository", () => {
  it("writes the state upsert and the history snapshot inside one transaction", async () => {
    const { client, events, query } = createClient();
    const state = createState({ minigamePlayCount: 3 });

    await upsertPostgresEventShopState(env, 7, "event-1", state, { createClient: () => client });

    const lowered = events.map((event) => event.toLowerCase());
    expect(lowered).toContain("begin");
    expect(lowered).toContain("commit");

    const upsertIndex = events.findIndex((event) => event.includes('insert into "event_shop_states"'));
    const historyIndex = events.findIndex((event) => event.includes('insert into "event_shop_state_history"'));
    const commitIndex = lowered.indexOf("commit");
    expect(upsertIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeGreaterThan(upsertIndex);
    expect(commitIndex).toBeGreaterThan(historyIndex);

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
      upsertPostgresEventShopState(env, 7, "event-1", createState(), { createClient: () => client }),
    ).rejects.toThrow();

    expect(events.some((event) => event.includes('insert into "event_shop_state_history"'))).toBe(true);
    const lowered = events.map((event) => event.toLowerCase());
    expect(lowered).toContain("rollback");
    expect(lowered).not.toContain("commit");
  });
});
