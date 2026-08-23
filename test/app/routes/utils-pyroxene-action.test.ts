import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
type AsyncMock = (...args: unknown[]) => Promise<unknown>;
const mockCreatePyroxeneOwnedResource = jest.fn<AsyncMock>();
const mockCreateBuyPyroxene = jest.fn<AsyncMock>();
const mockCreatePyroxeneMonthlyPackage = jest.fn<AsyncMock>();
const mockCreatePyroxeneApPackage = jest.fn<AsyncMock>();
const mockCreateAttendance = jest.fn<AsyncMock>();
const mockCreateOtherPyroxeneGain = jest.fn<AsyncMock>();
const mockUpsertPyroxeneEventData = jest.fn<AsyncMock>();
const mockUpsertPyroxenePlannerOptions = jest.fn<AsyncMock>();
const mockUpsertCollectedSources = jest.fn<AsyncMock>();
const mockDeleteCollectedSource = jest.fn<AsyncMock>();
const mockDeletePyroxeneTimelineItem = jest.fn<AsyncMock>();
const mockGetPyroxenePlannerContents = jest.fn<AsyncMock>();
const mockSetRecruitmentResultCompletion = jest.fn<AsyncMock>();
const mockGetRecruitmentResultsByRecruitmentGroupUids = jest.fn<AsyncMock>();
const mockDeleteRecruitmentResult = jest.fn<AsyncMock>();
const mockLoggerError = jest.fn();
const mockGetLogger = jest.fn(() => ({ error: mockLoggerError }));

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/pyroxene-planner", () => {
  const actual = jest.requireActual<typeof import("~/models/pyroxene-planner")>("~/models/pyroxene-planner");
  return {
    ...actual,
    createPyroxeneOwnedResource: mockCreatePyroxeneOwnedResource,
    createBuyPyroxene: mockCreateBuyPyroxene,
    createPyroxeneMonthlyPackage: mockCreatePyroxeneMonthlyPackage,
    createPyroxeneApPackage: mockCreatePyroxeneApPackage,
    createAttendance: mockCreateAttendance,
    createOtherPyroxeneGain: mockCreateOtherPyroxeneGain,
    upsertPyroxeneEventData: mockUpsertPyroxeneEventData,
    upsertPyroxenePlannerOptions: mockUpsertPyroxenePlannerOptions,
    upsertCollectedSources: mockUpsertCollectedSources,
    deleteCollectedSource: mockDeleteCollectedSource,
    deletePyroxeneTimelineItem: mockDeletePyroxeneTimelineItem,
  };
});
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: mockGetPyroxenePlannerContents }));
jest.mock("~/models/recruitment-result.server", () => ({
  deleteRecruitmentResult: mockDeleteRecruitmentResult,
  getRecruitmentResultsByRecruitmentGroupUids: mockGetRecruitmentResultsByRecruitmentGroupUids,
  setRecruitmentResultCompletion: mockSetRecruitmentResultCompletion,
}));
jest.mock("~/lib/observability.server", () => ({ getLogger: mockGetLogger }));

import { action } from "~/routes/utils.pyroxene";
import { decodePyroxeneActionPayload } from "~/routes/utils.pyroxene._components/action-data";

