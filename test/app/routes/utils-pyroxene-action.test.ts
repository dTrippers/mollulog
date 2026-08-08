import { describe, expect, it, jest } from "@jest/globals";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
const mockCreatePyroxeneOwnedResource = jest.fn();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/pyroxene-planner", () => {
  const actual = jest.requireActual<typeof import("~/models/pyroxene-planner")>("~/models/pyroxene-planner");
  return { ...actual, createPyroxeneOwnedResource: mockCreatePyroxeneOwnedResource };
});

import { action } from "~/routes/utils.pyroxene";
import { decodePyroxeneActionPayload } from "~/routes/utils.pyroxene._components/action-data";

describe("Pyroxene action payload", () => {
  it.each([
    ["save-owned-resources", { resources: { pyroxene: 1200, oneTimeTicket: 1, tenTimeTicket: 2 } }, "POST"],
    ["save-buy", { quantity: 100, date: "2026-08-08", repeatType: "fixed_days", monthlyCount: 1 }, "POST"],
    [
      "save-monthly-package",
      { startDate: "2026-08-08T00:00:00.000Z", packageType: "half", autoRepurchase: true },
      "POST",
    ],
    ["save-ap-package", { startDate: "2026-08-08T00:00:00.000Z", autoRepurchase: false }, "POST"],
    ["save-attendance", { startDate: "2026-08-08T00:00:00.000Z" }, "POST"],
    [
      "save-other",
      { resources: { pyroxene: 1200, oneTimeTicket: 1, tenTimeTicket: 2 }, description: "other", date: "2026-08-08" },
      "POST",
    ],
    ["update-event-data", { eventUid: "event-1", expectedTrials: 10 }, "POST"],
    ["save-options", { options: defaultPyroxenePlannerOptions }, "POST"],
    ["collect-source", { sourceKey: "source-1" }, "POST"],
    ["uncollect-source", { sourceKey: "source-1" }, "DELETE"],
    ["delete-pickup-completion", { eventUid: "event-1", recruitmentGroupUid: "group-1" }, "DELETE"],
    ["delete-timeline-item", { itemUid: "item-1" }, "DELETE"],
  ])("decodes valid %s intent", (intent, payload, method) => {
    expect(decodePyroxeneActionPayload({ intent, payload }, method)).toMatchObject({ intent, payload });
  });

  it.each([
    "2026-08-08",
    "2026-08-08T00:00:00.000Z",
    "2026-08-08T09:30:15+09:00",
  ])("accepts valid date format %s", (date) => {
    expect(decodePyroxeneActionPayload({ intent: "save-buy", payload: { quantity: 1, date } }, "POST")).toMatchObject({
      payload: { date },
    });
  });

  it.each([
    "123",
    "2026",
    "08/08/2026",
    "2026-02-30",
    "2026-08-08T00:00:00",
    "2026-08-08T00:00:00+25:00",
  ])("rejects ambiguous or impossible date %s", (date) => {
    expect(() => decodePyroxeneActionPayload({ intent: "save-buy", payload: { quantity: 1, date } }, "POST")).toThrow();
  });

  it.each([0, -1, -100])("rejects save-buy quantity %s", (quantity) => {
    expect(() =>
      decodePyroxeneActionPayload({ intent: "save-buy", payload: { quantity, date: "2026-08-08" } }, "POST"),
    ).toThrow();
  });

  it("decodes one mutation intent with coupled source updates", () => {
    expect(
      decodePyroxeneActionPayload(
        {
          intent: "save-owned-resources",
          payload: {
            resources: { pyroxene: 1200, oneTimeTicket: 1, tenTimeTicket: 2 },
            eventUid: "event-1",
            collectedSourceKeys: ["event_reward:event-1"],
          },
        },
        "POST",
      ),
    ).toEqual({
      intent: "save-owned-resources",
      payload: {
        resources: { pyroxene: 1200, oneTimeTicket: 1, tenTimeTicket: 2 },
        eventUid: "event-1",
        collectedSourceKeys: ["event_reward:event-1"],
      },
    });
  });

  it("decodes option updates coupled to package creation", () => {
    expect(
      decodePyroxeneActionPayload(
        {
          intent: "save-monthly-package",
          payload: {
            startDate: "2026-08-08T00:00:00.000Z",
            packageType: "half",
            autoRepurchase: true,
            options: defaultPyroxenePlannerOptions,
          },
        },
        "POST",
      ),
    ).toMatchObject({
      intent: "save-monthly-package",
      payload: { packageType: "half", options: defaultPyroxenePlannerOptions },
    });
  });

  it.each([
    [{ intent: "save-buy", payload: { quantity: 100, date: "2026-08-08", extra: true } }, "POST"],
    [{ intent: "save-buy", payload: { quantity: "100", date: "2026-08-08" } }, "POST"],
    [{ intent: "save-options", payload: { options: defaultPyroxenePlannerOptions }, extra: true }, "POST"],
    [{ intent: "collect-source", payload: { sourceKey: "source-1" } }, "DELETE"],
  ])("rejects malformed or ambiguous payloads", (payload, method) => {
    expect(() => decodePyroxeneActionPayload(payload, method)).toThrow();
  });

  it("requires a single explicit intent", () => {
    expect(() =>
      decodePyroxeneActionPayload({ createData: { buy: { quantity: 100, date: "2026-08-08" } } }, "POST"),
    ).toThrow();
  });

  it("returns HTTP 400 before executing a write for malformed payloads", async () => {
    mockGetActiveSensei.mockResolvedValue({ id: 1 });

    const response = await action({
      context: { cloudflare: { env: {} as Env } },
      request: new Request("https://mollulog.test/utils/pyroxene", {
        method: "POST",
        body: JSON.stringify({
          intent: "save-owned-resources",
          payload: { resources: { pyroxene: "1200", oneTimeTicket: 1, tenTimeTicket: 2 } },
        }),
        headers: { "Content-Type": "application/json" },
      }),
    } as never);

    expect(response).toMatchObject({ data: { success: false }, init: { status: 400 } });
    expect(mockCreatePyroxeneOwnedResource).not.toHaveBeenCalled();
  });
});
