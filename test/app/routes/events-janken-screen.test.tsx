/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { deriveJankenPlan } from "~/domain/event-shop/janken";
import type { MinigameConfig } from "~/domain/event-shop";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import JankenScreen from "~/routes/events.$uid._components/JankenScreen";
import { janken860Fixture } from "../domain/fixtures/janken-860";
import { createEventShopPlan } from "./event-shop-fixtures";

let mockPlan: EventShopPlanContext;
let mockStacked = false;

jest.mock("react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
  useOutletContext: () => mockPlan,
}));
jest.mock("~/components/v2/features/resources/ResourceThumb", () => ({
  ResourceThumb: ({ name }: { name: string }) => createElement("span", { "aria-label": name }),
  resourceThumbImageSrc: () => "/thumb.png",
}));
jest.mock("~/components/v2/layout", () => ({
  MobileActionBar: ({ leading }: { leading?: ReactNode }) =>
    createElement("div", { "data-testid": "mobile-action-bar" }, leading),
  PageAside: ({ children }: { children: ReactNode }) => createElement("aside", null, children),
  PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  PanelSheet: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  useV2Page: () => ({ stacked: mockStacked, openSheet: jest.fn(), sheetPanelId: null }),
}));
jest.mock("~/components/v2/primitives/SectionTabs", () => ({
  SectionTabs: ({ items, selectedId, onChange }: {
    items: { id: string; label: string }[];
    selectedId: string;
    onChange: (id: string) => void;
  }) => createElement(
    "div",
    null,
    ...items.map(({ id, label }) => createElement(
      "button",
      { key: id, type: "button", "aria-pressed": selectedId === id, onClick: () => onChange(id) },
      label,
    )),
  ),
}));
jest.mock("~/components/v2/primitives/StatusNotice", () => ({
  StatusNotice: ({ children, action }: { children: ReactNode; action?: ReactNode }) =>
    createElement("div", { role: "alert" }, children, action),
}));
jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));

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

function entryWithScoreTarget(averageScore: number | null): JankenPlannerEntry {
  const entry = makeEntry();
  return { ...entry, goals: { ...entry.goals, targetScore: 1_000_000, averageScore } };
}

const loaderData = { inventoryDate: "11월 4일" };
const studentGrowthUid = "26016";
const config: MinigameConfig = {
  minigameType: "janken",
  payment: { resourceType: "ITEM" as never, resourceUid: "80860", quantity: 400 },
  payments: [],
  rewardGroups: [],
  janken: janken860Fixture,
};

function renderScreen() {
  return render(createElement(JankenScreen, { loaderData: loaderData as never }));
}

function setSharedEntry(entry: JankenPlannerEntry) {
  mockPlan = {
    ...mockPlan,
    jankenEntry: entry,
    jankenPlan: deriveJankenPlan(janken860Fixture, entry, mockPlan.jankenDefaultProgress, {
      shopCurrencyRequired: mockPlan.jankenShopCurrency.required,
      shopCurrencyResourceUid: mockPlan.jankenShopCurrency.uid ?? undefined,
      studentGrowthResourceUid: studentGrowthUid,
    }),
  };
}

beforeEach(() => {
  const entry = makeEntry();
  const empty = createEventShopPlan();
  mockPlan = {
    ...empty,
    shopStateUid: "shop-1",
    signedIn: true,
    shopResources: [{ paymentResource: { uid: "80863", type: "ITEM", name: "currency" } } as never],
    minigameConfig: config,
    minigameConfigForCalculations: config,
    jankenStudentGrowthUid: studentGrowthUid,
    jankenDefaultProgress: { currentTier: 1, heldEleph: 0 },
    jankenEntry: entry,
    setJankenEntry: setSharedEntry,
    jankenPlan: deriveJankenPlan(janken860Fixture, entry, { currentTier: 1, heldEleph: 0 }, {
      shopCurrencyRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: studentGrowthUid,
    }),
  };
  mockStacked = false;
});