const env = {} as Env;
const ctx = {} as ExecutionContext;
const validActions = [
  {
    intent: "save-owned-resources",
    payload: { resources: { pyroxene: 1_200, oneTimeTicket: 1, tenTimeTicket: 2 } },
    method: "POST",
  },
  {
    intent: "save-buy",
    payload: { quantity: 100, date: "2026-08-08", repeatType: "fixed_days", monthlyCount: 1 },
    method: "POST",
  },
  {
    intent: "save-monthly-package",
    payload: { startDate: "2026-08-08T00:00:00.000Z", packageType: "half", autoRepurchase: true },
    method: "POST",
  },
  {
    intent: "save-ap-package",
    payload: { startDate: "2026-08-08T00:00:00.000Z", autoRepurchase: false },
    method: "POST",
  },
  {
    intent: "save-attendance",
    payload: { startDate: "2026-08-08T00:00:00.000Z" },
    method: "POST",
  },
  {
    intent: "save-other",
    payload: {
      resources: { pyroxene: 1_200, oneTimeTicket: 1, tenTimeTicket: 2 },
      description: "other",
      date: "2026-08-08",
    },
    method: "POST",
  },
  {
    intent: "update-event-data",
    payload: { eventUid: "event-1", expectedTrials: 10 },
    method: "POST",
  },
  { intent: "save-options", payload: { options: defaultPyroxenePlannerOptions }, method: "POST" },
  { intent: "collect-source", payload: { sourceKey: "source-1" }, method: "POST" },
  { intent: "uncollect-source", payload: { sourceKey: "source-1" }, method: "DELETE" },
  {
    intent: "delete-pickup-completion",
    payload: { eventUid: "event-1", recruitmentGroupUid: "group-1" },
    method: "DELETE",
  },
  { intent: "delete-timeline-item", payload: { itemUid: "item-1" }, method: "DELETE" },
] as const;

