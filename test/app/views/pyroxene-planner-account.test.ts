import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PyroxenePlannerContent } from "~/views/pyroxene";

const mockGetUserFavoritedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPyroxeneUserState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentResults = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserResourceInventory = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/favorite-students", () => ({ getUserFavoritedStudents: mockGetUserFavoritedStudents }));
jest.mock("~/models/pyroxene-planner", () => ({ getPyroxeneUserState: mockGetPyroxeneUserState }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/recruitment-result.server", () => ({
  getRecruitmentResultsByRecruitmentGroupUids: mockGetRecruitmentResults,
}));
jest.mock("~/models/user-resource-inventory", () => ({
  getUserResourceInventoryMapByItemUids: mockGetUserResourceInventory,
}));

import { loadPyroxenePlannerAccount } from "~/views/pyroxene-planner-account";

const env = {} as Env;

function pickup(uid: string, isPickup = true) {
  return {
    recruitmentType: "usual",
    pickup: isPickup,
    rerun: true,
    until: null,
    student: { uid, imageUid: null, name: uid, initialTier: 3, acquisitionType: "regular" },
  };
}

const event = {
  kind: "event",
  uid: "event-1",
  recruitmentGroupUid: null,
  name: "Event",
  since: "2027-01-26T02:00:00.000Z",
  until: "2027-02-09T02:00:00.000Z",
  earnablePyroxene: null,
  tags: [],
  recruitmentRuleSet: "call_charge_v1",
  recruitments: [pickup("favorited"), pickup("addable"), pickup("not-pickup", false)],
} as unknown as PyroxenePlannerContent;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserFavoritedStudents.mockResolvedValue([{ contentId: "event-1", studentId: "favorited" }]);
  mockGetPyroxeneUserState.mockResolvedValue({
    latestResources: null,
    timelineItems: [],
    options: null,
    eventData: [],
    collectedSourceKeys: new Set(),
  });
  mockGetRecruitmentResults.mockResolvedValue([]);
  mockGetRecruitedStudents.mockResolvedValue([
    { studentUid: "favorited", tier: 4 },
    { studentUid: "addable", tier: 4 },
    { studentUid: "not-pickup", tier: 5 },
  ]);
  mockGetUserResourceInventory.mockResolvedValue({ addable: 30 });
});

describe("loadPyroxenePlannerAccount", () => {
  it("reads the owned state of every scheduled pickup, not only the current favorites", async () => {
    const account = await loadPyroxenePlannerAccount(env, 1, [event]);

    expect(mockGetUserResourceInventory).toHaveBeenCalledWith(env, 1, ["favorited", "addable"]);
    expect(account.recruitmentOwnedSnapshot.states).toEqual({
      favorited: { tier: 4, eleph: 0 },
      addable: { tier: 4, eleph: 30 },
    });
  });

  it("fails when held eleph cannot be read instead of planning every target as unowned", async () => {
    mockGetUserResourceInventory.mockRejectedValue(new Error("read failed"));

    await expect(loadPyroxenePlannerAccount(env, 1, [event])).rejects.toThrow("read failed");
  });
});
