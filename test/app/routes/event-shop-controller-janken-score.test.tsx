/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { JankenPlannerEntry } from "~/domain/planner-state";

let mockLoaderData: unknown;
let mockGuestSnapshot: unknown;
const mockUseEventShopPlan = jest.fn<(input: unknown) => { plan: { jankenScore: unknown } }>();

jest.mock("react-router", () => ({
  Outlet: ({ context }: { context: { jankenScore: unknown } }) =>
    createElement("output", null, JSON.stringify(context.jankenScore)),
  useLoaderData: () => mockLoaderData,
  useRevalidator: () => ({ revalidate: jest.fn() }),
}));
jest.mock("~/components/v2/layout", () => ({ PageMain: ({ children }: { children: unknown }) => children }));
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

const shopData = (signedIn: boolean) => ({
  status: "ready",
  eventName: "Event",
  stages: [],
  shopResources: [],
  ownedQuantities: null,
  eventRewardBonus: [],
  minigameConfig: null,
  jankenStudentGrowthUid: null,
  recruitedStudentUids: [],
  savedShopState: null,
  savedJankenEntry: signedIn ? entry : null,
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
    plan: { jankenScore: (input as { jankenScore: unknown }).jankenScore },
  }));
});

describe("event shop janken score context", () => {
  it.each([true, false])("passes the saved score progress for %s signed-in", (signedIn) => {
    mockLoaderData = shopData(signedIn);

    render(createElement(EventShopController));

    expect(screen.getByText('{"currentScore":1200000,"averageScore":250000}')).toBeTruthy();
    expect(mockUseEventShopPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        jankenClearedStageUids: ["stage-1"],
        jankenScore: { currentScore: 1_200_000, averageScore: 250_000 },
      }),
    );
  });

  it("uses empty score progress when the planner has no saved entry", () => {
    mockLoaderData = { ...shopData(true), savedJankenEntry: null };

    render(createElement(EventShopController));

    expect(screen.getByText('{"currentScore":0,"averageScore":null}')).toBeTruthy();
  });

  it("accepts refreshed saved scores when the shop id is unchanged", () => {
    mockLoaderData = shopData(true);
    const view = render(createElement(EventShopController));

    mockLoaderData = { ...shopData(true), savedJankenEntry: entryWithAverageScore(1_000_000) };
    view.rerender(createElement(EventShopController));

    expect(screen.getByText('{"currentScore":1200000,"averageScore":1000000}')).toBeTruthy();
  });

  it("preserves a local score edit when saved scores refresh", () => {
    mockLoaderData = shopData(true);
    const view = render(createElement(EventShopController));
    const latestInput = mockUseEventShopPlan.mock.calls.at(-1)?.[0] as {
      setJankenScore: (score: { currentScore: number; averageScore: number | null }) => void;
    };

    act(() => latestInput.setJankenScore({ currentScore: 1_200_000, averageScore: 500_000 }));
    mockLoaderData = { ...shopData(true), savedJankenEntry: entryWithAverageScore(1_000_000) };
    view.rerender(createElement(EventShopController));

    expect(screen.getByText('{"currentScore":1200000,"averageScore":500000}')).toBeTruthy();
  });
});
