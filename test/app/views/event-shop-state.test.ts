import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopContent = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPatchEventShopStateOwnedQuantities = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/event-content", () => ({
  getEventMetadata: mockGetEventMetadata,
  getEventShopContent: mockGetEventShopContent,
}));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/event-shop-state", () => ({
  patchEventShopStateOwnedQuantities: mockPatchEventShopStateOwnedQuantities,
}));

import { updateEventShopOwnedQuantities } from "~/views/event-shop-state";

const env = {} as Env;
const ctx = {} as ExecutionContext;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEventMetadata.mockResolvedValue({
    name: "Event",
    contentType: "event",
    runType: "first",
    since: "2026-09-01T00:00:00.000Z",
    until: "2026-09-30T00:00:00.000Z",
    contentUid: "content-1",
    shopContentUid: "canonical-shop-1",
  });
  mockGetEventShopContent.mockResolvedValue({
    stages: [{ uid: "stage-9", entryAp: 20, index: "9", difficulty: 1, rewards: [] }],
    shopResources: [
      {
        uid: "shop-item-1",
        paymentResource: { uid: "currency-1" },
        purchaseTiers: [{ tierIndex: 1, paymentResource: { uid: "currency-2" } }],
      },
    ],
    eventRewardBonus: [],
    minigameConfig: {
      payment: { resourceUid: "currency-3" },
      payments: [],
      rewardGroups: [{ payments: [{ resourceUid: "currency-4" }] }],
    },
  });
  mockGetRecruitedStudents.mockResolvedValue([{ studentUid: "student-1" }]);
  mockPatchEventShopStateOwnedQuantities.mockResolvedValue(undefined);
});

describe("event shop owned quantities view", () => {
  it("resolves canonical shop identity and seeds the detailed planner defaults", async () => {
    await expect(
      updateEventShopOwnedQuantities(env, 7, "timeline-1", { "currency-1": 0, "currency-4": 25 }, ctx),
    ).resolves.toEqual({ status: "saved" });

    expect(mockPatchEventShopStateOwnedQuantities).toHaveBeenCalledWith(
      env,
      7,
      "canonical-shop-1",
      { "currency-1": 0, "currency-4": 25 },
      expect.objectContaining({
        selectedBonusStudentUids: ["student-1"],
        enabledStages: { "stage-9": true },
      }),
      { ctx },
    );
  });

  it("rejects currencies outside the event's payment resources", async () => {
    await expect(updateEventShopOwnedQuantities(env, 7, "timeline-1", { "unknown-currency": 1 }, ctx)).resolves.toEqual(
      { status: "currency-unavailable" },
    );
    expect(mockPatchEventShopStateOwnedQuantities).not.toHaveBeenCalled();
  });

  it("does not save against a fallback timeline identity when event metadata is missing", async () => {
    mockGetEventMetadata.mockResolvedValueOnce(null);

    await expect(updateEventShopOwnedQuantities(env, 7, "timeline-1", { "currency-1": 1 }, ctx)).resolves.toEqual({
      status: "event-unavailable",
    });
    expect(mockGetEventShopContent).not.toHaveBeenCalled();
    expect(mockPatchEventShopStateOwnedQuantities).not.toHaveBeenCalled();
  });
});
