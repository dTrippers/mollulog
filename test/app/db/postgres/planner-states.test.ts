import { describe, expect, it, jest } from "@jest/globals";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import { PlannerStateRevisionConflictError, updatePlannerStateDocumentInDatabase } from "~/db/postgres/planner-states";
import {
  createPostgresAttendance,
  createPostgresBuyPyroxene,
  createPostgresOtherPyroxeneGain,
  createPostgresPyroxeneApPackage,
  createPostgresPyroxeneMonthlyPackage,
  createPostgresPyroxeneOwnedResource,
  deletePostgresCollectedSource,
  deletePostgresPyroxeneEventData,
  deletePostgresPyroxeneTimelineItem,
  ensurePostgresCollectedSource,
  updatePostgresPyroxeneOneOffTimelineItem,
  upsertPostgresCollectedSource,
  upsertPostgresCollectedSources,
  upsertPostgresPyroxeneEventData,
  upsertPostgresPyroxenePlannerOptions,
} from "~/db/postgres/pyroxene-planner";
import type { PlannerStateDocumentV1, PlannerStateTimelineRecord } from "~/domain/planner-state";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { FakePostgresClient } from "../../../helpers/fake-postgres";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;
const isoDate = "2026-08-05T00:00:00.000Z";
// Timeline dates normalize to 04:00 KST of the given KST day.
const normalizedIsoDate = "2026-08-04T19:00:00.000Z";

function record(overrides: Partial<PlannerStateTimelineRecord> & { uid: string }): PlannerStateTimelineRecord {
  return {
    eventAt: "2026-07-31T19:00:00.000Z",
    source: "other",
    repeatType: "fixed_days",
    repeatIntervalDays: null,
    repeatCount: null,
    autoRepurchase: false,
    description: overrides.uid,
    pyroxeneDelta: 4,
    oneTimeTicketDelta: 0,
    tenTimeTicketDelta: 0,
    ...overrides,
  };
}

function baseDocument(): PlannerStateDocumentV1 {
  return {
    schemaVersion: 1,
    pyroxene: {
      resources: { inputAt: "2026-08-01T00:00:00.000Z", pyroxene: 1200, oneTimeTicket: 3, tenTimeTicket: 4 },
      records: [record({ uid: "record-1", description: "Existing" })],
      options: defaultPyroxenePlannerOptions,
      collectedSourceKeys: ["source-existing"],
      eventData: { "event-1": { completed: false, expectedTrials: 3 } },
    },
    eventShops: {},
    ap: null,
  };
}

function clientWithDocument(document: PlannerStateDocumentV1 = baseDocument(), revision = 1) {
  return new FakePostgresClient({ planner_states: [{ id: 1, userId: 7, revision, document }] });
}

function storedDocument(client: FakePostgresClient): PlannerStateDocumentV1 {
  const value = client.tables.planner_states?.[0]?.document;
  if (value === undefined) throw new Error("Expected a stored planner state");
  return (typeof value === "string" ? JSON.parse(value) : value) as PlannerStateDocumentV1;
}

function touchedTables(client: FakePostgresClient): string[] {
  return [
    ...new Set(
      client.statements.flatMap((statement) => [
        ...statement.matchAll(/\b(?:from|into|update|delete\s+from)\s+"([^"]+)"/gi),
      ]),
    ),
  ].map((match) => match[1]);
}

