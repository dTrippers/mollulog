/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { evaluateJankenPlan } from "~/domain/event-shop/janken";
import type { GuestPlannerEnvelope } from "~/domain/guest-planner";
import type { MinigameConfig } from "~/domain/event-shop";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import type { GuestPlannerSnapshot } from "~/lib/guest-planner.client";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import JankenScreen from "~/routes/events.$uid._components/JankenScreen";
import { janken860Fixture } from "../domain/fixtures/janken-860";
import { createEventShopPlan } from "./event-shop-fixtures";

type FetcherData = {
  success?: boolean;
  conflict?: boolean;
  error?: string;
  entry?: JankenPlannerEntry;
  latest?: JankenPlannerEntry | null;
};

let mockPlan: EventShopPlanContext;
let mockStacked = false;
let mockFetcher: { state: string; data?: FetcherData; submit: jest.Mock };
let mockGuestEnvelope: GuestPlannerEnvelope;
const mockSubmit = jest.fn();
const mockReadGuestPlanner = jest.fn<() => GuestPlannerSnapshot>();
const mockUpdateGuestPlanner = jest.fn<
  (update: (current: GuestPlannerEnvelope) => GuestPlannerEnvelope) => Promise<GuestPlannerSnapshot>
>();

jest.mock("react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
  useFetcher: () => mockFetcher,
  useOutletContext: () => mockPlan,
}));
jest.mock("~/lib/guest-planner.client", () => ({
  readGuestPlanner: () => mockReadGuestPlanner(),
  updateGuestPlanner: (update: (current: GuestPlannerEnvelope) => GuestPlannerEnvelope) =>
    mockUpdateGuestPlanner(update),
}));
jest.mock("~/domain/event-shop/calculations/calculate-shop-ap", () => ({ calculateShopApRequirement: () => 0 }));
jest.mock("~/components/v2/features/events/ShopSection", () => ({
  ShopSection: ({ children, title, action }: { children: ReactNode; title: string; action?: ReactNode }) =>
    createElement("section", null, createElement("h2", null, title), action, children),
}));
jest.mock("~/components/v2/features/resources/ResourceThumb", () => ({
  ResourceThumb: ({ name }: { name: string }) => createElement("span", { "aria-label": name }),
}));
jest.mock("~/components/v2/layout", () => ({
  AsideLinks: () => null,
  PageActionBar: ({ children, summary }: { children: ReactNode; summary?: ReactNode }) =>
    createElement("div", null, summary, children),
  PageAside: ({ children }: { children: ReactNode }) => createElement("aside", null, children),
  PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  PanelSheet: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  useV2Page: () => ({ stacked: mockStacked, openSheet: jest.fn() }),
}));
jest.mock("~/components/v2/primitives/Button", () => ({
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) =>
    createElement("button", { type: "button", onClick, disabled }, children),
}));
jest.mock("~/components/v2/primitives/SectionTabs", () => ({
  SectionTabs: ({ items, selectedId, onChange }: { items: { id: string; label: string }[]; selectedId: string; onChange: (id: string) => void }) =>
    createElement(
      "div",
      null,
      ...items.map(({ id, label }) => createElement("button", { key: id, type: "button", "aria-pressed": selectedId === id, onClick: () => onChange(id) }, label)),
    ),
}));
jest.mock("~/components/v2/primitives/StatusNotice", () => ({
  StatusNotice: ({ children, action }: { children: ReactNode; action?: ReactNode }) =>
    createElement("div", { role: "alert" }, children, action),
}));
jest.mock("~/components/v2/primitives/Switch", () => ({
  Switch: ({ label, checked }: { label: string; checked: boolean }) => createElement("input", { type: "checkbox", "aria-label": label, checked, readOnly: true }),
}));
jest.mock("~/components/v2/primitives/ToggleChip", () => ({
  ToggleChip: ({ children, pressed, ariaLabel, onPressedChange }: { children: ReactNode; pressed: boolean; ariaLabel: string; onPressedChange: () => void }) =>
    createElement("button", { type: "button", "aria-label": ariaLabel, "aria-pressed": pressed, onClick: onPressedChange }, children),
}));