describe("janken planner screen", () => {
  it("distinguishes current and goal tier pickers", () => {
    renderScreen();

    const current = screen.getByRole("group", { name: "현재 성급" });
    const goal = screen.getByRole("group", { name: "목표 성급" });
    expect(within(current).getByRole("button", { name: "1성" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(goal).getByRole("button", { name: "없음" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(goal).getByRole("button", { name: "3성" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(goal).getByRole("button", { name: "고유무기 1" })).toBeTruthy();
  });

  it("edits the shared planner entry, including cleared stages", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "스토리 1 클리어" }));
    fireEvent.change(screen.getByRole("textbox", { name: "현재 챌린지 누적 스코어" }), {
      target: { value: "500,000" },
    });

    expect(mockPlan.jankenEntry.progress.clearedStageUids).toEqual(["100860101"]);
    expect(mockPlan.jankenEntry.progress.cumulativeScore).toBe(500_000);
  });

  it("shows the missing-average state when a score goal has no average", () => {
    const entry = entryWithScoreTarget(null);
    setSharedEntry(entry);
    mockPlan = { ...mockPlan, savedJankenEntry: entry };
    renderScreen();

    expect(screen.getByRole("alert").textContent).toContain("1회 평균 스코어를 입력해 주세요.");
    expect(screen.getByText("1회 평균 필요")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "1회 평균 스코어" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("hides the average score input until a score goal is selected", () => {
    const view = renderScreen();

    expect(screen.queryByRole("textbox", { name: "1회 평균 스코어" })).toBeNull();

    const select = screen.getByRole("combobox", { name: "목표 스코어" });
    const preset = [...select.querySelectorAll("option")].find((option) => /만 · .*단계/.test(option.textContent ?? ""));
    if (!preset) throw new Error("Expected a challenge score preset.");
    fireEvent.change(select, { target: { value: preset.value } });
    view.rerender(createElement(JankenScreen, { loaderData: loaderData as never }));

    expect(screen.getByRole("textbox", { name: "1회 평균 스코어" })).toBeTruthy();
  });

  it("shows the remaining score in 만 units on the score goal", () => {
    const entry = {
      ...entryWithScoreTarget(100_000),
      goals: { ...entryWithScoreTarget(100_000).goals, targetScore: 2_250_000 },
    };
    setSharedEntry(entry);
    renderScreen();

    expect(screen.getByText("225만 점 부족")).toBeTruthy();
  });

  it("keeps goal cards without the extra progress summary lines", () => {
    const entry = {
      ...makeEntry(),
      progress: {
        ...makeEntry().progress,
        currentTier: 3,
        heldEleph: 45,
        cumulativeScore: 1_750_000,
        equipmentTier: 1,
        heldEquipmentCurrency: 40,
      },
      goals: {
        ...makeEntry().goals,
        targetTier: 6,
        targetScore: 1_750_000,
        averageScore: 100_000,
        targetEquipmentTier: 5,
      },
    };
    setSharedEntry(entry);
    mockPlan = { ...mockPlan, jankenShopCurrency: { uid: "80863", required: 560, total: 600, owned: 40 } };
    const { container } = renderScreen();

    expect(container.querySelector('[data-region="goal-equip"]')).not.toBeNull();
    expect(container.textContent).not.toContain("현재 3성에서 220개 · 보유 45개");
    expect(container.textContent).not.toContain("상점 계산기에서 고른 아이템 기준");
    expect(container.textContent).not.toContain("현재 175만 점");
    expect(container.textContent).not.toContain("필요 600개 · 보유 40개 · 남은 개수 560");
    expect(container.textContent).not.toContain("남은 스코어 0만");
  });

  it("shows pending AP instead of a zero placeholder until the shop calculation matches", () => {
    const entry = entryWithScoreTarget(100_000);
    setSharedEntry(entry);
    mockPlan = {
      ...mockPlan,
      isCalculating: true,
      stageCalculations: { ...mockPlan.stageCalculations, totalApWithExtras: 0 },
    };
    const view = renderScreen();

    expect(view.container.textContent?.match(/계산 중…/g)).toHaveLength(1);
    expect(view.container.textContent).not.toContain("약 0");
    expect(screen.queryByTestId("mobile-action-bar")).toBeNull();

    mockStacked = true;
    view.rerender(createElement(JankenScreen, { loaderData: loaderData as never }));
    expect(screen.getByTestId("mobile-action-bar").textContent).toContain("AP 계산 중…");
    expect(view.container.textContent?.match(/계산 중…/g)).toHaveLength(2);
    expect(view.container.textContent).not.toContain("약 0");
  });

  it("follows desktop and mobile reference tab defaults until the user selects a tab", () => {
    const view = renderScreen();
    expect(screen.queryByRole("button", { name: "효율 비교" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "펼치기" }));
    expect(screen.getByRole("button", { name: "효율 비교" }).getAttribute("aria-pressed")).toBe("true");

    mockStacked = true;
    view.rerender(createElement(JankenScreen, { loaderData: loaderData as never }));
    expect(screen.getByRole("button", { name: "누적 스코어 보상" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "장비 강화" }));
    mockStacked = false;
    view.rerender(createElement(JankenScreen, { loaderData: loaderData as never }));
    expect(screen.getByRole("button", { name: "장비 강화" }).getAttribute("aria-pressed")).toBe("true");
  });
});
