import { describe, expect, it, jest } from "@jest/globals";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import {
  backfillPlannerStatesInDatabase,
  checkPlannerStateParityInDatabase,
  getPlannerStateDocumentFromLegacyInDatabase,
} from "~/db/postgres/planner-states";
import {
  createPostgresAttendance,
  createPostgresBuyPyroxene,
  createPostgresOtherPyroxeneGain,
  createPostgresPyroxeneApPackage,
  createPostgresPyroxeneMonthlyPackage,
  createPostgresPyroxeneOwnedResource,
  deletePostgresCollectedSource,
  deletePostgresPyroxeneEventData,
  deletePostgresPyroxeneOwnedResourceByUid,
  deletePostgresPyroxeneTimelineItem,
  ensurePostgresCollectedSource,
  updatePostgresPyroxeneOneOffTimelineItem,
  upsertPostgresCollectedSource,
  upsertPostgresCollectedSources,
  upsertPostgresPyroxeneEventData,
  upsertPostgresPyroxenePlannerOptions,
} from "~/db/postgres/pyroxene-planner";
import { projectPlannerStateDocument } from "~/domain/planner-state";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { FakePostgresClient } from "../../../helpers/fake-postgres";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;
const date = new Date("2026-08-01T00:00:00.000Z");
const isoDate = "2026-08-05T00:00:00.000Z";

function legacyTables() {
  return {
    pyroxene_owned_resources: [
      { id: 1, uid: "owned-1", userId: 7, inputAt: date, pyroxene: 1200, oneTimeTicket: 3, tenTimeTicket: 4 },
    ],
    pyroxene_collected_sources: [],
    pyroxene_timeline_items: [],
    pyroxene_planner_options: [{ id: 1, userId: 7, options: JSON.stringify(defaultPyroxenePlannerOptions) }],
    pyroxene_event_data: [],
    event_shop_states: [],
  };
}

function emptyPlannerStateDocument() {
  return projectPlannerStateDocument({
    resources: [],
    timelineItems: [],
    plannerOptions: [],
    collectedSources: [],
    eventData: [],
    eventShops: [],
  });
}

