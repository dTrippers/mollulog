/**
 * @jest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { CallChargeTenPullResult } from "~/domain/recruitment-call-charge-simulation";
import type { RecruitmentRuleSet } from "~/domain/recruitment-cost";
import type { PickupSimulationStudent, RecruitmentPoolSnapshot } from "~/domain/recruitment-simulator";
import EventRecruitmentSimulator from "~/routes/events.$uid.recruitment-simulator";

let mockSnapshot: RecruitmentPoolSnapshot;
let mockRuleSet: RecruitmentRuleSet;
let mockCallChargePull: (startingCharge: number) => CallChargeTenPullResult;

jest.mock("~/domain/recruitment-simulator", () => {
  const actual = jest.requireActual<typeof import("~/domain/recruitment-simulator")>("~/domain/recruitment-simulator");
  return {
    ...actual,
    drawRecruitmentTenPull: jest.fn(() =>
      Array.from({ length: 10 }, () => ({ rarity: 3 as const, pickup: true, student: mockSnapshot.pickupStudents[0] })),
    ),
  };
});
jest.mock("~/domain/recruitment-call-charge-simulation", () => {
  const actual = jest.requireActual<typeof import("~/domain/recruitment-call-charge-simulation")>(
    "~/domain/recruitment-call-charge-simulation",
  );
  return {
    ...actual,
    simulateCallChargeTenPull: jest.fn(({ startingCharge }: { startingCharge: number }) =>
      mockCallChargePull(startingCharge),
    ),
  };
});
jest.mock("react-router", () => ({
  useLoaderData: jest.fn(() => ({ snapshot: mockSnapshot, ruleSet: mockRuleSet })),
}));
jest.mock("~/components/v2/layout", () => {
  const { createElement: h, forwardRef: fr } = jest.requireActual<typeof import("react")>("react");
  return {
    PageActionBar: fr<HTMLElement, { summary: ReactNode; details?: ReactNode; children: ReactNode }>(
      ({ summary, details, children }, ref) => h("aside", { "data-testid": "action-bar", ref }, summary, details, children),
    ),
    PageMain: ({ children }: { children: ReactNode }) => h("main", null, children),
    useV2Page: () => ({ stacked: true }),
  };
});
jest.mock("~/components/v2/features/pyroxene/pyroxene-ui", () => ({
  RECRUITMENT_STACK_LABELS: { regular: "모집 스택", limited: "특별 스택" },
  ResourceIcon: () => createElement("img", { alt: "청휘석" }),
}));
jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUid: jest.fn(),
  getRecruitmentPoolStudents: jest.fn(),
}));
jest.mock("~/models/timeline-content.server", () => ({ getTimelineContent: jest.fn() }));
jest.mock("~/lib/google-analytics-events.client", () => ({ trackGoogleAnalyticsEvent: jest.fn() }));

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  window.matchMedia = jest.fn(() => ({
    matches: true,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

function student(
  uid: string,
  name: string,
  recruitmentType: PickupSimulationStudent["recruitmentType"] = "usual" as PickupSimulationStudent["recruitmentType"],
): PickupSimulationStudent {
  return {
    uid,
    name,
    initialTier: 3,
    attackType: "explosive" as PickupSimulationStudent["attackType"],
    defenseType: "heavy_armor" as PickupSimulationStudent["defenseType"],
    role: "striker" as PickupSimulationStudent["role"],
    recruitmentType,
  };
}

function snapshot(pickupStudents = [student("kisaki", "키사키(수영복)"), student("shun", "슌(수영복)")]) {
  return {
    recruitmentGroupUid: "group-1",
    recruitmentType: "usual" as RecruitmentPoolSnapshot["recruitmentType"],
    startAt: "2030-01-01T00:00:00.000Z",
    pickupStudents,
    nonPickupStudentsByTier: { tier1: [], tier2: [], tier3: [] },
  } satisfies RecruitmentPoolSnapshot;
}

// Ten one-star filler slots, with the given slots replaced.
function callChargePull(
  charge: number,
  slots: Record<number, Partial<CallChargeTenPullResult["results"][number]>> = {},
): CallChargeTenPullResult {
  const filler = { ...student("filler", "필러"), initialTier: 1 };
  return {
    charge,
    results: Array.from({ length: 10 }, (_, index) => ({
      rarity: 1 as const,
      pickup: false,
      student: filler,
      adjustment: null,
      resetCharge: false,
      ...slots[index],
    })),
  };
}

function selectKisaki() {
  fireEvent.click(screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" }));
}

beforeEach(() => {
  jest.useRealTimers();
  mockSnapshot = snapshot();
  mockRuleSet = "call_charge_v1";
  mockCallChargePull = (startingCharge) => callChargePull(startingCharge + 10);
});

describe("event recruitment simulator screen", () => {
  it("shows the summary bar only after the first pull, with the result count in both places", () => {
    render(<EventRecruitmentSimulator />);
    selectKisaki();

    expect(screen.queryByTestId("action-bar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    const bar = screen.getByTestId("action-bar");
    expect(within(bar).getByText("총 10회 모집")).toBeTruthy();
    expect(bar.textContent).toContain("소비한 청휘석1,200개");
    expect(within(bar).getByText("3성 학생 비율 0.00%")).toBeTruthy();
    expect(within(bar).getByText("모집 스택 10")).toBeTruthy();
    expect(bar.textContent).toContain("100까지 90회 · 50% 확률로 픽업");
    expect(screen.getByText("모집 결과").parentElement?.textContent).toContain("총 10회 모집");
    expect(
      within(bar)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["중지", "초기화"]);
  });

  it("names the stack kind of the period and of each pickup only when the kinds are mixed", () => {
    mockSnapshot = snapshot([
      student("kasumi", "카스미(수영복)"),
      student("seia", "세이아(수영복)", "limited" as PickupSimulationStudent["recruitmentType"]),
    ]);
    render(<EventRecruitmentSimulator />);

    expect(screen.getByText(/픽업 학생에 따라 모집 스택이나 특별 스택이 쌓여요./)).toBeTruthy();
    expect(screen.getAllByText("모집 스택")).toHaveLength(1);
    expect(screen.getAllByText("특별 스택")).toHaveLength(1);

    expect(screen.getByRole("button", { name: "카스미(수영복) 선택, 모집 스택, 선택 안 됨" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "세이아(수영복) 선택, 특별 스택, 선택 안 됨" }));
    expect(screen.queryByText(/픽업 학생에 따라/)).toBeNull();
    expect(screen.getAllByText("특별 스택")).toHaveLength(2);
  });

  it("shows the legacy rule and the 200-pull exchange before the call-charge anchor", () => {
    mockRuleSet = "legacy_points";
    render(<EventRecruitmentSimulator />);

    expect(screen.getByText("개편 전 규칙")).toBeTruthy();
    selectKisaki();
    for (let index = 0; index < 20; index += 1) fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    expect(screen.getByText("200회 모집 포인트 교환")).toBeTruthy();
    expect(screen.getByTestId("action-bar").textContent).not.toContain("스택");
  });

  it("marks charge adjustments on the card and beside the range label after the reveal", () => {
    jest.useFakeTimers();
    mockCallChargePull = () =>
      callChargePull(0, {
        9: { rarity: 3, pickup: true, student: mockSnapshot.pickupStudents[0], adjustment: 100, resetCharge: true },
      });
    render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    expect(screen.queryByText(/10회째/)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(screen.getByText("10회째: 모집 스택 100에서 선택한 픽업 학생이 나와 스택이 0이 됐어요")).toBeTruthy();
    expect(screen.getByRole("img", { name: "★3 키사키(수영복), 픽업, 스택 100 보정" })).toBeTruthy();
    expect(screen.getByText("스택 100")).toBeTruthy();
  });

  it("repeats until the target appears, then keeps the status after more pulls", () => {
    jest.useFakeTimers();
    let pulls = 0;
    mockCallChargePull = (startingCharge) => {
      pulls += 1;
      return pulls === 3
        ? callChargePull(0, { 4: { rarity: 3, pickup: true, student: mockSnapshot.pickupStudents[0], resetCharge: true } })
        : callChargePull(startingCharge + 10);
    };
    render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "특정 학생을 뽑을 때까지 모집" }));
    expect(screen.getByText("목표 학생을 선택해주세요")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" }).at(-1) as HTMLElement);

    expect(screen.getByText("뽑을 때까지 모집 중")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("25회째에 뽑았어요")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(screen.getByText("25회째에 뽑았어요")).toBeTruthy();
    expect(screen.getByRole("img", { name: "★3 키사키(수영복), 픽업, 목표 학생" })).toBeTruthy();
  });

  it("stops a running repeat before asking to reset, and keeps the results on cancel", () => {
    jest.useFakeTimers();
    render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "특정 학생을 뽑을 때까지 모집" }));
    fireEvent.click(screen.getAllByRole("button", { name: "슌(수영복) 선택, 선택 안 됨" }).at(-1) as HTMLElement);

    fireEvent.click(within(screen.getByTestId("action-bar")).getByRole("button", { name: "초기화" }));
    expect(screen.getByText("뽑기 전에 중지했어요")).toBeTruthy();
    expect(screen.getByText("지금까지의 모집 결과 10회가 사라져요.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(within(screen.getByTestId("action-bar")).getByText("총 10회 모집")).toBeTruthy();

    fireEvent.click(within(screen.getByTestId("action-bar")).getByRole("button", { name: "초기화" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "초기화" }));
    expect(screen.queryByTestId("action-bar")).toBeNull();
  });

  it("starts the next pull from stack 0 after a reset", () => {
    const startingCharges: number[] = [];
    mockCallChargePull = (startingCharge) => {
      startingCharges.push(startingCharge);
      return callChargePull(startingCharge + 10);
    };
    render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    fireEvent.click(within(screen.getByTestId("action-bar")).getByRole("button", { name: "초기화" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    expect(startingCharges).toEqual([0, 10, 0]);
    expect(within(screen.getByTestId("action-bar")).getByText("모집 스택 10")).toBeTruthy();
  });

  it("stops a running repeat and clears the results when the pickup changes", () => {
    jest.useFakeTimers();
    const startingCharges: number[] = [];
    mockCallChargePull = (startingCharge) => {
      startingCharges.push(startingCharge);
      return callChargePull(startingCharge + 10);
    };
    render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "특정 학생을 뽑을 때까지 모집" }));
    fireEvent.click(screen.getAllByRole("button", { name: "슌(수영복) 선택, 선택 안 됨" }).at(-1) as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(startingCharges).toHaveLength(3);

    fireEvent.click(screen.getAllByRole("button", { name: "슌(수영복) 선택, 선택 안 됨" })[0] as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(startingCharges).toHaveLength(3);
    expect(screen.queryByTestId("action-bar")).toBeNull();
    expect(screen.queryByText("뽑을 때까지 모집 중")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));
    expect(startingCharges.at(-1)).toBe(0);
  });

  it("counts a target that appears in a manual pull after stopping", () => {
    jest.useFakeTimers();
    let pulls = 0;
    mockCallChargePull = (startingCharge) => {
      pulls += 1;
      return pulls === 2
        ? callChargePull(startingCharge + 10, { 6: { rarity: 3, pickup: true, student: mockSnapshot.pickupStudents[1] } })
        : callChargePull(startingCharge + 10);
    };
    render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "특정 학생을 뽑을 때까지 모집" }));
    fireEvent.click(screen.getAllByRole("button", { name: "슌(수영복) 선택, 선택 안 됨" }).at(-1) as HTMLElement);
    fireEvent.click(within(screen.getByTestId("action-bar")).getByRole("button", { name: "중지" }));
    expect(screen.getByText("뽑기 전에 중지했어요")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "10회 모집" }));

    expect(screen.getByText("17회째에 뽑았어요")).toBeTruthy();
  });

  it("stops the repeat timer when the screen unmounts", () => {
    jest.useFakeTimers();
    let pulls = 0;
    mockCallChargePull = (startingCharge) => {
      pulls += 1;
      return callChargePull(startingCharge + 10);
    };
    const { unmount } = render(<EventRecruitmentSimulator />);
    selectKisaki();
    fireEvent.click(screen.getByRole("button", { name: "특정 학생을 뽑을 때까지 모집" }));
    fireEvent.click(screen.getAllByRole("button", { name: "슌(수영복) 선택, 선택 안 됨" }).at(-1) as HTMLElement);
    expect(pulls).toBe(1);

    unmount();
    jest.advanceTimersByTime(2000);

    expect(pulls).toBe(1);
  });
});
