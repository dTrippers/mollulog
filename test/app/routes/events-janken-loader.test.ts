import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<{ id: number } | null>>();
const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventMinigameType = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockGetEventShopContent = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPlannerState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAllStudents = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockGetUserResourceInventoryMapByItemUids = jest.fn<(...args: unknown[]) => Promise<Record<string, number>>>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/event-content", () => ({
  getEventMetadata: mockGetEventMetadata,
  getEventMinigameType: mockGetEventMinigameType,
  getEventShopContent: mockGetEventShopContent,
}));
jest.mock("~/models/planner-state", () => ({ getPlannerState: mockGetPlannerState }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/student", () => ({ getAllStudents: mockGetAllStudents }));
jest.mock("~/models/user-resource-inventory", () => ({
  getUserResourceInventoryMapByItemUids: mockGetUserResourceInventoryMapByItemUids,
}));
jest.mock("~/routes/events.$uid._components/JankenScreen", () => ({ default: () => null }));

import { loader } from "~/routes/events.$uid.shop.janken";

const env = {} as Env;
const ctx = {} as ExecutionContext;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockGetEventMetadata.mockResolvedValue({ name: "Event", contentType: "event", shopContentUid: "shop-1" });
  mockGetEventMinigameType.mockResolvedValue("janken");
});

describe("janken planner child loader", () => {
  it("leaves saved progress and defaults to the shop parent context", async () => {
    const result = await loader({
      params: { uid: "event-1" },
      context: { cloudflare: { env, ctx } },
      request: new Request("https://mollulog.test/events/event-1/shop/janken"),
    } as never);

    expect(result).toMatchObject({ eventUid: "event-1", eventName: "Event", signedIn: true });
    expect(mockGetEventShopContent).not.toHaveBeenCalled();
    expect(mockGetPlannerState).not.toHaveBeenCalled();
    expect(mockGetAllStudents).not.toHaveBeenCalled();
    expect(mockGetRecruitedStudents).not.toHaveBeenCalled();
    expect(mockGetUserResourceInventoryMapByItemUids).not.toHaveBeenCalled();
  });
});
