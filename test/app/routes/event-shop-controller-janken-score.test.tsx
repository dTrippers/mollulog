/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { JankenPlannerEntry } from "~/domain/planner-state";

let mockLoaderData: unknown;
let mockGuestSnapshot: unknown;
const mockFetcherSubmit = jest.fn();
const mockUseEventShopPlan = jest.fn<(input: unknown) => { plan: { jankenEntry: unknown } }>();

jest.mock("react-router", () => ({
  Outlet: ({ context }: { context: { jankenEntry: unknown } }) =>
    createElement("output", null, JSON.stringify(context.jankenEntry)),
  useLoaderData: () => mockLoaderData,
  useRevalidator: () => ({ revalidate: jest.fn() }),
  useFetcher: () => ({ state: "idle", data: undefined, submit: mockFetcherSubmit }),
}));
jest.mock("~/components/v2/layout", () => ({
  PageMain: ({ children }: { children: unknown }) => children,
  useV2Page: () => ({ stacked: false }),
}));
jest.mock("~/components/v2/primitives/Button", () => ({ Button: () => null }));
jest.mock("~/components/v2/primitives/Skeleton", () => ({ Skeleton: () => null }));
jest.mock("~/components/v2/primitives/StatusNotice", () => ({ StatusNotice: () => null }));
jest.mock("~/domain/guest-planner", () => ({ guestPlannerEventShopPlans: () => [] }));
jest.mock("~/lib/event-shop/useEventShopPlan", () => ({
  useEventShopPlan: (input: unknown) => mockUseEventShopPlan(input),
}));
jest.mock("~/lib/guest-planner.client", () => ({
  readGuestPlanner: () => mockGuestSnapshot,
  subscribeGuestPlanner: () => () => undefined,
}));

import EventShopController from "~/routes/events.$uid._components/EventShopController";

const entry: JankenPlannerEntry = {
  progress: {
    currentTier: 1,
    heldEleph: 0,
    cumulativeScore: 1_200_000,
    equipmentTier: 1,
    heldEquipmentCurrency: 0,
    clearedStageUids: ["stage-1"],
  },
  goals: {
    targetTier: null,
    shopCurrencyMode: "linked",
    manualShopCurrency: 0,
    targetScore: null,
    averageScore: 250_000,
    targetEquipmentTier: null,
  },
};

const entryWithAverageScore = (averageScore: number): JankenPlannerEntry => ({
  ...entry,
  goals: { ...entry.goals, averageScore },
});

const shopData = (signedIn: boolean, savedJankenEntry: JankenPlannerEntry | null = entry) => ({
  status: "ready",
  stages: [],
  shopResources: [],
  ownedQuantities: null,
  eventRewardBonus: [],
  minigameConfig: null,
  jankenStudentGrowthUid: null,
  recruitedStudentUids: [],
  savedShopState: null,
  savedJankenEntry: signedIn ? savedJankenEntry : null,
  jankenDefaultProgress: { currentTier: 2, heldEleph: 9 },
  savedShopStateSource: "none",
  availablePurchaseDays: 1,
  eventUid: "event-1",
  shopStateUid: "shop-1",
  signedIn,
});

beforeEach(() => {
  mockLoaderData = shopData(true);
  mockGuestSnapshot = {
    status: "ready",
    envelope: { document: { jankenProgress: { "shop-1": entry } } },
  };
  mockUseEventShopPlan.mockImplementation((input) => ({
    plan: { jankenEntry: (input as { jankenEntry: unknown }).jankenEntry },
  }));
});

describe("event shop janken entry context", () => {
  it.each([true, false])("uses the saved full planner entry for %s signed-in", (signedIn) => {
    mockLoaderData = shopData(signedIn);

    render(createElement(EventShopController));

    expect(screen.getByText(JSON.stringify(entry))).toBeTruthy();
    expect(mockUseEventShopPlan).toHaveBeenCalledWith(expect.objectContaining({
      savedJankenEntry: entry,
      jankenEntry: entry,
      jankenDefaultProgress: { currentTier: 2, heldEleph: 9 },
    }));
  });

  it("uses the parent loader defaults when there is no saved entry", () => {
    mockLoaderData = shopData(true, null);

    render(createElement(EventShopController));

    expect(mockUseEventShopPlan).toHaveBeenCalledWith(expect.objectContaining({ savedJankenEntry: null }));
    expect(screen.getByText(JSON.stringify({
      progress: {
        currentTier: 2,
        heldEleph: 9,
        cumulativeScore: 0,
        equipmentTier: 1,
        heldEquipmentCurrency: 0,
        clearedStageUids: [],
      },
      goals: {
        targetTier: null,
        shopCurrencyMode: "linked",
        manualShopCurrency: 0,
        targetScore: null,
        averageScore: null,
        targetEquipmentTier: null,
      },
    }))).toBeTruthy();
  });

  it("accepts refreshed saved entries when the shop id is unchanged", () => {
    mockLoaderData = shopData(true);
    const view = render(createElement(EventShopController));

    mockLoaderData = { ...shopData(true), savedJankenEntry: entryWithAverageScore(1_000_000) };
    view.rerender(createElement(EventShopController));

    expect(screen.getByText(JSON.stringify(entryWithAverageScore(1_000_000)))).toBeTruthy();
  });

  it("preserves unsaved local entry edits when saved data refreshes", () => {
    mockLoaderData = shopData(true);
    const view = render(createElement(EventShopController));
    const latestInput = mockUseEventShopPlan.mock.calls.at(-1)?.[0] as {
      setJankenEntry: (next: JankenPlannerEntry) => void;
    };
    const localEdit = entryWithAverageScore(500_000);

    act(() => latestInput.setJankenEntry(localEdit));
    mockLoaderData = { ...shopData(true), savedJankenEntry: entryWithAverageScore(1_000_000) };
    view.rerender(createElement(EventShopController));

    expect(screen.getByText(JSON.stringify(localEdit))).toBeTruthy();
  });
});
