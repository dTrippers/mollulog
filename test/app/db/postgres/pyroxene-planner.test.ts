import { describe, expect, it } from "@jest/globals";
import type { Client } from "pg";
import { projectPlannerStateDocument } from "~/domain/planner-state";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { getPyroxeneUserState } from "~/models/pyroxene-planner";
import { FakePostgresClient } from "../../../helpers/fake-postgres";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;
const date = new Date("2026-08-01T00:00:00.000Z");

describe("PostgreSQL Pyroxene planner state reads", () => {
  it("returns the same projected state from planner_states without reading legacy tables", async () => {
    const legacyRows = {
      resources: [
        {
          id: 1,
          uid: "older",
          userId: 7,
          inputAt: new Date("2026-07-01T00:00:00.000Z"),
          pyroxene: 800,
          oneTimeTicket: 1,
          tenTimeTicket: 2,
        },
        { id: 2, uid: "latest", userId: 7, inputAt: date, pyroxene: 1200, oneTimeTicket: 3, tenTimeTicket: 4 },
      ],
      timelineItems: [
        {
          id: 3,
          uid: "timeline-1",
          userId: 7,
          eventAt: new Date("2026-08-02T19:00:00.000Z"),
          source: "buy",
          repeatType: null,
          repeatIntervalDays: null,
          repeatCount: null,
          autoRepurchase: false,
          description: "청휘석 구매",
          pyroxeneDelta: 6600,
          oneTimeTicketDelta: 0,
          tenTimeTicketDelta: 0,
        },
      ],
      plannerOptions: [{ id: 4, userId: 7, options: JSON.stringify(defaultPyroxenePlannerOptions) }],
      collectedSources: [
        { id: 5, uid: "source-1", userId: 7, sourceKey: "source-1", collectedAt: date },
        { id: 6, uid: "source-2", userId: 7, sourceKey: "source-2", collectedAt: date },
      ],
      eventData: [{ id: 7, uid: "event-data-1", userId: 7, eventUid: "event-1", completed: true, expectedTrials: 200 }],
      eventShops: [],
    };
    const document = projectPlannerStateDocument(legacyRows);
    const client = new FakePostgresClient({
      planner_states: [{ id: 1, userId: 7, revision: 3, document }],
    });

    const state = await getPyroxeneUserState(env, 7, { createClient: () => client as unknown as Client });

    expect(state).toEqual({
      latestResources: { ...document.pyroxene.resources, userId: 7 },
      options: document.pyroxene.options,
      eventData: [{ ...document.pyroxene.eventData["event-1"], eventUid: "event-1", userId: 7 }],
      timelineItems: document.pyroxene.records.map((record) => ({ ...record, userId: 7 })),
      collectedSourceKeys: new Set(document.pyroxene.collectedSourceKeys),
    });
    expect(client.statements.some((statement) => statement.includes('from "planner_states"'))).toBe(true);
    expect(
      client.statements.some((statement) =>
        /from "(pyroxene_owned_resources|pyroxene_timeline_items|pyroxene_planner_options|pyroxene_collected_sources|pyroxene_event_data)"/.test(
          statement,
        ),
      ),
    ).toBe(false);
  });

  it("uses an empty typed state for a user without a planner row", async () => {
    const client = new FakePostgresClient();

    const state = await getPyroxeneUserState(env, 8, { createClient: () => client as unknown as Client });

    expect(state.latestResources).toBeNull();
    expect(state.timelineItems).toEqual([]);
    expect(state.eventData).toEqual([]);
    expect(state.collectedSourceKeys).toEqual(new Set());
    expect(state.options).toEqual(defaultPyroxenePlannerOptions);
  });
});