function makeEntry(clearedStageUids: string[] = []): JankenPlannerEntry {
  return {
    progress: {
      currentTier: 1,
      heldEleph: 0,
      cumulativeScore: 0,
      equipmentTier: 1,
      heldEquipmentCurrency: 0,
      clearedStageUids,
    },
    goals: {
      targetTier: null,
      shopCurrencyMode: "linked",
      manualShopCurrency: 0,
      targetScore: null,
      averageScore: null,
      targetEquipmentTier: null,
    },
  };
}

function makeScoreTargetEntry(): JankenPlannerEntry {
  const entry = makeEntry();
  return {
    ...entry,
    goals: { ...entry.goals, targetScore: 1_000_000, averageScore: 250_000 },
  };
}

const loaderData = (
  entry: JankenPlannerEntry | null,
  studentGrowthUid: string | null = null,
  signedIn = true,
) => ({
  eventUid: "event-1",
  eventName: "Event",
  shopStateUid: "shop-1",
  signedIn,
  entry,
  config: janken860Fixture,
  studentGrowthUid,
  recruitedStudent: false,
  inventoryDate: "11월 4일",
  defaultProgress: { currentTier: 1, heldEleph: 0 },
});

function renderScreen(
  entry: JankenPlannerEntry | null = null,
  studentGrowthUid: string | null = null,
  signedIn = true,
) {
  return render(createElement(JankenScreen, { loaderData: loaderData(entry, studentGrowthUid, signedIn) as never }));
}

function guestSnapshot(envelope: GuestPlannerEnvelope): GuestPlannerSnapshot {
  return { status: "ready", envelope, legacySources: {} } as GuestPlannerSnapshot;
}