function actionArgs(intent: string, payload: unknown, method: string) {
  return {
    context: { cloudflare: { env, ctx } },
    request: new Request("https://mollulog.test/utils/pyroxene", {
      method,
      body: JSON.stringify({ intent, payload }),
      headers: { "Content-Type": "application/json" },
    }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockCreatePyroxeneOwnedResource.mockResolvedValue(undefined);
  mockCreateBuyPyroxene.mockResolvedValue(undefined);
  mockCreatePyroxeneMonthlyPackage.mockResolvedValue(undefined);
  mockCreatePyroxeneApPackage.mockResolvedValue(undefined);
  mockCreateAttendance.mockResolvedValue(undefined);
  mockCreateOtherPyroxeneGain.mockResolvedValue(undefined);
  mockUpsertPyroxeneEventData.mockResolvedValue(undefined);
  mockUpsertPyroxenePlannerOptions.mockResolvedValue(undefined);
  mockUpsertCollectedSources.mockResolvedValue(undefined);
  mockDeleteCollectedSource.mockResolvedValue(undefined);
  mockDeletePyroxeneTimelineItem.mockResolvedValue(undefined);
  mockGetPyroxenePlannerContents.mockResolvedValue([]);
  mockSetRecruitmentResultCompletion.mockResolvedValue(undefined);
  mockGetRecruitmentResultsByRecruitmentGroupUids.mockResolvedValue([{ uid: "result-1" }]);
  mockDeleteRecruitmentResult.mockResolvedValue(undefined);
});

describe("Pyroxene action payload", () => {
  it.each(validActions)("decodes valid $intent with $method", ({ intent, payload, method }) => {
    expect(decodePyroxeneActionPayload({ intent, payload }, method)).toMatchObject({ intent, payload });
  });

  it("accepts owned-resource loader metadata while returning only mutation fields", () => {
    expect(
      decodePyroxeneActionPayload(
        {
          traceId: "request-1",
          intent: "save-owned-resources",
          payload: {
            resources: {
              pyroxene: 1_200,
              oneTimeTicket: 1,
              tenTimeTicket: 2,
              inputAt: "2026-08-08T00:00:00.000Z",
            },
            eventUid: null,
            collectedSourceKeys: ["event_reward:event-1"],
            unrelated: { source: "loader" },
          },
        },
        "POST",
      ),
    ).toEqual({
      intent: "save-owned-resources",
      payload: {
        resources: { pyroxene: 1_200, oneTimeTicket: 1, tenTimeTicket: 2 },
        eventUid: null,
        collectedSourceKeys: ["event_reward:event-1"],
      },
    });
  });

  it("ignores unrelated fields at every options level", () => {
    const options = {
      ...defaultPyroxenePlannerOptions,
      metadata: { source: "loader" },
      event: { ...defaultPyroxenePlannerOptions.event, metadata: true },
      raid: { ...defaultPyroxenePlannerOptions.raid, metadata: true },
      tactical: { ...defaultPyroxenePlannerOptions.tactical, metadata: true },
      consumption: { ...defaultPyroxenePlannerOptions.consumption, metadata: true },
      timeline: { ...defaultPyroxenePlannerOptions.timeline, metadata: true },
    };

    expect(
      decodePyroxeneActionPayload(
        { intent: "save-options", payload: { options, metadata: "future" }, metadata: "request" },
        "POST",
      ),
    ).toEqual({ intent: "save-options", payload: { options: defaultPyroxenePlannerOptions } });
  });

  it.each(validActions)("ignores unrelated payload fields for $intent", ({ intent, payload, method }) => {
    const expected = decodePyroxeneActionPayload({ intent, payload }, method);
    const decoratedPayload = { ...payload, metadata: { source: "future" } };
    expect(decodePyroxeneActionPayload({ intent, payload: decoratedPayload, metadata: "request" }, method)).toEqual(
      expected,
    );
  });

  it.each([
    ["2026-08-08", true],
    ["2026-08-08T00:00:00.000Z", true],
    ["2026-08-08T09:30:15+09:00", true],
    ["123", false],
    ["2026", false],
    ["08/08/2026", false],
    ["2026-02-30", false],
    ["2026-08-08T00:00:00", false],
    ["2026-08-08T00:00:00+25:00", false],
  ])("validates date %s", (date, valid) => {
    const decode = () => decodePyroxeneActionPayload({ intent: "save-buy", payload: { quantity: 1, date } }, "POST");
    if (valid) {
      expect(decode()).toMatchObject({ payload: { date } });
    } else {
      expect(decode).toThrow();
    }
  });

  it.each([0, -1, -100, 1.5, Number.NaN])("rejects save-buy quantity %s", (quantity) => {
    expect(() =>
      decodePyroxeneActionPayload({ intent: "save-buy", payload: { quantity, date: "2026-08-08" } }, "POST"),
    ).toThrow();
  });

  it.each([
    ["pyroxene", -1],
    ["oneTimeTicket", -1],
    ["tenTimeTicket", -1],
  ])("rejects negative %s resource counters", (resourceKey, value) => {
    const resources = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0, [resourceKey]: value };
    expect(() =>
      decodePyroxeneActionPayload({ intent: "save-owned-resources", payload: { resources } }, "POST"),
    ).toThrow();
  });

  it.each([
    ["save-owned-resources", { resources: { pyroxene: 1, oneTimeTicket: 0 } }, "POST"],
    ["save-buy", { quantity: 1 }, "POST"],
    ["save-monthly-package", { startDate: "2026-08-08T00:00:00.000Z", autoRepurchase: false }, "POST"],
    ["save-ap-package", { startDate: "2026-08-08T00:00:00.000Z" }, "POST"],
    ["save-attendance", {}, "POST"],
    ["save-other", { resources: { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 }, description: "other" }, "POST"],
    ["update-event-data", { expectedTrials: 1 }, "POST"],
    ["save-options", {}, "POST"],
    ["collect-source", {}, "POST"],
    ["uncollect-source", {}, "DELETE"],
    ["delete-pickup-completion", {}, "DELETE"],
    ["delete-timeline-item", {}, "DELETE"],
  ])("rejects missing required fields for %s", (intent, payload, method) => {
    expect(() => decodePyroxeneActionPayload({ intent, payload }, method)).toThrow();
  });

  it.each(validActions)("rejects the wrong method for $intent", ({ intent, payload, method }) => {
    const wrongMethod = method === "POST" ? "DELETE" : "POST";
    expect(() => decodePyroxeneActionPayload({ intent, payload }, wrongMethod)).toThrow();
  });

  it.each([
    ["save-owned-resources", { resources: { pyroxene: "1", oneTimeTicket: 0, tenTimeTicket: 0 } }, "POST"],
    ["save-owned-resources", { resources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 }, eventUid: 1 }, "POST"],
    [
      "save-owned-resources",
      { resources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 }, collectedSourceKeys: "source-1" },
      "POST",
    ],
    ["save-buy", { quantity: 1, date: "2026-08-08", monthlyCount: 0 }, "POST"],
    ["save-buy", { quantity: "1", date: "2026-08-08" }, "POST"],
    ["save-buy", { quantity: 1, date: "2026-08-08", repeatType: "weekly" }, "POST"],
    ["save-buy", { quantity: 1, date: 1 }, "POST"],
    [
      "save-monthly-package",
      { startDate: "2026-08-08T00:00:00.000Z", packageType: "unknown", autoRepurchase: false },
      "POST",
    ],
    ["save-monthly-package", { startDate: 1, packageType: "half", autoRepurchase: false }, "POST"],
    [
      "save-monthly-package",
      { startDate: "2026-08-08T00:00:00.000Z", packageType: "half", autoRepurchase: "false" },
      "POST",
    ],
    [
      "save-monthly-package",
      {
        startDate: "2026-08-08T00:00:00.000Z",
        packageType: "half",
        autoRepurchase: false,
        options: { ...defaultPyroxenePlannerOptions, event: { pickupChance: "invalid" } },
      },
      "POST",
    ],
    ["save-ap-package", { startDate: "2026-08-08T00:00:00.000Z", autoRepurchase: "false" }, "POST"],
    ["save-ap-package", { startDate: 1, autoRepurchase: false }, "POST"],
    ["save-ap-package", { startDate: "2026-08-08T00:00:00.000Z", autoRepurchase: false, options: null }, "POST"],
    ["save-attendance", { startDate: 1 }, "POST"],
    [
      "save-other",
      { resources: { pyroxene: -1, oneTimeTicket: 0, tenTimeTicket: 0 }, description: "other", date: "2026-08-08" },
      "POST",
    ],
    [
      "save-other",
      { resources: { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 }, description: 1, date: "2026-08-08" },
      "POST",
    ],
    [
      "save-other",
      { resources: { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 }, description: "other", date: 1 },
      "POST",
    ],
    ["update-event-data", { eventUid: "event-1", expectedTrials: -1 }, "POST"],
    ["update-event-data", { eventUid: 1, expectedTrials: 1 }, "POST"],
    ["update-event-data", { eventUid: "event-1", expectedTrials: "1" }, "POST"],
    ["save-options", { options: { ...defaultPyroxenePlannerOptions, event: { pickupChance: "invalid" } } }, "POST"],
    ["collect-source", { sourceKey: "" }, "POST"],
    ["collect-source", { sourceKey: 1 }, "POST"],
    ["uncollect-source", { sourceKey: 1 }, "DELETE"],
    ["delete-pickup-completion", { eventUid: "event-1", recruitmentGroupUid: 1 }, "DELETE"],
    ["delete-pickup-completion", { eventUid: 1 }, "DELETE"],
    ["delete-timeline-item", { itemUid: "" }, "DELETE"],
    ["delete-timeline-item", { itemUid: 1 }, "DELETE"],
  ])("rejects invalid consumed values for %s", (intent, payload, method) => {
    expect(() => decodePyroxeneActionPayload({ intent, payload }, method)).toThrow();
  });

  it.each([null, [], "payload", 42])("rejects unreadable payload %p", (payload) => {
    expect(() => decodePyroxeneActionPayload({ intent: "save-buy", payload }, "POST")).toThrow();
  });

  it("rejects unknown intents and the legacy wire format", () => {
    expect(() => decodePyroxeneActionPayload({ intent: "unknown", payload: {} }, "POST")).toThrow();
    expect(() =>
      decodePyroxeneActionPayload({ createData: { buy: { quantity: 100, date: "2026-08-08" } } }, "POST"),
    ).toThrow();
  });
});

