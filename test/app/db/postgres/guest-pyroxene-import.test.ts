import { describe, expect, it, jest } from "@jest/globals";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import {
  decodePostgresPyroxeneReceiptItemKey,
  encodePostgresPyroxeneReceiptItemKey,
  type GuestPlannerImportPlan,
  hasPostgresGuestImportReceipt,
  markPostgresGuestImportReceipt,
  runPostgresGuestPlannerImport,
} from "~/db/postgres/guest-pyroxene-import";
import { getPlannerStateDocumentFromLegacyInDatabase } from "~/db/postgres/planner-states";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { projectPlannerStateDocument } from "~/domain/planner-state";
import { FakePostgresClient } from "../../../helpers/fake-postgres";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function emptyDocument() {
  return projectPlannerStateDocument({
    resources: [],
    timelineItems: [],
    plannerOptions: [],
    collectedSources: [],
    eventData: [],
    eventShops: [],
  });
}

function makePlan(document = emptyDocument()): GuestPlannerImportPlan {
  return {
    sources: [
      {
        sourceId: "current",
        datasetId: "dataset-1",
        document: {
          ...document,
          pyroxene: { ...document.pyroxene, collectedSourceKeys: ["source-1"] },
        },
        selection: {
          resources: false,
          options: false,
          recordUids: [],
          sourceKeys: ["source-1"],
          eventUids: [],
          eventShopUids: [],
        },
      },
    ],
    favorites: [],
  };
}

