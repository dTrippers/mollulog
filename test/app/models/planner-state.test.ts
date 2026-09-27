import { describe, expect, it } from "@jest/globals";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import {
  getPlannerStateDocumentFromLegacyInDatabase,
  PlannerStateRevisionConflictError,
} from "~/db/postgres/planner-states";
import { pgEventShopStatesTable, pgPyroxeneCollectedSourcesTable } from "~/db/postgres/schema";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { type PlannerStateDocumentV1, projectPlannerStateDocument } from "~/domain/planner-state";
import {
  getApPlannerState,
  getEventShopPlannerState,
  getPlannerState,
  getPyroxenePlannerState,
  isPlannerStateRevisionConflictError,
  PLANNER_STATE_REVISION_CONFLICT_MESSAGE,
  updateApPlannerState,
  updateEventShopState,
  updatePyroxenePlannerState,
} from "~/models/planner-state";
import { FakePostgresClient } from "../../helpers/fake-postgres";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

function createClient() {
  const document = projectPlannerStateDocument({
    resources: [],
    timelineItems: [],
    plannerOptions: [],
    collectedSources: [],
    eventData: [],
    eventShops: [],
  });
  return new FakePostgresClient({
    pyroxene_owned_resources: [],
    pyroxene_collected_sources: [],
    pyroxene_timeline_items: [],
    pyroxene_planner_options: [],
    pyroxene_event_data: [],
    event_shop_states: [],
    planner_states: [{ id: 1, userId: 7, revision: 1, document }],
  });
}

async function expectStoredDocumentToMatchLegacyProjection(client: FakePostgresClient) {
  const row = client.tables.planner_states?.[0];
  if (!row) throw new Error("Expected a planner state row");
  const document = typeof row.document === "string" ? JSON.parse(row.document) : row.document;
  const projected = await getPlannerStateDocumentFromLegacyInDatabase(drizzle(client as unknown as Client), 7);
  expect(document).toEqual(projected);
}