const dispatchCases = [
  {
    name: "save-owned-resources",
    intent: "save-owned-resources",
    payload: {
      resources: { pyroxene: 1_200, oneTimeTicket: 1, tenTimeTicket: 2, inputAt: "loader-metadata" },
      eventUid: null,
      collectedSourceKeys: ["event_reward:event-1"],
    },
    method: "POST",
    verify: () => {
      expect(mockCreatePyroxeneOwnedResource).toHaveBeenCalledWith(
        env,
        1,
        {
          pyroxene: 1_200,
          oneTimeTicket: 1,
          tenTimeTicket: 2,
        },
        { inputAt: expect.any(String) },
      );
      expect(mockUpsertCollectedSources).toHaveBeenCalledWith(env, 1, ["event_reward:event-1"]);
    },
  },
  {
    name: "save-buy",
    intent: "save-buy",
    payload: { quantity: 100, date: "2026-08-08", repeatType: "monthly_first", monthlyCount: 2 },
    method: "POST",
    verify: () => {
      expect(mockCreateBuyPyroxene).toHaveBeenCalledWith(env, 1, "2026-08-08", 100, {
        repeatType: "monthly_first",
        monthlyCount: 2,
      });
    },
  },
  {
    name: "save-monthly-package",
    intent: "save-monthly-package",
    payload: {
      startDate: "2026-08-08T00:00:00.000Z",
      packageType: "half",
      autoRepurchase: true,
      options: defaultPyroxenePlannerOptions,
    },
    method: "POST",
    verify: () => {
      expect(mockCreatePyroxeneMonthlyPackage).toHaveBeenCalledWith(env, 1, "2026-08-08T00:00:00.000Z", "half", true);
      expect(mockUpsertPyroxenePlannerOptions).toHaveBeenCalledWith(env, 1, defaultPyroxenePlannerOptions);
    },
  },
  {
    name: "save-ap-package",
    intent: "save-ap-package",
    payload: {
      startDate: "2026-08-08T00:00:00.000Z",
      autoRepurchase: false,
      options: defaultPyroxenePlannerOptions,
    },
    method: "POST",
    verify: () => {
      expect(mockCreatePyroxeneApPackage).toHaveBeenCalledWith(env, 1, "2026-08-08T00:00:00.000Z", false);
      expect(mockUpsertPyroxenePlannerOptions).toHaveBeenCalledWith(env, 1, defaultPyroxenePlannerOptions);
    },
  },
  {
    name: "save-attendance",
    intent: "save-attendance",
    payload: { startDate: "2026-08-08T00:00:00.000Z" },
    method: "POST",
    verify: () => {
      expect(mockCreateAttendance).toHaveBeenCalledWith(env, 1, "2026-08-08T00:00:00.000Z");
    },
  },
  {
    name: "save-other",
    intent: "save-other",
    payload: {
      resources: { pyroxene: 1_200, oneTimeTicket: 1, tenTimeTicket: 2, inputAt: "loader-metadata" },
      description: "other",
      date: "2026-08-08",
    },
    method: "POST",
    verify: () => {
      expect(mockCreateOtherPyroxeneGain).toHaveBeenCalledWith(env, 1, "2026-08-08", 1_200, 1, 2, "other");
    },
  },
  {
    name: "update-event-data",
    intent: "update-event-data",
    payload: { eventUid: "event-1", expectedTrials: 10 },
    method: "POST",
    verify: () => {
      expect(mockUpsertPyroxeneEventData).toHaveBeenCalledWith(env, 1, "event-1", { expectedTrials: 10 });
    },
  },
  {
    name: "save-options",
    intent: "save-options",
    payload: { options: defaultPyroxenePlannerOptions },
    method: "POST",
    verify: () => {
      expect(mockUpsertPyroxenePlannerOptions).toHaveBeenCalledWith(env, 1, defaultPyroxenePlannerOptions);
    },
  },
  {
    name: "collect-source",
    intent: "collect-source",
    payload: { sourceKey: "source-1" },
    method: "POST",
    verify: () => {
      expect(mockUpsertCollectedSources).toHaveBeenCalledWith(env, 1, ["source-1"]);
    },
  },
  {
    name: "uncollect-source",
    intent: "uncollect-source",
    payload: { sourceKey: "source-1" },
    method: "DELETE",
    verify: () => {
      expect(mockDeleteCollectedSource).toHaveBeenCalledWith(env, 1, "source-1");
    },
  },
  {
    name: "delete-pickup-completion",
    intent: "delete-pickup-completion",
    payload: { eventUid: "event-1", recruitmentGroupUid: "group-1" },
    method: "DELETE",
    verify: () => {
      expect(mockGetRecruitmentResultsByRecruitmentGroupUids).toHaveBeenCalledWith(env, 1, ["group-1"]);
      expect(mockDeleteRecruitmentResult).toHaveBeenCalledWith(env, 1, "result-1");
    },
  },
  {
    name: "delete-timeline-item",
    intent: "delete-timeline-item",
    payload: { itemUid: "item-1" },
    method: "DELETE",
    verify: () => {
      expect(mockDeletePyroxeneTimelineItem).toHaveBeenCalledWith(env, 1, "item-1");
    },
  },
] as const;