describe("PostgreSQL planner state writes", () => {
  it("stores a pyroxene mutation in the planner state document within one transaction", async () => {
    const client = clientWithDocument();

    await upsertPostgresCollectedSource(env, 7, "source-1", { createClient: () => client as unknown as Client });

    expect(client.tables.planner_states?.[0]?.revision).toBe(2);
    expect(storedDocument(client).pyroxene.collectedSourceKeys).toEqual(["source-1", "source-existing"]);
    expect(client.statements.map((statement) => statement.toLowerCase())).toEqual(
      expect.arrayContaining(["begin", "commit"]),
    );
    expect(new Set(touchedTables(client))).toEqual(new Set(["planner_states"]));
  });

  it("locks each user with a user-specific advisory label before reading the document", async () => {
    for (const userId of [7, 8]) {
      const client = clientWithDocument();

      await upsertPostgresCollectedSource(env, userId, `source-${userId}`, {
        createClient: () => client as unknown as Client,
      });

      const statements = client.statements.map((statement) => statement.toLowerCase());
      const lockIndex = statements.findIndex((statement) => statement.includes("pg_advisory_xact_lock"));
      const readIndex = statements.findIndex((statement) => statement.includes('from "planner_states"'));

      expect(statements[0]).toBe("begin");
      expect(lockIndex).toBe(1);
      expect(readIndex).toBeGreaterThan(lockIndex);
      expect(client.parameters[lockIndex]).toEqual([`mollulog:planner-state:user:${userId}`]);
    }
  });

  it("creates the document for a user without one", async () => {
    const client = new FakePostgresClient();

    await createPostgresPyroxeneOwnedResource(
      env,
      7,
      { pyroxene: 900, oneTimeTicket: 2, tenTimeTicket: 1 },
      { inputAt: isoDate, createClient: () => client as unknown as Client },
    );

    expect(client.tables.planner_states?.[0]).toMatchObject({ userId: 7, revision: 1 });
    expect(storedDocument(client).pyroxene.resources).toEqual({
      inputAt: isoDate,
      pyroxene: 900,
      oneTimeTicket: 2,
      tenTimeTicket: 1,
    });
  });

  it("leaves the document unchanged when the revision update fails", async () => {
    const client = clientWithDocument();
    const originalDocument = client.tables.planner_states?.[0]?.document;
    const originalQuery = client.query.bind(client);
    jest.spyOn(client, "query").mockImplementation(async (config, positionalValues) => {
      const text = typeof config === "string" ? config : config.text;
      if (text.startsWith('update "planner_states"')) throw new Error("revision update failed");
      return originalQuery(config, positionalValues);
    });

    await expect(
      upsertPostgresCollectedSource(env, 7, "source-2", { createClient: () => client as unknown as Client }),
    ).rejects.toThrow();

    const statements = client.statements.map((statement) => statement.toLowerCase());
    expect(statements).toContain("rollback");
    expect(statements).not.toContain("commit");
    expect(client.tables.planner_states?.[0]?.document).toEqual(originalDocument);
  });

  it("reapplies one retryable mutation to the latest revision after a compare-and-set conflict", async () => {
    const client = clientWithDocument();
    const originalQuery = client.query.bind(client);
    let conditionalUpdates = 0;
    let concurrentCommitApplied = false;
    jest.spyOn(client, "query").mockImplementation(async (config, positionalValues) => {
      const text = typeof config === "string" ? config : config.text;
      if (text.startsWith('update "planner_states"') && conditionalUpdates === 0) {
        conditionalUpdates += 1;
        return { rows: [], rowCount: 0 };
      }
      const result = await originalQuery(config, positionalValues);
      if (text.toLowerCase() === "rollback" && !concurrentCommitApplied) {
        concurrentCommitApplied = true;
        const stateRow = client.tables.planner_states?.[0];
        if (!stateRow) throw new Error("Expected the concurrent planner state row");
        const currentDocument = stateRow.document as PlannerStateDocumentV1;
        stateRow.revision = 2;
        stateRow.document = {
          ...currentDocument,
          pyroxene: { ...currentDocument.pyroxene, collectedSourceKeys: ["source-concurrent"] },
        };
      }
      if (text.startsWith('update "planner_states"')) conditionalUpdates += 1;
      return result;
    });

    await upsertPostgresCollectedSource(env, 7, "source-retry", {
      createClient: () => client as unknown as Client,
    });

    expect(conditionalUpdates).toBe(2);
    expect(storedDocument(client).pyroxene.collectedSourceKeys).toEqual(["source-concurrent", "source-retry"]);
    expect(client.tables.planner_states?.[0]?.revision).toBe(3);
  });

  it("returns an explicit revision conflict when an update is not safe to retry", async () => {
    const client = clientWithDocument();
    const originalQuery = client.query.bind(client);
    let conditionalUpdates = 0;
    jest.spyOn(client, "query").mockImplementation(async (config, positionalValues) => {
      const text = typeof config === "string" ? config : config.text;
      if (text.startsWith('update "planner_states"')) {
        conditionalUpdates += 1;
        return { rows: [], rowCount: 0 };
      }
      return originalQuery(config, positionalValues);
    });

    await expect(
      updatePlannerStateDocumentInDatabase(drizzle(client as unknown as Client), 7, async (_transaction, document) => ({
        document,
        result: undefined,
      })),
    ).rejects.toBeInstanceOf(PlannerStateRevisionConflictError);

    expect(conditionalUpdates).toBe(1);
    expect(client.statements.map((statement) => statement.toLowerCase())).toContain("rollback");
  });

  it.each<[string, (client: FakePostgresClient) => Promise<unknown>, (document: PlannerStateDocumentV1) => void]>([
    [
      "owned resource create",
      (client) =>
        createPostgresPyroxeneOwnedResource(
          env,
          7,
          { pyroxene: 900, oneTimeTicket: 2, tenTimeTicket: 1 },
          { inputAt: isoDate, createClient: () => client as unknown as Client },
        ),
      (document) =>
        expect(document.pyroxene.resources).toEqual({
          inputAt: isoDate,
          pyroxene: 900,
          oneTimeTicket: 2,
          tenTimeTicket: 1,
        }),
    ],
    [
      "owned resource create with an older input time",
      (client) =>
        createPostgresPyroxeneOwnedResource(
          env,
          7,
          { pyroxene: 900, oneTimeTicket: 2, tenTimeTicket: 1 },
          { inputAt: "2026-07-01T00:00:00.000Z", createClient: () => client as unknown as Client },
        ),
      (document) => expect(document.pyroxene.resources).toEqual(baseDocument().pyroxene.resources),
    ],
    [
      "collected source ensure",
      (client) =>
        ensurePostgresCollectedSource(env, 7, "source-one", { createClient: () => client as unknown as Client }),
      (document) => expect(document.pyroxene.collectedSourceKeys).toEqual(["source-existing", "source-one"]),
    ],
    [
      "collected sources bulk upsert",
      (client) =>
        upsertPostgresCollectedSources(env, 7, ["source-two", "source-one", ""], {
          createClient: () => client as unknown as Client,
        }),
      (document) =>
        expect(document.pyroxene.collectedSourceKeys).toEqual(["source-existing", "source-one", "source-two"]),
    ],
    [
      "collected source delete",
      (client) =>
        deletePostgresCollectedSource(env, 7, "source-existing", { createClient: () => client as unknown as Client }),
      (document) => expect(document.pyroxene.collectedSourceKeys).toEqual([]),
    ],
    [
      "buy record create",
      (client) =>
        createPostgresBuyPyroxene(env, 7, isoDate, 120, {
          uid: "buy-new",
          repeatType: "monthly_first",
          monthlyCount: 2,
          createClient: () => client as unknown as Client,
        }),
      (document) =>
        expect(document.pyroxene.records.at(-1)).toEqual(
          record({
            uid: "buy-new",
            eventAt: normalizedIsoDate,
            source: "buy",
            repeatType: "monthly_first",
            description: "청휘석 구매",
            pyroxeneDelta: 240,
          }),
        ),
    ],
    [
      "timeline record delete",
      (client) =>
        deletePostgresPyroxeneTimelineItem(env, 7, "record-1", { createClient: () => client as unknown as Client }),
      (document) => expect(document.pyroxene.records).toEqual([]),
    ],
    [
      "monthly package create",
      (client) =>
        createPostgresPyroxeneMonthlyPackage(env, 7, isoDate, "half", true, "monthly-new", {
          createClient: () => client as unknown as Client,
        }),
      (document) =>
        expect(document.pyroxene.records.slice(1)).toEqual([
          expect.objectContaining({
            uid: "monthly-new::onetime",
            eventAt: normalizedIsoDate,
            source: "package_onetime",
            autoRepurchase: true,
            repeatIntervalDays: expect.any(Number),
            repeatCount: null,
          }),
          expect.objectContaining({
            uid: "monthly-new::daily",
            eventAt: normalizedIsoDate,
            source: "package_daily",
            autoRepurchase: true,
            repeatCount: null,
          }),
        ]),
    ],
    [
      "AP package create",
      (client) =>
        createPostgresPyroxeneApPackage(env, 7, isoDate, false, "ap-new", {
          createClient: () => client as unknown as Client,
        }),
      (document) =>
        expect(document.pyroxene.records.at(-1)).toEqual(
          expect.objectContaining({ uid: "ap-new::ap", source: "package_ap", repeatIntervalDays: null }),
        ),
    ],
    [
      "attendance record replace",
      (client) =>
        createPostgresAttendance(env, 7, isoDate, "attendance-new", {
          createClient: () => client as unknown as Client,
        }).then(() =>
          createPostgresAttendance(env, 7, isoDate, "attendance-next", {
            createClient: () => client as unknown as Client,
          }),
        ),
      (document) => {
        const attendance = document.pyroxene.records.filter(({ source }) => source === "attendance");
        expect(attendance.map(({ uid, eventAt }) => [uid, eventAt])).toEqual([
          ["attendance-next::5", "2026-08-08T19:00:00.000Z"],
          ["attendance-next::10", "2026-08-13T19:00:00.000Z"],
        ]);
      },
    ],
    [
      "other record create",
      (client) =>
        createPostgresOtherPyroxeneGain(env, 7, isoDate, 20, 1, 0, "Other", "other-new", {
          createClient: () => client as unknown as Client,
        }),
      (document) =>
        expect(document.pyroxene.records.at(-1)).toEqual(
          record({
            uid: "other-new",
            eventAt: normalizedIsoDate,
            description: "Other",
            pyroxeneDelta: 20,
            oneTimeTicketDelta: 1,
          }),
        ),
    ],
    [
      "planner options upsert",
      (client) =>
        upsertPostgresPyroxenePlannerOptions(env, 7, defaultPyroxenePlannerOptions, {
          createClient: () => client as unknown as Client,
        }),
      (document) => expect(document.pyroxene.options).toEqual(defaultPyroxenePlannerOptions),
    ],
    [
      "event data upsert",
      (client) =>
        upsertPostgresPyroxeneEventData(
          env,
          7,
          "event-1",
          { completed: true },
          { createClient: () => client as unknown as Client },
        ),
      (document) => expect(document.pyroxene.eventData["event-1"]).toEqual({ completed: true, expectedTrials: 3 }),
    ],
    [
      "event data delete",
      (client) =>
        deletePostgresPyroxeneEventData(env, 7, "event-1", { createClient: () => client as unknown as Client }),
      (document) => expect(document.pyroxene.eventData).toEqual({}),
    ],
  ])("writes only the planner state document for %s", async (_name, mutate, verify) => {
    const client = clientWithDocument();

    await mutate(client);

    verify(storedDocument(client));
    expect(new Set(touchedTables(client))).toEqual(new Set(["planner_states"]));
  });

  it("rejects a timeline record whose uid already exists", async () => {
    const client = clientWithDocument();
    const originalDocument = client.tables.planner_states?.[0]?.document;

    await expect(
      createPostgresOtherPyroxeneGain(env, 7, isoDate, 20, 0, 0, "Duplicate", "record-1", {
        createClient: () => client as unknown as Client,
      }),
    ).rejects.toThrow("Duplicate Pyroxene timeline uid");
    expect(client.tables.planner_states?.[0]?.document).toEqual(originalDocument);
  });

  it("keeps same-date package records after existing same-date records", async () => {
    const eventAt = "2026-07-31T19:00:00.000Z";
    const client = clientWithDocument({
      ...baseDocument(),
      pyroxene: {
        ...baseDocument().pyroxene,
        records: [record({ uid: "z-existing", eventAt }), record({ uid: "y-existing", eventAt })],
      },
    });

    await createPostgresPyroxeneMonthlyPackage(
      env,
      7,
      new Date("2026-08-01T00:00:00.000Z"),
      "half",
      false,
      "a-package",
      {
        createClient: () => client as unknown as Client,
      },
    );

    expect(storedDocument(client).pyroxene.records.map(({ uid }) => uid)).toEqual([
      "z-existing",
      "y-existing",
      "a-package::onetime",
      "a-package::daily",
    ]);
  });

  it("updates a one-off record in place and re-sorts it by date", async () => {
    const client = clientWithDocument({
      ...baseDocument(),
      pyroxene: {
        ...baseDocument().pyroxene,
        records: [
          record({ uid: "first", eventAt: "2026-07-31T19:00:00.000Z" }),
          record({ uid: "moving", eventAt: "2026-08-08T19:00:00.000Z" }),
        ],
      },
    });

    const updated = await updatePostgresPyroxeneOneOffTimelineItem(
      env,
      7,
      "moving",
      {
        source: "other",
        date: "2026-07-20T00:00:00.000Z",
        description: "Moved",
        pyroxeneDelta: 10,
        oneTimeTicketDelta: 1,
        tenTimeTicketDelta: 2,
      },
      { createClient: () => client as unknown as Client },
    );

    expect(updated).toBe(true);
    expect(storedDocument(client).pyroxene.records).toEqual([
      record({
        uid: "moving",
        eventAt: "2026-07-19T19:00:00.000Z",
        description: "Moved",
        pyroxeneDelta: 10,
        oneTimeTicketDelta: 1,
        tenTimeTicketDelta: 2,
      }),
      record({ uid: "first", eventAt: "2026-07-31T19:00:00.000Z" }),
    ]);
  });

  it.each([
    { name: "a different source", target: record({ uid: "target", source: "buy" }) },
    { name: "a monthly purchase", target: record({ uid: "target", source: "other", repeatType: "monthly_first" }) },
    { name: "a repeating record", target: record({ uid: "target", repeatIntervalDays: 7 }) },
    { name: "an auto-repurchased record", target: record({ uid: "target", autoRepurchase: true }) },
  ])("does not update $name as a one-off record", async ({ target }) => {
    const document = { ...baseDocument(), pyroxene: { ...baseDocument().pyroxene, records: [target] } };
    const client = clientWithDocument(document);

    const updated = await updatePostgresPyroxeneOneOffTimelineItem(
      env,
      7,
      "target",
      {
        source: "other",
        date: isoDate,
        description: "Updated",
        pyroxeneDelta: 10,
        oneTimeTicketDelta: 0,
        tenTimeTicketDelta: 0,
      },
      { createClient: () => client as unknown as Client },
    );

    expect(updated).toBe(false);
    expect(storedDocument(client).pyroxene.records).toEqual([target]);
  });

  it.each([
    { repeatType: "weekly" as never },
    { repeatType: null as never },
    { monthlyCount: 0 },
    { monthlyCount: -1 },
    { monthlyCount: 1.5 },
    { monthlyCount: Number.NaN },
    { monthlyCount: Number.POSITIVE_INFINITY },
    { monthlyCount: null as never },
  ])("rejects invalid Pyroxene purchase options before writing: %p", async (options) => {
    const client = new FakePostgresClient();

    await expect(
      createPostgresBuyPyroxene(env, 7, isoDate, 100, { ...options, createClient: () => client as unknown as Client }),
    ).rejects.toThrow(/Invalid Pyroxene purchase/);
    expect(client.statements).toEqual([]);
  });
});
