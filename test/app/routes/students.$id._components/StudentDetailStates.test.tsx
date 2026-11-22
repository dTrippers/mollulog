/** @jest-environment jsdom */
import "../../components/v2/layout/layout-test-polyfills";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { Defense } from "~/graphql/graphql";
import { StudentPreparingState } from "~/components/v2/features/students/StudentPreparingState";
import GrowthEditorSheet from "~/routes/students.$id._components/GrowthEditorSheet";
import { GrowthSummaryRow } from "~/routes/students.$id._components/StudentBasicInfo";
import StudentBossUsageChart from "~/routes/students.$id._components/StudentBossUsageChart";
import StudentDifficultyUsageChart from "~/routes/students.$id._components/StudentDifficultyUsageChart";
import StudentGradingChart from "~/routes/students.$id._components/StudentGradingChart";
import StudentRaidInvestmentChart from "~/routes/students.$id._components/StudentRaidInvestmentChart";
import type { StudentBossUsageSummary, StudentDifficultyUsage } from "~/routes/students.$id._components/StudentDifficultyUsageModel";
import { StudentStatisticsState } from "~/components/v2/features/raids/StudentStatisticsState";
import { installLayoutTestEnv } from "../../components/v2/layout/layout-test-env";

describe("student statistics states", () => {
  it("shows the final loading skeleton, the empty copy, and a retryable failure", () => {
    const onRetry = jest.fn();

    const loading = render(<StudentStatisticsState state="loading" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toBe("불러오는 중");
    loading.unmount();

    const empty = render(<StudentStatisticsState state="empty" onRetry={onRetry} />);
    expect(screen.getByText("편성된 총력전/대결전 정보가 없어요")).toBeTruthy();
    empty.unmount();
  });

  it("retries a failed statistics request without displaying the empty state", () => {
    const onRetry = jest.fn();
    render(<StudentStatisticsState state="failed" onRetry={onRetry} />);

    expect(screen.getByText("통계를 불러오지 못했어요")).toBeTruthy();
    expect(screen.queryByText("편성된 총력전/대결전 정보가 없어요")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a partial-analysis notice only on the failed area and retains loaded rows", () => {
    const bossSummary: StudentBossUsageSummary = {
      totalScopeCount: 1,
      usedScopeCount: 1,
      rows: [
        {
          key: "boss-a:outdoor:heavy",
          bossName: "보스 A",
          terrain: "outdoor",
          defenseType: Defense.Heavy,
          defenseTypes: [Defense.Heavy],
          usageCount: 4,
          sampleSize: 10,
          usageRate: 0.4,
        },
      ],
    };
    const difficultyRows: StudentDifficultyUsage[] = [
      {
        difficulty: "insane",
        ownCount: 3,
        assistCount: 1,
        usageCount: 4,
        sampleSize: 10,
        usageRate: 0.4,
      },
    ];

    render(
      <>
        <StudentBossUsageChart summary={bossSummary} loading={false} failed onRetry={jest.fn()} />
        <StudentDifficultyUsageChart rows={difficultyRows} loading={false} />
      </>,
    );

    expect(screen.getAllByText("분석 정보를 불러오지 못했어요")).toHaveLength(1);
    expect(screen.getByText("보스 A")).toBeTruthy();
    expect(screen.getByText("10회 중", { exact: false })).toBeTruthy();
  });
});

describe("student basic information state", () => {
  it("shows the neutral preparing notice", () => {
    render(<StudentPreparingState />);
    expect(screen.getByRole("status").textContent).toContain("학생 기본 정보를 준비하고 있어요");
  });
});

describe("student grading empty and signed-out state", () => {
  it("keeps the existing empty-review and sign-in copy", () => {
    render(
      <StudentGradingChart
        student={{ uid: "student-a", name: "학생" }}
        tagCounts={[]}
        noGrading
        signedIn={false}
        showRecentReview={false}
      />,
    );
    expect(screen.getByText("로그인 후 학생 평가를 공유해보세요")).toBeTruthy();
    expect(screen.getByText("첫 번째 평가를 남겨보세요!")).toBeTruthy();
  });

  it("shows the empty review sentence once with the grading action", () => {
    render(
      <MemoryRouter>
        <StudentGradingChart
          student={{ uid: "student-a", name: "학생" }}
          tagCounts={[]}
          noGrading
          signedIn
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("아무도 평가를 남기지 않았어요")).toHaveLength(1);
  });

  it("keeps an accessible edit action when the current review has no comment or tags", () => {
    render(
      <MemoryRouter>
        <StudentGradingChart
          student={{ uid: "student-a", name: "학생" }}
          tagCounts={[]}
          noGrading={false}
          signedIn
          showRecentReview={false}
          currentUserReview={{
            uid: "review-a",
            studentUid: "student-a",
            comment: null,
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
            tags: [],
            user: { username: "sensei", profileStudentId: null },
            student: { uid: "student-a", name: "학생" },
          }}
        />
      </MemoryRouter>,
    );

    const editLink = screen.getByRole("link", { name: "내 평가 수정" });
    expect(editLink.textContent?.trim()).toBe("");
  });
});

describe("student growth summary wrapping", () => {
  it("lets the summary wrap before the non-shrinking action group", () => {
    const { container } = render(
      <GrowthSummaryRow
        growth={{ tier: 3, level: 90, bond: 33, abilityHp: 25, abilityAtk: 25, abilityHeal: 0 } as Parameters<typeof GrowthSummaryRow>[0]["growth"]}
        abilityReleaseDisabledReason={null}
      />,
    );

    const summary = container.firstElementChild;
    expect(summary?.classList.contains("flex-auto")).toBe(true);
    expect(summary?.classList.contains("flex-wrap")).toBe(true);
    expect(summary?.classList.contains("min-w-0")).toBe(true);
  });
});

describe("student raid investment summary", () => {
  it("marks a combined tier row when the recruited student's tier is included", () => {
    render(
      <StudentRaidInvestmentChart
        signedIn
        investment={{
          ownCount: 100,
          medianTier: 5,
          myTier: 5,
          distribution: [
            { tier: 5, count: 30, ratio: 0.3 },
            { tier: 6, count: 20, ratio: 0.2 },
          ],
        }}
      />,
    );

    expect(screen.getByText("내 학생")).toBeTruthy();
  });
});

describe("student growth editor save states", () => {
  beforeEach(() => installLayoutTestEnv());

  const common = {
    open: true,
    onClose: jest.fn(),
    initialTier: 3,
    growth: { tier: 3, level: 90, bond: 20, abilityHp: 0, abilityAtk: 0, abilityHeal: 0 },
    abilityReleaseDisabledReason: null,
    onTierChange: jest.fn(),
    onLevelChange: jest.fn(),
    onBondChange: jest.fn(),
    onAbilityHpChange: jest.fn(),
    onAbilityAtkChange: jest.fn(),
    onAbilityHealChange: jest.fn(),
    saveAvailable: true,
    signedIn: true,
    released: true,
    saved: false,
    saving: false,
    saveDisabled: false,
    saveLabel: "내 프로필에 반영",
    saveError: null,
    staleWriteBlocked: false,
    retryAvailable: false,
    onSave: jest.fn(),
    onRefresh: jest.fn(),
    onRetry: jest.fn(),
  };

  it("shows saved and saving labels, and exposes save after login", () => {
    const savedView = render(<GrowthEditorSheet {...common} saved />);
    expect(screen.getByText("반영됨")).toBeTruthy();
    savedView.unmount();

    const savingView = render(<GrowthEditorSheet {...common} saving />);
    expect(screen.getByRole("button", { name: "반영 중" })).toBeTruthy();
    savingView.unmount();

    render(<GrowthEditorSheet {...common} signedIn={false} saveAvailable={false} />);
    expect(screen.getByText("로그인 후 사용 가능")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "내 프로필에 반영" })).toBeNull();
  });

  it("offers retry for a save failure and refresh for a stale write", () => {
    const onRetry = jest.fn();
    const onRefresh = jest.fn();
    const failedView = render(
      <GrowthEditorSheet {...common} saveError="육성 상태를 저장하지 못했어요" retryAvailable onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    failedView.unmount();

    render(
      <GrowthEditorSheet
        {...common}
        saveError="다른 요청으로 저장 상태가 변경되었어요. 새로고침 후 다시 시도해주세요"
        staleWriteBlocked
        saveDisabled
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "내 프로필에 반영" })).toHaveProperty("disabled", true);
  });

  it("submits the shown level after out-of-range and empty input", () => {
    const submittedLevels: number[] = [];
    function Harness() {
      const [level, setLevel] = useState(90);
      return (
        <GrowthEditorSheet
          {...common}
          growth={{ ...common.growth, level }}
          onLevelChange={setLevel}
          onSave={() => submittedLevels.push(level)}
        />
      );
    }

    render(<Harness />);
    const levelInput = screen.getByRole("spinbutton", { name: "레벨" });
    fireEvent.change(levelInput, { target: { value: "101" } });
    expect(levelInput).toHaveProperty("value", "90");
    fireEvent.click(screen.getByRole("button", { name: "내 프로필에 반영" }));
    expect(submittedLevels.at(-1)).toBe(90);

    fireEvent.change(levelInput, { target: { value: "" } });
    expect(levelInput).toHaveProperty("value", "1");
    fireEvent.click(screen.getByRole("button", { name: "내 프로필에 반영" }));
    expect(submittedLevels.at(-1)).toBe(1);
  });
});