describe("Pyroxene action dispatch", () => {
  it.each(dispatchCases)("dispatches $name to its current handler", async ({ intent, payload, method, verify }) => {
    const response = await action(actionArgs(intent, payload, method));

    expect(response).toMatchObject({ success: true });
    verify();
  });

  it("returns the server-confirmed owned-resource save time", async () => {
    const response = await action(
      actionArgs("save-owned-resources", { resources: { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 } }, "POST"),
    );

    const savedAt = (response as { savedAt: unknown }).savedAt;
    expect(response).toEqual({ success: true, savedAt: expect.any(String) });
    expect(mockCreatePyroxeneOwnedResource).toHaveBeenCalledWith(
      env,
      1,
      { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 },
      { inputAt: savedAt },
    );
  });

  it("passes pickup completion fields through the owned-resource handler", async () => {
    mockGetPyroxenePlannerContents.mockResolvedValue([
      {
        kind: "event",
        uid: "event-1",
        recruitmentGroupUid: "group-1",
        recruitments: [
          {
            pickup: true,
            student: { uid: "student-1", initialTier: 2 },
          },
        ],
      },
    ]);

    await action(
      actionArgs(
        "save-owned-resources",
        {
          resources: { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 },
          eventUid: "event-1",
        },
        "POST",
      ),
    );

    expect(mockSetRecruitmentResultCompletion).toHaveBeenCalledWith(env, 1, "group-1", true, {
      contentUid: "event-1",
      recruitedStudents: [{ studentUid: "student-1", tier: 2, pickup: true }],
    });
  });

  it("returns a meaningful error and hides internal owned-resource failures", async () => {
    mockCreatePyroxeneOwnedResource.mockRejectedValue(new Error("PostgreSQL connection details"));

    const response = await action(
      actionArgs("save-owned-resources", { resources: { pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 } }, "POST"),
    );

    expect(response).toMatchObject({
      data: { success: false, error: "보유 재화를 저장하지 못했어요" },
      init: { status: 500 },
    });
    expect(mockLoggerError).toHaveBeenCalledWith("Failed to save pyroxene owned resources", expect.any(Error), {
      operation: "save-owned-resources",
      userId: 1,
    });
  });

  it("returns HTTP 400 before executing a write for malformed payloads", async () => {
    const response = await action(
      actionArgs(
        "save-owned-resources",
        { resources: { pyroxene: "1200", oneTimeTicket: 1, tenTimeTicket: 2 } },
        "POST",
      ),
    );

    expect(response).toMatchObject({ data: { success: false }, init: { status: 400 } });
    expect(mockCreatePyroxeneOwnedResource).not.toHaveBeenCalled();
  });
});
