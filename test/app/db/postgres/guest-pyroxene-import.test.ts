import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import {
  decodePostgresPyroxeneReceiptItemKey,
  encodePostgresPyroxeneReceiptItemKey,
  type GuestPyroxeneImportPlan,
  hasPostgresGuestImportReceipt,
  markPostgresGuestImportReceipt,
  runPostgresGuestPyroxeneImport,
} from "~/db/postgres/guest-pyroxene-import";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function plan(events: string[]): GuestPyroxeneImportPlan {
  return {
    resources: { pyroxene: 1200, oneTimeTicket: 3, tenTimeTicket: 4 },
    records: [],
    sourceKeys: ["source-1"],
    eventTrials: [{ eventUid: "event-1", expectedTrials: 200 }],
    favorites: [
      {
        itemKey: "content-1\u0000student-1",
        run: async () => {
          events.push("favorite");
        },
      },
    ],
  };
}

function createClient(options: { failBulk?: boolean; existingReceipt?: boolean } = {}) {
  const events: string[] = [];
  const query = jest.fn(async (config: { text: string } | string, _values?: unknown[]) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (options.existingReceipt && text.includes('from "pyroxene_guest_import_items"')) {
      return {
        rows: [["favorite", encodePostgresPyroxeneReceiptItemKey("content-1\u0000student-1")]],
        rowCount: 1,
      };
    }
    if (options.failBulk && text.includes('insert into "pyroxene_guest_import_items"')) {
      throw new Error("receipt insert failed");
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

describe("PostgreSQL receipt item-key mapping", () => {
  it("round-trips raw keys across UTF-8 and delimiter-like values", () => {
    const rawKeys = [
      "",
      "ascii-key",
      "현",
      "😀",
      "a\u0000b",
      "\u0000left\u0000right\u0000",
      "back\\slash:colon/slash",
      "v1:YQBi",
      "𐀀 4-byte code point",
    ];

    for (const rawKey of rawKeys) {
      expect(decodePostgresPyroxeneReceiptItemKey(encodePostgresPyroxeneReceiptItemKey(rawKey))).toBe(rawKey);
    }
  });

  it("keeps the versioned storage vectors frozen", () => {
    expect(encodePostgresPyroxeneReceiptItemKey("")).toBe("v1:");
    expect(encodePostgresPyroxeneReceiptItemKey("a\u0000b")).toBe("v1:YQBi");
    expect(encodePostgresPyroxeneReceiptItemKey("현\u0000A")).toBe("v1:7ZiEAEE");
  });

  it("rejects missing, unknown, and malformed storage formats", () => {
    expect(() => decodePostgresPyroxeneReceiptItemKey("v2:YQBi")).toThrow(
      "Unsupported PostgreSQL receipt item key version",
    );
    expect(() => decodePostgresPyroxeneReceiptItemKey("no-prefix")).toThrow(
      "Unsupported PostgreSQL receipt item key version",
    );
    expect(() => decodePostgresPyroxeneReceiptItemKey("v1:invalid$")).toThrow("Invalid v1 PostgreSQL receipt item key");
  });
});

describe("PostgreSQL guest Pyroxene import", () => {
  it("encodes NUL-bearing keys for direct receipt lookup and mark", async () => {
    const { client, query } = createClient();
    const rawKey = "content-1\u0000student-1";
    const encodedKey = encodePostgresPyroxeneReceiptItemKey(rawKey);

    await expect(
      hasPostgresGuestImportReceipt(env, 7, "dataset-1", "favorite", rawKey, { createClient: () => client }),
    ).resolves.toBe(false);
    await markPostgresGuestImportReceipt(env, 7, "dataset-1", "favorite", rawKey, {
      createClient: () => client,
    });

    const values = query.mock.calls.map(([, callValues]) => callValues as unknown[]);
    expect(values).toEqual(expect.arrayContaining([expect.arrayContaining([encodedKey])]));
    expect(values.flat()).not.toContain(rawKey);
  });

  it("holds one client from the receipt read through Pyroxene writes and one bulk receipt insert", async () => {
    const { client, events, query } = createClient();
    const importPlan = plan(events);
    const result = await runPostgresGuestPyroxeneImport(env, 7, "dataset-1", importPlan, {
      createClient: () => client,
    });

    const receiptReads = query.mock.calls.filter(([config]) => {
      const text = typeof config === "string" ? config : config.text;
      return text.includes('from "pyroxene_guest_import_items"');
    });
    const receiptWrites = query.mock.calls.filter(([config]) => {
      const text = typeof config === "string" ? config : config.text;
      return text.includes('insert into "pyroxene_guest_import_items"');
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(receiptReads).toHaveLength(1);
    expect(receiptWrites).toHaveLength(1);
    expect(result.failed).toEqual([]);
    expect(result.verified).toEqual([
      { type: "resources", key: "current" },
      { type: "source", key: "source-1" },
      { type: "event", key: "event-1" },
      { type: "favorite", key: "content-1\u0000student-1" },
    ]);
    const receiptWrite = query.mock.calls.find(([config]) => {
      const text = typeof config === "string" ? config : config.text;
      return text.includes('insert into "pyroxene_guest_import_items"');
    });
    expect(receiptWrite?.[1]).toEqual(
      expect.arrayContaining([encodePostgresPyroxeneReceiptItemKey("content-1\u0000student-1")]),
    );
    expect(receiptWrite?.[1]).not.toContain("content-1\u0000student-1");
    expect(events.indexOf("favorite")).toBeLessThan(
      events.findIndex((event) => event.includes('insert into "pyroxene_guest_import_items"')),
    );
  });

  it("does not verify newly operated items when the bulk receipt insert fails", async () => {
    const { client, events } = createClient({ failBulk: true });
    const result = await runPostgresGuestPyroxeneImport(env, 7, "dataset-1", plan(events), {
      createClient: () => client,
    });

    expect(result.verified).toEqual([]);
    expect(result.failed).toEqual([
      { type: "resources", key: "current" },
      { type: "source", key: "source-1" },
      { type: "event", key: "event-1" },
      { type: "favorite", key: "content-1\u0000student-1" },
    ]);
    expect(events).toContain("favorite");
  });

  it("verifies an existing receipt without repeating its external favorite write", async () => {
    const { client, events } = createClient({ existingReceipt: true });
    const importPlan = plan(events);
    const result = await runPostgresGuestPyroxeneImport(env, 7, "dataset-1", importPlan, {
      createClient: () => client,
    });

    expect(result.verified).toEqual([
      { type: "favorite", key: "content-1\u0000student-1" },
      { type: "resources", key: "current" },
      { type: "source", key: "source-1" },
      { type: "event", key: "event-1" },
    ]);
    expect(events).not.toContain("favorite");
  });
});