describe("PostgreSQL planner state dual writes", () => {
  it("projects legacy tables and stores their state in the same transaction as a pyroxene mutation", async () => {
    const client = new FakePostgresClient(legacyTables());

    await upsertPostgresCollectedSource(env, 7, "source-1", { createClient: () => client as unknown as Client });

    const documentRow = client.tables.planner_states?.[0];
    expect(documentRow).toBeDefined();
    expect(documentRow?.revision).toBe(1);
    const document =
      typeof documentRow?.document === "string" ? JSON.parse(documentRow.document) : documentRow?.document;
    expect(document.pyroxene.resources).toEqual({
      inputAt: "2026-08-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 3,
      tenTimeTicket: 4,
    });
    expect(document.pyroxene.collectedSourceKeys).toEqual(["source-1"]);
    expect(client.statements.map((statement) => statement.toLowerCase())).toEqual(
      expect.arrayContaining(["begin", "commit"]),
    );
  });

  it("locks each user before the legacy mutation with a user-specific advisory label", async () => {
    for (const userId of [7, 8]) {
      const client = new FakePostgresClient(legacyTables());

      await upsertPostgresCollectedSource(env, userId, `source-${userId}`, {
        createClient: () => client as unknown as Client,
      });

      const statements = client.statements.map((statement) => statement.toLowerCase());
      const lockIndex = statements.findIndex((statement) => statement.includes("pg_advisory_xact_lock"));
      const legacyMutationIndex = statements.findIndex((statement) =>
        statement.startsWith('insert into "pyroxene_collected_sources"'),
      );

      expect(statements[0]).toBe("begin");
      expect(lockIndex).toBe(1);
      expect(legacyMutationIndex).toBeGreaterThan(lockIndex);
      expect(client.parameters[lockIndex]).toEqual([`mollulog:planner-state:user:${userId}`]);
    }
  });

  it("fails projection on invalid stored options instead of returning a default document", async () => {
    const client = new FakePostgresClient({
      ...legacyTables(),
      pyroxene_planner_options: [{ id: 1, userId: 7, options: "not-json" }],
    });
    const db = drizzle(client as unknown as Client);

    await expect(getPlannerStateDocumentFromLegacyInDatabase(db, 7)).rejects.toThrow(
      "pyroxene_planner_options.options",
    );
  });

  it("rolls back a legacy write when the projection query fails", async () => {
    const client = new FakePostgresClient(legacyTables());
    const originalQuery = client.query.bind(client);
    jest.spyOn(client, "query").mockImplementation(async (config, positionalValues) => {
      const text = typeof config === "string" ? config : config.text;
      if (text.includes('from "pyroxene_planner_options"')) throw new Error("projection query failed");
      return originalQuery(config, positionalValues);
    });

    await expect(
      upsertPostgresCollectedSource(env, 7, "source-2", { createClient: () => client as unknown as Client }),
    ).rejects.toThrow();

    const statements = client.statements.map((statement) => statement.toLowerCase());
    expect(statements).toContain("begin");
    expect(statements).toContain("rollback");
    expect(statements).not.toContain("commit");
  });

  it("supports a dry-run backfill, an idempotent rerun, and zero-difference parity", async () => {
    const client = new FakePostgresClient(legacyTables());
    const db = drizzle(client as unknown as Client);

    const preview = await backfillPlannerStatesInDatabase(db, { dryRun: true });
    expect(preview).toMatchObject({ sourceUserCount: 1, inserted: 0, alreadyPresent: 0, wouldInsert: 1 });
    expect(client.tables.planner_states ?? []).toHaveLength(0);

    const firstRun = await backfillPlannerStatesInDatabase(db);
    expect(firstRun).toMatchObject({ sourceUserCount: 1, inserted: 1, alreadyPresent: 0, wouldInsert: 0 });
    const savedDocument = client.tables.planner_states?.[0]?.document;

    const secondRun = await backfillPlannerStatesInDatabase(db);
    expect(secondRun).toMatchObject({ sourceUserCount: 1, inserted: 0, alreadyPresent: 1, wouldInsert: 0 });
    expect(client.tables.planner_states).toHaveLength(1);
    expect(client.tables.planner_states?.[0]?.document).toEqual(savedDocument);

    const parity = await checkPlannerStateParityInDatabase(db);
    expect(parity.sourceUserCounts.resources).toBe(1);
    expect(parity.documentCount).toBe(1);
    expect(parity.mismatches).toEqual([]);
    expect(parity.conversionFailures).toEqual([]);
  });

  it("accepts an orphan planner document that matches the empty legacy projection", async () => {
    const client = new FakePostgresClient({
      planner_states: [{ id: 1, userId: 42, revision: 1, document: emptyPlannerStateDocument() }],
    });

    const parity = await checkPlannerStateParityInDatabase(drizzle(client as unknown as Client));

    expect(parity.documentCount).toBe(1);
    expect(parity.mismatches).toEqual([]);
    expect(parity.conversionFailures).toEqual([]);
  });

  it("reports an orphan planner document only when it differs from the empty legacy projection", async () => {
    const emptyDocument = emptyPlannerStateDocument();
    const client = new FakePostgresClient({
      planner_states: [
        {
          id: 1,
          userId: 42,
          revision: 1,
          document: {
            ...emptyDocument,
            pyroxene: { ...emptyDocument.pyroxene, collectedSourceKeys: ["stale-source"] },
          },
        },
      ],
    });

    const parity = await checkPlannerStateParityInDatabase(drizzle(client as unknown as Client));

    expect(parity.mismatches).toEqual([
      { userId: 42, reasons: ["document_without_source_rows", "pyroxene.collectedSourceKeys"] },
    ]);
    expect(parity.conversionFailures).toEqual([]);
  });

  it("keeps every pyroxene write operation equal to its legacy-table projection", async () => {
    const mutations: Array<[string, (client: FakePostgresClient) => Promise<unknown>]> = [
      [
        "owned resource create",
        (client) =>
          createPostgresPyroxeneOwnedResource(
            env,
            7,
            { pyroxene: 900, oneTimeTicket: 2, tenTimeTicket: 1 },
            { uid: "owned-new", inputAt: isoDate, createClient: () => client as unknown as Client },
          ),
      ],
      [
        "owned resource delete",
        (client) =>
          deletePostgresPyroxeneOwnedResourceByUid(env, 7, "owned-1", {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "collected source upsert",
        (client) =>
          upsertPostgresCollectedSource(env, 7, "source-one", { createClient: () => client as unknown as Client }),
      ],
      [
        "collected source ensure",
        (client) =>
          ensurePostgresCollectedSource(env, 7, "source-one", { createClient: () => client as unknown as Client }),
      ],
      [
        "collected sources bulk upsert",
        (client) =>
          upsertPostgresCollectedSources(env, 7, ["source-one", "source-two"], {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "collected source delete",
        (client) =>
          deletePostgresCollectedSource(env, 7, "source-one", { createClient: () => client as unknown as Client }),
      ],
      [
        "buy record create",
        (client) =>
          createPostgresBuyPyroxene(env, 7, isoDate, 120, {
            uid: "buy-new",
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "timeline record delete",
        (client) =>
          deletePostgresPyroxeneTimelineItem(env, 7, "record-1", { createClient: () => client as unknown as Client }),
      ],
      [
        "one-off record update",
        (client) =>
          updatePostgresPyroxeneOneOffTimelineItem(
            env,
            7,
            "record-1",
            {
              source: "other",
              date: isoDate,
              description: "Updated",
              pyroxeneDelta: 10,
              oneTimeTicketDelta: 1,
              tenTimeTicketDelta: 0,
            },
            { createClient: () => client as unknown as Client },
          ),
      ],
      [
        "monthly package create",
        (client) =>
          createPostgresPyroxeneMonthlyPackage(env, 7, isoDate, "half", false, "monthly-new", {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "AP package create",
        (client) =>
          createPostgresPyroxeneApPackage(env, 7, isoDate, false, "ap-new", {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "attendance record replace",
        (client) =>
          createPostgresAttendance(env, 7, isoDate, "attendance-new", {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "other record create",
        (client) =>
          createPostgresOtherPyroxeneGain(env, 7, isoDate, 20, 1, 0, "Other", "other-new", {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "planner options upsert",
        (client) =>
          upsertPostgresPyroxenePlannerOptions(env, 7, defaultPyroxenePlannerOptions, {
            createClient: () => client as unknown as Client,
          }),
      ],
      [
        "event data upsert",
        (client) =>
          upsertPostgresPyroxeneEventData(
            env,
            7,
            "event-1",
            { completed: true, expectedTrials: 10 },
            { createClient: () => client as unknown as Client },
          ),
      ],
      [
        "event data delete",
        (client) =>
          deletePostgresPyroxeneEventData(env, 7, "event-1", { createClient: () => client as unknown as Client }),
      ],
    ];

    for (const [name, mutate] of mutations) {
      const client = new FakePostgresClient({
        ...legacyTables(),
        pyroxene_collected_sources: [
          {
            id: 1,
            uid: "source-existing",
            userId: 7,
            sourceKey: "source-existing",
            collectedAt: date,
            createdAt: date,
          },
        ],
        pyroxene_timeline_items: [
          {
            id: 1,
            uid: "record-1",
            userId: 7,
            eventAt: date,
            source: "other",
            repeatType: null,
            repeatIntervalDays: null,
            repeatCount: null,
            autoRepurchase: false,
            description: "Existing",
            pyroxeneDelta: 4,
            oneTimeTicketDelta: 0,
            tenTimeTicketDelta: 0,
          },
        ],
        pyroxene_event_data: [
          {
            id: 1,
            uid: "event-data-1",
            userId: 7,
            eventUid: "event-1",
            completed: false,
            expectedTrials: 3,
            createdAt: date,
            updatedAt: date,
          },
        ],
      });
      await mutate(client);

      const storedRow = client.tables.planner_states?.[0];
      expect(storedRow).toBeDefined();
      const storedDocument =
        typeof storedRow?.document === "string" ? JSON.parse(storedRow.document) : storedRow?.document;
      const projected = await getPlannerStateDocumentFromLegacyInDatabase(drizzle(client as unknown as Client), 7);
      expect(storedDocument).toEqual(projected);
      expect(client.statements.map((statement) => statement.toLowerCase())).toEqual(
        expect.arrayContaining(["begin", "commit"]),
      );
      if (!storedRow) throw new Error(`No planner state written for ${name}`);
    }
  });
});
