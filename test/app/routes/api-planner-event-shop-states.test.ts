import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopContent = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopStates = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<{ studentUid: string }[]>>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/event-content", () => ({
  getEventMetadata: mockGetEventMetadata,
  getEventShopContent: mockGetEventShopContent,
}));
jest.mock("~/models/event-shop-state", () => ({ getEventShopStates: mockGetEventShopStates }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));

import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { action } from "~/routes/api.utils.planner.event-shop-states";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs(payload: unknown) {
  return {
    context: { cloudflare: { env, ctx } },
    request: new Request("https://mollulog.test/api/utils/planner/event-shop-states", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7 });
  mockGetEventMetadata.mockResolvedValue({ name: "Event", shopContentUid: "canonical-shop-1" });
  mockGetRecruitedStudents.mockResolvedValue([{ studentUid: "student-1" }]);
  mockGetEventShopContent.mockResolvedValue({
    stages: [{ uid: "stage-1", entryAp: 10, index: "9-1", difficulty: 1, rewards: [] }],
    shopResources: [
      {
        uid: "shop-item-1",
        resource: { uid: "item-1", name: "Shop Item" },
        paymentResource: { uid: "currency-1", name: "Event Token" },
        purchaseTiers: [{ paymentResource: { uid: "tier-currency-1", name: "Tier Token" } }],
      },
    ],
    eventRewardBonus: [
      {
        uid: "bonus-currency-1",
        name: "Bonus Token",
        rewardBonuses: [{ student: { uid: "student-1", name: "Student" } }],
      },
    ],
    minigameConfig: null,
  });
  mockGetEventShopStates.mockResolvedValue({ "canonical-shop-1": { itemQuantities: { "item-1": 1 } } });
});

describe("planner event shop state batch lookup", () => {
  it("returns a verified canonical account plan or an explicit empty account state", async () => {
    const result = await action(
      actionArgs({
        requestId: "request-1",
        events: [
          { timelineUid: "timeline-1", shopStateUid: "canonical-shop-1" },
          { timelineUid: "timeline-2", shopStateUid: "canonical-shop-1" },
        ],
      }),
    );

    expect(result).toMatchObject({
      success: true,
      requestId: "request-1",
      states: [
        {
          timelineUid: "timeline-1",
          shopStateUid: "canonical-shop-1",
          status: "available",
          eventName: "Event",
          displayCatalog: {
            shopItemNamesByUid: { "shop-item-1": "Shop Item" },
            resourceNamesByUid: {
              "item-1": "Shop Item",
              "currency-1": "Event Token",
              "tier-currency-1": "Tier Token",
              "bonus-currency-1": "Bonus Token",
            },
            bonusResourceNamesByUid: { "bonus-currency-1": "Bonus Token" },
            stageLabelsByUid: { "stage-1": "퀘스트 9-1" },
            sweepStageUids: ["stage-1"],
            studentNamesByUid: { "student-1": "Student" },
            hasMinigame: false,
          },
        },
        {
          timelineUid: "timeline-2",
          shopStateUid: "canonical-shop-1",
          status: "available",
          eventName: "Event",
          defaultState: createDefaultEventShopState(
            [{ uid: "stage-1", entryAp: 10, index: "9-1", difficulty: 1, rewards: [] }],
            ["student-1"],
          ),
        },
      ],
    });
    expect(mockGetEventShopStates).toHaveBeenCalledWith(env, 7, ["canonical-shop-1", "timeline-1", "timeline-2"], {
      ctx,
    });
  });

  it("marks unresolved or mismatched identities unavailable instead of treating them as guest-only", async () => {
    mockGetEventMetadata.mockImplementation(async (_env, uid) =>
      uid === "missing" ? null : { name: "Event", shopContentUid: "canonical-shop-1" },
    );

    const result = await action(
      actionArgs({
        events: [
          { timelineUid: "timeline-1", shopStateUid: "wrong-canonical-key" },
          { timelineUid: "missing", shopStateUid: "missing" },
        ],
      }),
    );

    expect(result).toMatchObject({
      success: true,
      states: [
        { timelineUid: "timeline-1", shopStateUid: "wrong-canonical-key", status: "unavailable" },
        { timelineUid: "missing", shopStateUid: "missing", status: "unavailable" },
      ],
    });
    expect(mockGetEventShopStates).not.toHaveBeenCalled();
  });

  it("marks the batch unavailable when account reads fail", async () => {
    mockGetEventShopStates.mockRejectedValue(new Error("database failure"));

    const result = await action(
      actionArgs({ events: [{ timelineUid: "timeline-1", shopStateUid: "canonical-shop-1" }] }),
    );

    expect(result).toMatchObject({
      success: true,
      states: [{ timelineUid: "timeline-1", shopStateUid: "canonical-shop-1", status: "unavailable" }],
    });
  });
});