function fakeClient(initial: Record<string, unknown[]>, failPlannerStateWrite = false) {
  const client = new FakePostgresClient(initial as never);
  const originalQuery = client.query.bind(client);
  jest.spyOn(client, "query").mockImplementation(async (config, values) => {
    const text = typeof config === "string" ? config : config.text;
    if (failPlannerStateWrite && /(?:insert into|update) "planner_states"/.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    return originalQuery(config, values);
  });
  return client;
}

function tables(initialDocument = emptyDocument()) {
  return {
    pyroxene_owned_resources: [],
    pyroxene_collected_sources: [],
    pyroxene_timeline_items: [],
    pyroxene_planner_options: [],
    pyroxene_event_data: [],
    event_shop_states: [],
    event_shop_state_history: [],
    pyroxene_guest_import_items: [],
    planner_states: [{ id: 1, userId: 7, revision: 1, document: initialDocument }],
  };
}

describe("PostgreSQL guest import receipt keys", () => {
  it("round-trips UTF-8 keys and the frozen storage vectors", () => {
    for (const key of ["", "ascii", "한글", "😀", "a\u0000b"]) {
      expect(decodePostgresPyroxeneReceiptItemKey(encodePostgresPyroxeneReceiptItemKey(key))).toBe(key);
    }
    expect(encodePostgresPyroxeneReceiptItemKey("a\u0000b")).toBe("v1:YQBi");
    expect(() => decodePostgresPyroxeneReceiptItemKey("v2:YQBi")).toThrow(
      "Unsupported PostgreSQL receipt item key version",
    );
  });

  it("uses the encoded key for receipt reads and writes", async () => {
    const client = new FakePostgresClient({ pyroxene_guest_import_items: [] });
    const key = "content-1\u0000student-1";
    await expect(
      hasPostgresGuestImportReceipt(env, 7, "dataset-1", "favorite", key, {
        createClient: () => client as unknown as Client,
      }),
    ).resolves.toBe(false);
    await markPostgresGuestImportReceipt(env, 7, "dataset-1", "favorite", key, {
      createClient: () => client as unknown as Client,
    });
    expect(client.tables.pyroxene_guest_import_items?.[0]?.itemKey).toBe(encodePostgresPyroxeneReceiptItemKey(key));
  });
});

describe("PostgreSQL unified guest planner import", () => {
  it("imports selected Pyroxene and event shop data in one mirrored document update", async () => {
    const sourceDocument = projectPlannerStateDocument({
      resources: [],
      timelineItems: [
        {
          uid: "record-group::first",
          eventAt: new Date("2026-09-02T00:00:00.000Z"),
          source: "other",
          repeatType: null,
          repeatIntervalDays: null,
          repeatCount: null,
          autoRepurchase: false,
          description: "첫 기록",
          pyroxeneDelta: 30,
          oneTimeTicketDelta: 0,
          tenTimeTicketDelta: 0,
        },
        {
          uid: "record-group::second",
          eventAt: new Date("2026-09-02T00:00:00.000Z"),
          source: "other",
          repeatType: null,
          repeatIntervalDays: null,
          repeatCount: null,
          autoRepurchase: false,
          description: "둘째 기록",
          pyroxeneDelta: 40,
          oneTimeTicketDelta: 0,
          tenTimeTicketDelta: 0,
        },
      ],
      plannerOptions: [],
      collectedSources: [{ sourceKey: "source-1" }],
      eventData: [{ eventUid: "event-1", completed: false, expectedTrials: 200 }],
      eventShops: [],
    });
    sourceDocument.pyroxene.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 1,
      tenTimeTicket: 2,
    };
    sourceDocument.eventShops["shop-1"] = createDefaultEventShopState([], ["student-1"]);
    const plan = makePlan(sourceDocument);
    plan.sources[0].selection = {
      resources: true,
      options: false,
      recordUids: ["record-group"],
      sourceKeys: ["source-1"],
      eventUids: ["event-1"],
      eventShopUids: ["shop-1"],
    };
    const client = fakeClient(tables());

    const result = await runPostgresGuestPlannerImport(env, 7, plan, {
      createClient: () => client as unknown as Client,
    });

    expect(result.failed).toEqual([]);
    expect(result.verified.map(({ type, key }) => [type, key])).toEqual([
      ["resources", "current"],
      ["record", "record-group"],
      ["source", "source-1"],
      ["event", "event-1"],
      ["eventShop", "shop-1"],
    ]);
    expect(client.tables.event_shop_state_history).toHaveLength(1);
    expect(client.tables.pyroxene_guest_import_items).toHaveLength(5);
    const stateRow = client.tables.planner_states?.[0];
    expect(stateRow).toBeDefined();
    if (!stateRow) throw new Error("Expected a planner state after import");
    const storedDocument = typeof stateRow.document === "string" ? JSON.parse(stateRow.document) : stateRow.document;
    const projectedDocument = await getPlannerStateDocumentFromLegacyInDatabase(
      drizzle(client as unknown as Client),
      7,
    );
    expect(storedDocument).toEqual(projectedDocument);
    expect(projectedDocument.pyroxene.records.map(({ uid }) => uid)).toEqual([
      "guest-7-dataset-1-record-group::first",
      "guest-7-dataset-1-record-group::second",
    ]);
  });

  it("does not duplicate items covered by an existing receipt", async () => {
    const priorReceipt = {
      id: 1,
      userId: 7,
      datasetId: "dataset-1",
      itemType: "source",
      itemKey: encodePostgresPyroxeneReceiptItemKey("source-1"),
      importedAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const client = fakeClient({ ...tables(), pyroxene_guest_import_items: [priorReceipt] });

    const result = await runPostgresGuestPlannerImport(env, 7, makePlan(), {
      createClient: () => client as unknown as Client,
    });

    expect(result).toEqual({
      verified: [{ sourceId: "current", datasetId: "dataset-1", type: "source", key: "source-1" }],
      failed: [],
      revisionConflict: false,
    });
    expect(client.tables.pyroxene_collected_sources).toHaveLength(0);
    expect(client.tables.pyroxene_guest_import_items).toHaveLength(1);
  });

  it("rolls back all selected planner sections when the conditional document write conflicts", async () => {
    const source = makePlan();
    source.sources[0].selection = {
      resources: false,
      options: false,
      recordUids: [],
      sourceKeys: ["source-1"],
      eventUids: [],
      eventShopUids: [],
    };
    const client = fakeClient(tables(), true);

    const result = await runPostgresGuestPlannerImport(env, 7, source, {
      createClient: () => client as unknown as Client,
    });

    expect(result.revisionConflict).toBe(true);
    expect(result.verified).toEqual([]);
    expect(result.failed).toEqual([{ sourceId: "current", datasetId: "dataset-1", type: "source", key: "source-1" }]);
    expect(client.tables.pyroxene_collected_sources).toHaveLength(0);
    expect(client.tables.pyroxene_guest_import_items).toHaveLength(0);
  });
});