describe("planner state model", () => {
  it("identifies revision conflicts and exports the shared message", () => {
    expect(isPlannerStateRevisionConflictError(new PlannerStateRevisionConflictError())).toBe(true);
    expect(isPlannerStateRevisionConflictError(new Error("unrelated failure"))).toBe(false);
    expect(PLANNER_STATE_REVISION_CONFLICT_MESSAGE).toBe("다른 탭이나 기기에서 플래너가 바뀌었어요");
  });

  it("exposes typed section getters from one planner document", async () => {
    const client = createClient();
    const options = { createClient: () => client as unknown as Client };

    const document = await getPlannerState(env, 7, options);
    const pyroxene = await getPyroxenePlannerState(env, 7, options);
    const shop = await getEventShopPlannerState(env, 7, "event-1", options);

    expect(document.schemaVersion).toBe(1);
    expect(pyroxene).toEqual(document.pyroxene);
    expect(shop).toBeNull();
  });

  it("normalizes old stored options on typed reads without writing back to the row", async () => {
    const client = createClient();
    const row = client.tables.planner_states?.[0];
    if (!row) throw new Error("Expected a planner state row");
    const stored = structuredClone(row.document) as PlannerStateDocumentV1;
    const storedOptions = stored.pyroxene.options as unknown as {
      consumption: { apChargeExceptions?: unknown };
    };
    delete storedOptions.consumption.apChargeExceptions;
    row.document = stored;

    const options = { createClient: () => client as unknown as Client };
    const document = await getPlannerState(env, 7, options);
    const pyroxene = await getPyroxenePlannerState(env, 7, options);

    expect(document.pyroxene.options.consumption.apChargeExceptions).toEqual([]);
    expect(pyroxene.options.consumption.apChargeExceptions).toEqual([]);
    expect((row.document as PlannerStateDocumentV1).pyroxene.options.consumption).not.toHaveProperty(
      "apChargeExceptions",
    );
    expect(row.revision).toBe(1);
  });

  it("rejects an invalid stored AP exception value instead of returning a partial options object", async () => {
    const client = createClient();
    const row = client.tables.planner_states?.[0];
    if (!row) throw new Error("Expected a planner state row");
    const stored = structuredClone(row.document) as PlannerStateDocumentV1;
    (stored.pyroxene.options.consumption as unknown as { apChargeExceptions: unknown }).apChargeExceptions = null;
    row.document = stored;

    await expect(getPyroxenePlannerState(env, 7, { createClient: () => client as unknown as Client })).rejects.toThrow(
      "기간별 AP 충전 예외를 확인할 수 없어요.",
    );
  });

  it("updates the pyroxene section with its legacy mirror in one revisioned operation", async () => {
    const client = createClient();
    const sourceKey = "source-1";

    await expect(
      updatePyroxenePlannerState(
        env,
        7,
        async (transaction, current) => {
          await transaction.insert(pgPyroxeneCollectedSourcesTable).values({
            uid: "source-row-1",
            userId: 7,
            sourceKey,
            collectedAt: new Date("2026-08-01T00:00:00.000Z"),
          });
          return {
            state: { ...current, collectedSourceKeys: [...current.collectedSourceKeys, sourceKey] },
            result: sourceKey,
          };
        },
        { createClient: () => client as unknown as Client },
      ),
    ).resolves.toBe(sourceKey);

    expect(client.tables.planner_states?.[0]?.revision).toBe(2);
    await expectStoredDocumentToMatchLegacyProjection(client);
  });

  it("updates one event shop through the typed section operation and mirrors its payload", async () => {
    const client = createClient();
    const state = { ...createDefaultEventShopState([], ["student-1"]), itemQuantities: { "daily-ticket": 60 } };

    await updateEventShopState(
      env,
      7,
      "event-1",
      async (transaction, current) => {
        const nextState = current ?? state;
        await transaction.insert(pgEventShopStatesTable).values({
          uid: "event-shop-state-1",
          userId: 7,
          eventUid: "event-1",
          ...nextState,
        });
        return { state: nextState, result: undefined };
      },
      { createClient: () => client as unknown as Client },
    );

    expect(
      await getEventShopPlannerState(env, 7, "event-1", { createClient: () => client as unknown as Client }),
    ).toEqual(state);
    expect(client.tables.planner_states?.[0]?.revision).toBe(2);
    await expectStoredDocumentToMatchLegacyProjection(client);
  });

  it("updates only the AP document section and preserves the sections without legacy mirrors", async () => {
    const client = createClient();
    const before = await getPlannerState(env, 7, { createClient: () => client as unknown as Client });

    await updateApPlannerState(
      env,
      7,
      async (_transaction, current) => ({
        state: {
          accountLevel: 85,
          cafeRank: 8,
          comfort: 4_500,
          eventPlans: { "event-1": { accessAt: "2026-09-30T03:00:00.000Z" } },
        },
        result: current,
      }),
      { createClient: () => client as unknown as Client },
    );

    const document = await getPlannerState(env, 7, { createClient: () => client as unknown as Client });
    expect(document.ap).toMatchObject({ accountLevel: 85, cafeRank: 8, comfort: 4_500 });
    expect(document.pyroxene).toEqual(before.pyroxene);
    expect(document.eventShops).toEqual(before.eventShops);
    expect(await getApPlannerState(env, 7, { createClient: () => client as unknown as Client })).toEqual(document.ap);
    expect(client.tables.pyroxene_planner_options).toEqual([]);
    expect(client.tables.event_shop_states).toEqual([]);
    expect(client.tables.planner_states?.[0]?.revision).toBe(2);
  });

  it("rejects an invalid AP update without writing the planner document", async () => {
    const client = createClient();
    const row = client.tables.planner_states?.[0];
    if (!row) throw new Error("Expected a planner state row");

    await expect(
      updateApPlannerState(
        env,
        7,
        async () => ({
          state: { accountLevel: 91, cafeRank: null, comfort: null, eventPlans: {} },
          result: undefined,
        }),
        { createClient: () => client as unknown as Client },
      ),
    ).rejects.toThrow("AP 플래너 내용을 확인해주세요.");

    expect(row.revision).toBe(1);
    expect((row.document as PlannerStateDocumentV1).ap).toBeNull();
  });
});
