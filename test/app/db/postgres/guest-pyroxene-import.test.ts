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
          ap: false,
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
  it("imports the selected AP document section and records its retry receipt without a legacy AP mirror", async () => {
    const sourceDocument = emptyDocument();
    sourceDocument.ap = {
      accountLevel: 85,
      cafeRank: 8,
      comfort: 4_500,
      eventPlans: { "event-1": { accessAt: "2026-09-30T03:00:00.000Z" } },
    };
    const plan = makePlan(sourceDocument);
    plan.sources[0].selection = {
      resources: false,
      options: false,
      recordUids: [],
      sourceKeys: [],
      eventUids: [],
      eventShopUids: [],
      ap: true,
    };
    const client = fakeClient(tables());

    const result = await runPostgresGuestPlannerImport(env, 7, plan, {
      createClient: () => client as unknown as Client,
    });

    expect(result.failed).toEqual([]);
    expect(result.verified).toEqual([{ sourceId: "current", datasetId: "dataset-1", type: "ap", key: "current" }]);
    const receipt = client.tables.pyroxene_guest_import_items?.[0];
    expect(receipt).toMatchObject({ itemType: "ap", itemKey: encodePostgresPyroxeneReceiptItemKey("current") });
    const storedRow = client.tables.planner_states?.[0];
    if (!storedRow) throw new Error("Expected an AP planner document after import");
    const storedDocument = typeof storedRow.document === "string" ? JSON.parse(storedRow.document) : storedRow.document;
    expect(storedDocument.ap).toEqual(sourceDocument.ap);
    expect((await getPlannerStateDocumentFromLegacyInDatabase(drizzle(client as unknown as Client), 7)).ap).toBeNull();
  });

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
      ap: false,
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

  it("keeps receipts as history but still applies an explicitly selected set-union item", async () => {
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
    expect(client.tables.pyroxene_collected_sources).toHaveLength(1);
    expect(client.tables.pyroxene_guest_import_items).toHaveLength(1);
  });

  it("re-applies overwrite-type shop values on every explicit selection and is idempotent for equal values", async () => {
    const client = fakeClient(tables());
    const importQuantity = async (quantity: number) => {
      const document = emptyDocument();
      document.eventShops["shop-1"] = {
        ...createDefaultEventShopState([], []),
        itemQuantities: { "daily-ticket": quantity },
      };
      const plan = makePlan(document);
      plan.sources[0].selection = {
        resources: false,
        options: false,
        recordUids: [],
        sourceKeys: [],
        eventUids: [],
        eventShopUids: ["shop-1"],
        ap: false,
      };
      return runPostgresGuestPlannerImport(env, 7, plan, {
        createClient: () => client as unknown as Client,
      });
    };

    await importQuantity(1);
    await importQuantity(9);
    await importQuantity(1);
    await importQuantity(1);

    expect(JSON.parse(String(client.tables.event_shop_states?.[0]?.itemQuantities))).toEqual({ "daily-ticket": 1 });
    expect(JSON.parse(String(client.tables.planner_states?.[0]?.document))).toMatchObject({
      eventShops: { "shop-1": { itemQuantities: { "daily-ticket": 1 } } },
    });
    expect(client.tables.event_shop_state_history).toHaveLength(3);
    expect(client.tables.pyroxene_guest_import_items).toHaveLength(1);
  });

  it("applies guest shop state after an account edit even when its historical receipt exists", async () => {
    const accountState = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { "daily-ticket": 9 },
    };
    const document = emptyDocument();
    document.eventShops["shop-1"] = accountState;
    const priorReceipt = {
      id: 1,
      userId: 7,
      datasetId: "dataset-1",
      itemType: "eventShop",
      itemKey: encodePostgresPyroxeneReceiptItemKey("shop-1"),
      importedAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const client = fakeClient({
      ...tables(document),
      event_shop_states: [{ uid: "shop-row", userId: 7, eventUid: "shop-1", ...accountState }],
      pyroxene_guest_import_items: [priorReceipt],
    });
    const guestDocument = emptyDocument();
    guestDocument.eventShops["shop-1"] = {
      ...createDefaultEventShopState([], []),
      itemQuantities: { "daily-ticket": 1 },
    };
    const plan = makePlan(guestDocument);
    plan.sources[0].selection = {
      resources: false,
      options: false,
      recordUids: [],
      sourceKeys: [],
      eventUids: [],
      eventShopUids: ["shop-1"],
      ap: false,
    };

    const result = await runPostgresGuestPlannerImport(env, 7, plan, {
      createClient: () => client as unknown as Client,
    });

    expect(result.failed).toEqual([]);
    expect(JSON.parse(String(client.tables.event_shop_states?.[0]?.itemQuantities))).toEqual({ "daily-ticket": 1 });
    expect(JSON.parse(String(client.tables.planner_states?.[0]?.document))).toMatchObject({
      eventShops: { "shop-1": { itemQuantities: { "daily-ticket": 1 } } },
    });
  });

  it("updates one deterministic timeline plan in place when its guest value changes", async () => {
    const client = fakeClient(tables());
    const makeRecordPlan = (pyroxeneDelta: number): GuestPlannerImportPlan => {
      const document = projectPlannerStateDocument({
        resources: [],
        timelineItems: [
          {
            uid: "record-group",
            eventAt: new Date("2026-09-02T00:00:00.000Z"),
            source: "other",
            repeatType: null,
            repeatIntervalDays: null,
            repeatCount: null,
            autoRepurchase: false,
            description: "보상",
            pyroxeneDelta,
            oneTimeTicketDelta: 0,
            tenTimeTicketDelta: 0,
          },
        ],
        plannerOptions: [],
        collectedSources: [],
        eventData: [],
        eventShops: [],
      });
      const plan = makePlan(document);
      plan.sources[0].selection = {
        resources: false,
        options: false,
        recordUids: ["record-group"],
        sourceKeys: [],
        eventUids: [],
        eventShopUids: [],
        ap: false,
      };
      return plan;
    };

    await runPostgresGuestPlannerImport(env, 7, makeRecordPlan(30), {
      createClient: () => client as unknown as Client,
    });
    await runPostgresGuestPlannerImport(env, 7, makeRecordPlan(30), {
      createClient: () => client as unknown as Client,
    });
    await runPostgresGuestPlannerImport(env, 7, makeRecordPlan(90), {
      createClient: () => client as unknown as Client,
    });

    const stateRow = client.tables.planner_states?.[0];
    if (!stateRow) throw new Error("Expected a planner state after record re-import");
    const storedDocument = typeof stateRow.document === "string" ? JSON.parse(stateRow.document) : stateRow.document;
    const projectedDocument = await getPlannerStateDocumentFromLegacyInDatabase(
      drizzle(client as unknown as Client),
      7,
    );
    expect(client.tables.pyroxene_timeline_items).toHaveLength(1);
    expect(client.tables.pyroxene_timeline_items?.[0]?.pyroxeneDelta).toBe(90);
    expect(storedDocument.pyroxene.records).toHaveLength(1);
    expect(storedDocument.pyroxene.records[0].pyroxeneDelta).toBe(90);
    expect(storedDocument).toEqual(projectedDocument);
    expect(client.tables.pyroxene_guest_import_items).toHaveLength(1);
  });

  it("uses the guest timestamp when newer and import time when the selected resources are older", async () => {
    const accountResource = {
      inputAt: "2026-09-28T00:00:00.000Z",
      pyroxene: 100,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    const accountDocument = emptyDocument();
    accountDocument.pyroxene.resources = accountResource;
    const resourceRow = { id: 1, uid: "account-resource", userId: 7, ...accountResource };
    const makeResourcePlan = (resources: {
      inputAt: string;
      pyroxene: number;
      oneTimeTicket: number;
      tenTimeTicket: number;
    }) => {
      const document = emptyDocument();
      document.pyroxene.resources = resources;
      const plan = makePlan(document);
      plan.sources[0].selection = {
        resources: true,
        options: false,
        recordUids: [],
        sourceKeys: [],
        eventUids: [],
        eventShopUids: [],
        ap: false,
      };
      return plan;
    };
    const run = async (resources: {
      inputAt: string;
      pyroxene: number;
      oneTimeTicket: number;
      tenTimeTicket: number;
    }) => {
      const client = fakeClient({ ...tables(accountDocument), pyroxene_owned_resources: [resourceRow] });
      await runPostgresGuestPlannerImport(env, 7, makeResourcePlan(resources), {
        createClient: () => client as unknown as Client,
      });
      const stateRow = client.tables.planner_states?.[0];
      if (!stateRow) throw new Error("Expected a planner state after resource import");
      const storedDocument = typeof stateRow.document === "string" ? JSON.parse(stateRow.document) : stateRow.document;
      const projectedDocument = await getPlannerStateDocumentFromLegacyInDatabase(
        drizzle(client as unknown as Client),
        7,
      );
      expect(storedDocument).toEqual(projectedDocument);
      return { client, storedDocument };
    };

    const older = await run({ ...accountResource, inputAt: "2026-09-27T00:00:00.000Z", pyroxene: 2400 });
    expect(older.client.tables.pyroxene_owned_resources).toHaveLength(2);
    expect(older.storedDocument.pyroxene.resources).toMatchObject({ pyroxene: 2400 });
    expect(Date.parse(older.storedDocument.pyroxene.resources.inputAt)).toBeGreaterThan(
      Date.parse(accountResource.inputAt),
    );

    const newer = await run({ ...accountResource, inputAt: "2026-09-29T00:00:00.000Z", pyroxene: 2400 });
    expect(newer.client.tables.pyroxene_owned_resources).toHaveLength(2);
    expect(newer.storedDocument.pyroxene.resources).toEqual({
      inputAt: "2026-09-29T00:00:00.000Z",
      pyroxene: 2400,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    });

    const sameAmounts = await run({ ...accountResource, inputAt: "2026-09-27T00:00:00.000Z" });
    expect(sameAmounts.client.tables.pyroxene_owned_resources).toHaveLength(1);
    expect(sameAmounts.storedDocument.pyroxene.resources).toEqual(accountResource);
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
      ap: false,
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
