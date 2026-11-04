/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { MinigameConfig } from "~/domain/event-shop";
import type { JankenPlannerEntry } from "~/domain/planner-state";
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
const mockSubmit = jest.fn();

jest.mock("react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
  useFetcher: () => mockFetcher,
  useOutletContext: () => mockPlan,
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

const loaderData = (entry: JankenPlannerEntry | null) => ({
  eventUid: "event-1",
  eventName: "Event",
  shopStateUid: "shop-1",
  signedIn: true,
  entry,
  config: janken860Fixture,
  studentGrowthUid: null,
  recruitedStudent: false,
  inventoryDate: "11월 4일",
  defaultProgress: { currentTier: 1, heldEleph: 0 },
});

function renderScreen(entry: JankenPlannerEntry | null = null) {
  return render(createElement(JankenScreen, { loaderData: loaderData(entry) as never }));
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
    minigameConfig: config,
    minigameConfigForCalculations: config,
    setJankenClearedStageUids: (uids) => {
      mockPlan = { ...mockPlan, jankenClearedStageUids: uids };
    },
  };
  mockStacked = false;
  mockSubmit.mockClear();
  mockFetcher = { state: "idle", data: undefined, submit: mockSubmit };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("janken planner screen", () => {
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

  it("clears a handled conflict after loading latest and autosaves the next edit", () => {
    jest.useFakeTimers();
    const latest = makeEntry(["100860101"]);
    mockFetcher = { ...mockFetcher, data: { conflict: true, error: "conflict", latest } };
    renderScreen(makeEntry());

    expect(screen.getByRole("button", { name: "최신 값 불러오기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "최신 값 불러오기" }));

    expect(screen.queryByRole("button", { name: "최신 값 불러오기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "스토리 2 클리어" }));
    act(() => jest.advanceTimersByTime(800));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
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
