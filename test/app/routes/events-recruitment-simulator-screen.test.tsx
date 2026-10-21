/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { useLoaderData } from "react-router";
import type { RecruitmentPoolSnapshot, SimulationStudent } from "~/domain/recruitment-simulator";
import EventRecruitmentSimulator from "~/routes/events.$uid.recruitment-simulator";

let mockSnapshot: RecruitmentPoolSnapshot;

jest.mock("~/domain/recruitment-simulator", () => {
  const actual = jest.requireActual<typeof import("~/domain/recruitment-simulator")>("~/domain/recruitment-simulator");
  return {
    ...actual,
    drawRecruitmentTenPull: jest.fn(() =>
      Array.from({ length: 10 }, () => ({ rarity: 3 as const, pickup: true, student: mockSnapshot.pickupStudents[0] })),
    ),
  };
});
jest.mock("react-router", () => ({ useLoaderData: jest.fn(() => ({ snapshot: mockSnapshot })) }));
jest.mock("~/components/v2/layout", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    PageActionBar: ({ summary, children }: { summary: ReactNode; children: ReactNode }) =>
      createElement("aside", { "data-testid": "action-bar" }, summary, children),
    PageMain: ({ children }: { children: ReactNode }) => createElement("main", null, children),
    useV2Page: () => ({ stacked: true }),
  };
});
jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUid: jest.fn(),
  getRecruitmentPoolStudents: jest.fn(),
}));
jest.mock("~/models/timeline-content.server", () => ({ getTimelineContent: jest.fn() }));

const mockedUseLoaderData = jest.mocked(useLoaderData);

function student(uid: string, name: string): SimulationStudent {
  return {
    uid,
    name,
    initialTier: 3,
    attackType: "explosive" as SimulationStudent["attackType"],
    defenseType: "heavy_armor" as SimulationStudent["defenseType"],
    role: "striker" as SimulationStudent["role"],
  };
}

function snapshot(): RecruitmentPoolSnapshot {
  return {
    recruitmentGroupUid: "group-1",
    recruitmentType: "usual" as RecruitmentPoolSnapshot["recruitmentType"],
    startAt: "2030-01-01T00:00:00.000Z",
    pickupStudents: [student("kisaki", "키사키(수영복)"), student("shun", "슌(수영복)")],
    nonPickupStudentsByTier: { tier1: [], tier2: [], tier3: [] },
  };
}

function renderScreen() {
  return render(<EventRecruitmentSimulator />);
}

describe("event recruitment simulator screen", () => {
  it("restores the summary labels and keeps the result count line", () => {
    mockSnapshot = snapshot();

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" }));

    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("총 0회 모집")).toBeTruthy();
    expect(within(bar).getByText("소비한 청휘석 0개")).toBeTruthy();
    expect(within(bar).getByText("3성 학생 모집 확률 0.00%")).toBeTruthy();
    expect(within(bar).getByText("총 0회 모집").className).toContain("font-semibold text-v2-fg");
    expect(within(bar).getByText("소비한 청휘석 0개").className).toContain("text-xs font-normal text-v2-fg-tertiary");
    expect(screen.getByText("모집 결과").parentElement?.textContent).toContain("총 0회 모집");
  });

  it("hides the action bar until a pickup student is selected", () => {
    mockSnapshot = snapshot();

    renderScreen();

    expect(screen.queryByTestId("action-bar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" }));
    expect(screen.getByTestId("action-bar")).toBeTruthy();
  });

  it("uses split student names, mutes unselected choices, and places primary actions after results", () => {
    mockSnapshot = snapshot();

    renderScreen();

    const pickupButton = screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" });
    expect(pickupButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("키사키")).toBeTruthy();
    expect(screen.getAllByText("수영복")).toHaveLength(2);
    expect(pickupButton.querySelector("img")?.className).not.toContain("grayscale");

    fireEvent.click(pickupButton);

    const selectedButton = screen.getByRole("button", { name: "키사키(수영복) 선택, 선택됨" });
    const unselectedButton = screen.getByRole("button", { name: "슌(수영복) 선택, 선택 안 됨" });
    expect(selectedButton.getAttribute("aria-pressed")).toBe("true");
    expect(unselectedButton.querySelector("img")?.className).toContain("grayscale");

    const results = screen.getByRole("heading", { name: "모집 결과" }).closest("section");
    expect(results).not.toBeNull();
    expect(results?.querySelector('[aria-label="★3 3성"]')).toBeNull();
    expect(results?.querySelector('[class*="rounded-lg bg-v2-inset"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "픽업 학생" }).closest("section")?.className).not.toContain("bg-v2-surface");
    expect(within(results as HTMLElement).getByRole("button", { name: "10회 모집" })).toBeTruthy();
    expect(within(results as HTMLElement).getByRole("button", { name: "특정 학생을 뽑을 때까지 모집" })).toBeTruthy();

    const actionBar = screen.getByTestId("action-bar");
    const actionNames = within(actionBar)
      .getAllByRole("button")
      .map((button) => button.textContent?.trim());
    expect(actionNames).toEqual(["중지", "초기화"]);
    expect(within(actionBar).getByRole("button", { name: "초기화" }).className).toContain("bg-v2-danger");
    expect(within(actionBar).getByRole("button", { name: "초기화" }).className).toContain("text-v2-on-danger");
    expect(within(actionBar).getByRole("button", { name: "초기화" }).className).toContain("disabled:bg-v2-inset");
  });

  it("does not show an empty results panel before the first pull", () => {
    mockSnapshot = snapshot();

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" }));

    const results = screen.getByRole("heading", { name: "모집 결과" }).closest("section");
    expect(within(results as HTMLElement).queryByRole("status")).toBeNull();
    expect(results?.querySelector('[class*="rounded-lg bg-v2-inset"]')).toBeNull();
  });

  it("keeps student variants split on result cards", () => {
    mockSnapshot = snapshot();

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" }));
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    expect(screen.getAllByRole("img", { name: "★3 키사키(수영복), 픽업" })).toHaveLength(10);
    expect(screen.getAllByText("키사키").length).toBeGreaterThan(1);
    expect(screen.getAllByText("수영복").length).toBeGreaterThan(1);
    expect(mockedUseLoaderData).toHaveBeenCalled();
  });
});
