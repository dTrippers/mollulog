import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  getPostgresEventShopStates,
  patchPostgresEventShopStateOwnedQuantities,
  upsertPostgresEventShopState,
} from "~/db/postgres/event-shop-state";
import { createDefaultEventShopState, type EventShopState } from "~/domain/event-shop-state";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function createClient(options: { failOn?: string } = {}) {
  const events: string[] = [];
  const query = jest.fn(async (config: { text: string; values?: unknown[] } | string, _values?: unknown[]) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (options.failOn && text.toLowerCase().includes(options.failOn.toLowerCase())) {
      throw new Error("query failed");
    }
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

describe("PostgreSQL event shop state", () => {
  it("loads a deduplicated batch of a user's canonical event shop states", async () => {
    const { client, query } = createClient();

    const states = await getPostgresEventShopStates(env, 7, ["shop-1", "shop-2", "shop-1"], {
      createClient: () => client,
    });

    expect(states).toEqual({});
    const calls = query.mock.calls.map(([config, parameters]) => {
      if (typeof config === "string") return { text: config, values: parameters };
      return { text: config.text, values: config.values ?? parameters };
    });
    const selection = calls.find(({ text }) => text.includes("select") && text.includes('from "event_shop_states"'));
    expect(selection?.text.toLowerCase()).toContain('"user_id" =');
    expect(selection?.text.toLowerCase()).toContain('"event_uid" in');
    expect(selection?.values).toEqual(expect.arrayContaining([7, "shop-1", "shop-2"]));
  });

  it("atomically merges owned currencies without replacing other shop settings", async () => {
    const { client, query } = createClient();
    const patch = { "currency-1": 0, "currency-2": 240 };

    await patchPostgresEventShopStateOwnedQuantities(
      env,
      7,
      "shop-1",
      patch,
      createDefaultEventShopState([], ["student-1"]),
      { createClient: () => client },
    );

    const calls = query.mock.calls.map(([config, parameters]) => {
      if (typeof config === "string") return { text: config, values: parameters };
      return { text: config.text, values: config.values ?? parameters };
    });
    const statement = calls.find(({ text }) => text.includes('insert into "event_shop_states"'));
    expect(statement).toBeDefined();
    const updateClause = statement?.text.toLowerCase().split("do update set")[1] ?? "";
    expect(updateClause).toContain('"existing_payment_item_quantities"');
    expect(updateClause).toContain(" || ");
    expect(updateClause).toContain('"updated_at"');
    expect(updateClause).not.toContain('"item_quantities" =');
    expect(updateClause).not.toContain('"enabled_stages" =');
    expect(statement?.values).toContain(JSON.stringify(patch));
  });

  it("writes the state upsert and the history snapshot inside one transaction", async () => {
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