beforeEach(() => {
  const empty = createEventShopPlan();
  const config: MinigameConfig = {
    minigameType: "janken",
    payment: { resourceType: "ITEM" as never, resourceUid: "80860", quantity: 400 },
    payments: [],
    rewardGroups: [],
    janken: janken860Fixture,
  };
  mockPlan = {
    ...empty,
    shopResources: [
      {
        uid: "janken-shop-item",
        resource: { type: "ITEM", uid: "shop-item", name: "item", rarity: 1 },
        resourceAmount: 1,
        paymentResource: { type: "ITEM", uid: "80863", name: "shop currency" },
        purchaseTiers: [
          {
            tierIndex: 0,
            startQuantity: 1,
            quantity: null,
            unitPrice: 1,
            paymentResource: { type: "ITEM", uid: "80863", name: "shop currency" },
          },
        ],
        shopAmount: null,
      } as never,
    ],
    minigameConfig: config,
    minigameConfigForCalculations: config,
    setJankenClearedStageUids: (uids) => {
      mockPlan = { ...mockPlan, jankenClearedStageUids: uids };
    },
    setJankenScore: (jankenScore) => {
      mockPlan = { ...mockPlan, jankenScore };
    },
  };
  mockGuestEnvelope = { document: { jankenProgress: {} } } as unknown as GuestPlannerEnvelope;
  mockStacked = false;
  mockSubmit.mockClear();
  mockReadGuestPlanner.mockClear();
  mockReadGuestPlanner.mockReturnValue(guestSnapshot(mockGuestEnvelope));
  mockUpdateGuestPlanner.mockClear();
  mockUpdateGuestPlanner.mockImplementation(async (update) => {
    mockGuestEnvelope = update(mockGuestEnvelope);
    return guestSnapshot(mockGuestEnvelope);
  });
  mockFetcher = { state: "idle", data: undefined, submit: mockSubmit };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("janken planner screen", () => {
  it("distinguishes current and goal tier chip accessible names", () => {
    renderScreen(null, "26016");

    expect(screen.getByRole("button", { name: "현재 등급 1성" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "목표 등급 3성" })).toBeTruthy();
  });

  it("submits a reordered cleared-stage set only once after server normalization", () => {
    jest.useFakeTimers();
    const view = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "스토리 2 클리어" }));
    fireEvent.click(screen.getByRole("button", { name: "스토리 1 클리어" }));
    act(() => jest.advanceTimersByTime(800));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const request = mockSubmit.mock.calls[0]?.[0] as { entry: JankenPlannerEntry };
    expect(request.entry.progress.clearedStageUids).toEqual(["100860102", "100860101"]);
    const normalized = makeEntry(["100860101", "100860102"]);
    mockFetcher = { ...mockFetcher, data: { success: true, entry: normalized } };
    view.rerender(createElement(JankenScreen, { loaderData: loaderData(null) as never }));
    act(() => jest.advanceTimersByTime(1_000));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it("uses the latest score progress in the shop after loading a conflict", () => {
    jest.useFakeTimers();
    const latest = {
      ...makeEntry(janken860Fixture.stages.map(({ uid }) => uid)),
      progress: { ...makeEntry().progress, cumulativeScore: 1_000_000, clearedStageUids: janken860Fixture.stages.map(({ uid }) => uid) },
      goals: { ...makeEntry().goals, averageScore: 1_000_000 },
    };
    mockFetcher = { ...mockFetcher, data: { conflict: true, error: "conflict", latest } };
    renderScreen(makeEntry());

    expect(screen.getByRole("button", { name: "최신 값 불러오기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "최신 값 불러오기" }));

    expect(screen.queryByRole("button", { name: "최신 값 불러오기" })).toBeNull();
    expect(mockPlan.jankenScore).toEqual({ currentScore: 1_000_000, averageScore: 1_000_000 });
    expect(
      evaluateJankenPlan(janken860Fixture, {
        stagePlays: { "100860301": 1 },
        clearedStageUids: mockPlan.jankenClearedStageUids,
        ...mockPlan.jankenScore,
      }).rewards["26016"],
    ).toBe(21.3);
    fireEvent.click(screen.getByRole("button", { name: "스토리 2 클리어" }));
    act(() => jest.advanceTimersByTime(800));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it("saves the edited average before applying plays for a signed-in user", async () => {
    jest.useFakeTimers();
    const setJankenStagePlays = jest.fn();
    mockPlan = {
      ...mockPlan,
      actions: { ...mockPlan.actions, setJankenStagePlays },
    };
    const view = renderScreen(makeScoreTargetEntry());
    fireEvent.change(screen.getByRole("spinbutton", { name: "1회 평균 스코어" }), {
      target: { value: "500000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "상점 계산기에 적용" }));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const submission = mockSubmit.mock.calls[0]?.[0] as { entry: JankenPlannerEntry };
    expect(submission.entry.goals.averageScore).toBe(500_000);
    expect(setJankenStagePlays).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "1회 평균 스코어" }), {
      target: { value: "1000000" },
    });

    await act(async () => {
      mockFetcher = { ...mockFetcher, data: { success: true, entry: submission.entry } };
      view.rerender(createElement(JankenScreen, { loaderData: loaderData(makeScoreTargetEntry()) as never }));
      await Promise.resolve();
    });

    expect(mockPlan.jankenScore).toEqual({ currentScore: 0, averageScore: 1_000_000 });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(setJankenStagePlays).toHaveBeenCalledTimes(1);
    expect(setJankenStagePlays.mock.calls[0]?.[0]).toMatchObject({ "100860301": 2 });
    expect(screen.getByRole("button", { name: "상점 계산기에 적용" })).toBeTruthy();
  });

  it("saves the edited average before applying plays for a guest", async () => {
    jest.useFakeTimers();
    const entry = makeScoreTargetEntry();
    mockGuestEnvelope = { document: { jankenProgress: { "shop-1": entry } } } as unknown as GuestPlannerEnvelope;
    mockReadGuestPlanner.mockReturnValue(guestSnapshot(mockGuestEnvelope));
    const setJankenStagePlays = jest.fn();
    mockPlan = {
      ...mockPlan,
      actions: { ...mockPlan.actions, setJankenStagePlays },
    };
    let resolveSave!: (snapshot: GuestPlannerSnapshot) => void;
    let savedEnvelope!: GuestPlannerEnvelope;
    mockUpdateGuestPlanner.mockImplementationOnce((update) => {
      savedEnvelope = update(mockGuestEnvelope);
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    });
    renderScreen(entry, null, false);
    fireEvent.change(screen.getByRole("spinbutton", { name: "1회 평균 스코어" }), {
      target: { value: "500000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "상점 계산기에 적용" }));
    expect(mockUpdateGuestPlanner).toHaveBeenCalledTimes(1);
    expect(setJankenStagePlays).not.toHaveBeenCalled();
    await act(async () => {
      mockGuestEnvelope = savedEnvelope;
      resolveSave(guestSnapshot(savedEnvelope));
      await Promise.resolve();
    });

    expect(mockUpdateGuestPlanner).toHaveBeenCalledTimes(1);
    expect(mockGuestEnvelope.document.jankenProgress["shop-1"]?.goals.averageScore).toBe(500_000);
    expect(mockPlan.jankenScore).toEqual({ currentScore: 0, averageScore: 500_000 });
    expect(setJankenStagePlays).toHaveBeenCalledTimes(1);
    expect(setJankenStagePlays.mock.calls[0]?.[0]).toMatchObject({ "100860301": 2 });
  });

  it("does not apply guest plays after unmount or queue a duplicate autosave", async () => {
    jest.useFakeTimers();
    const entry = makeScoreTargetEntry();
    mockGuestEnvelope = { document: { jankenProgress: { "shop-1": entry } } } as unknown as GuestPlannerEnvelope;
    mockReadGuestPlanner.mockReturnValue(guestSnapshot(mockGuestEnvelope));
    const setJankenStagePlays = jest.fn();
    mockPlan = {
      ...mockPlan,
      actions: { ...mockPlan.actions, setJankenStagePlays },
    };
    let resolveSave!: (snapshot: GuestPlannerSnapshot) => void;
    let savedEnvelope!: GuestPlannerEnvelope;
    mockUpdateGuestPlanner.mockImplementationOnce((update) => {
      savedEnvelope = update(mockGuestEnvelope);
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    });
    const view = renderScreen(entry, null, false);
    fireEvent.change(screen.getByRole("spinbutton", { name: "1회 평균 스코어" }), {
      target: { value: "500000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "상점 계산기에 적용" }));
    expect(mockUpdateGuestPlanner).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1_000));
    expect(mockUpdateGuestPlanner).toHaveBeenCalledTimes(1);

    view.unmount();
    const shopPlays = { "100860301": 7 };
    mockPlan = { ...mockPlan, state: { ...mockPlan.state, jankenStagePlays: shopPlays } };
    await act(async () => {
      mockGuestEnvelope = savedEnvelope;
      resolveSave(guestSnapshot(savedEnvelope));
      await Promise.resolve();
    });

    expect(setJankenStagePlays).not.toHaveBeenCalled();
    expect(mockPlan.state.jankenStagePlays).toEqual(shopPlays);
    expect(mockGuestEnvelope.document.jankenProgress["shop-1"]?.goals.averageScore).toBe(500_000);
  });

  it("does not apply signed-in plays after unmount during the save response", async () => {
    jest.useFakeTimers();
    const setJankenStagePlays = jest.fn();
    mockPlan = {
      ...mockPlan,
      actions: { ...mockPlan.actions, setJankenStagePlays },
    };
    const view = renderScreen(makeScoreTargetEntry());
    fireEvent.change(screen.getByRole("spinbutton", { name: "1회 평균 스코어" }), {
      target: { value: "500000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "상점 계산기에 적용" }));
    const submission = mockSubmit.mock.calls[0]?.[0] as { entry: JankenPlannerEntry };

    act(() => {
      mockFetcher = { ...mockFetcher, data: { success: true, entry: submission.entry } };
      view.rerender(createElement(JankenScreen, { loaderData: loaderData(makeScoreTargetEntry()) as never }));
      view.unmount();
    });
    const shopPlays = { "100860301": 7 };
    mockPlan = { ...mockPlan, state: { ...mockPlan.state, jankenStagePlays: shopPlays } };
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setJankenStagePlays).not.toHaveBeenCalled();
    expect(mockPlan.state.jankenStagePlays).toEqual(shopPlays);
  });

  it("follows the desktop or mobile default tab until the user selects a tab", () => {
    const view = renderScreen();
    expect(screen.getByRole("button", { name: "효율 비교" }).getAttribute("aria-pressed")).toBe("true");

    mockStacked = true;
    view.rerender(createElement(JankenScreen, { loaderData: loaderData(null) as never }));
    expect(screen.getByRole("button", { name: "누적 스코어 보상" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "장비 강화" }));
    mockStacked = false;
    view.rerender(createElement(JankenScreen, { loaderData: loaderData(null) as never }));
    expect(screen.getByRole("button", { name: "장비 강화" }).getAttribute("aria-pressed")).toBe("true");
  });
});
