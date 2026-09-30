import { describe, expect, it, jest } from "@jest/globals";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { NumberInput } from "~/components/primitives";
import { calculateApPlannerEvent, type ApPlannerEvent } from "~/domain/ap-planner";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import PlannerEventThumbnail from "~/components/features/planner/PlannerEventThumbnail";
import ApPlannerConditionsSheet from "~/routes/utils.ap._components/ApPlannerConditionsSheet";
import ApCalculationMethodSheet from "~/routes/utils.ap._components/ApCalculationMethodSheet";
import ApPlannerListSkeleton from "~/routes/utils.ap._components/ApPlannerListSkeleton";
import ApTimelineEvent from "~/routes/utils.ap._components/ApTimelineEvent";
import ApStockpileSteps from "~/routes/utils.ap._components/ApStockpileSteps";
import { ApPlannerConditionsPanelContent } from "~/routes/utils.ap._components/ApPlannerConditionsPanel";

jest.mock("~/components/primitives/BottomSheet", () => ({
  __esModule: true,
  default: ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) => (
    <section role="dialog" aria-label={title}>
      {children}
      {footer}
    </section>
  ),
}));

const event: ApPlannerEvent = {
  timelineUid: "event-1",
  name: "테스트 이벤트",
  startAt: "2026-09-30T02:00:00.000Z",
  endAt: "2026-10-13T01:59:00.000Z",
  exchangeUntil: "2026-10-20T01:59:00.000Z",
  requiredAp: 16_500,
  requiredBreakdown: { firstClearAp: 1_000, questSweepAp: 15_000, extraSweepAp: 500 },
};

const displayEvent = { ...event, contentUid: null };
const conditions = { accountLevel: 85, cafeRank: 8, comfort: 4_500 };

function renderCard(props: Partial<ComponentProps<typeof ApTimelineEvent>> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ApTimelineEvent
        event={displayEvent}
        calculation={null}
        shopTargetExists={false}
        plan={null}
        options={defaultPyroxenePlannerOptions}
        onAddPlanWithAccessAt={async () => true}
        onRemovePlan={jest.fn()}
        onSaveAccessAt={async () => true}
        onApplyException={jest.fn()}
        onRemoveException={jest.fn()}
        onOpenConditions={jest.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

function calculationFor(overrides: Partial<ApPlannerEvent> = {}, currentAt = "2026-09-27T00:00:00.000Z") {
  return calculateApPlannerEvent({
    event: { ...event, ...overrides },
    conditions,
    plan: { accessAt: "2026-09-30T03:00:00.000Z" },
    currentAt,
    options: defaultPyroxenePlannerOptions,
  });
}

describe("AP planner event card", () => {
  it("renders a targetless event as a compact row with a target action", () => {
    const markup = renderCard();

    expect(markup).toContain('aria-label="이벤트 테스트 이벤트, 상점 목표 없음"');
    expect(markup).toContain("상점 목표 없음");
    expect(markup).toContain("상점 목표 등록");
    expect(markup).toContain("/events/event-1/shop");
    expect(markup).toContain("p-3 md:p-4");
    expect(markup).toContain("min-w-0 flex-1 items-start justify-between gap-2");
    expect(markup).toContain("9/30(수) 11:00 ~</span><span class=\"-ml-1.5 whitespace-nowrap\">\u00a010/13(화) 10:59</span>");
    expect(markup).toContain('<p class="text-xs text-muted-foreground">상점 목표 없음</p>');
    expect(markup).toMatch(/<a[^>]*class="[^"]*text-xs[^"]*"[^>]*>상점 목표 등록<\/a>/);
    expect(markup).not.toContain("상점 목표가 없는 이벤트가 있어요");
    expect(markup).not.toContain("0 AP");
  });

  it.each([
    { runType: "first" as const, prefix: "최초 · " },
    { runType: "rerun" as const, prefix: "복각 · " },
    { runType: "permanent" as const, prefix: "" },
    { runType: undefined, prefix: "" },
  ])("shows the run type before compact and full-card dates when appropriate", ({ runType, prefix }) => {
    const eventWithRunType = { ...displayEvent, runType };
    const compactMarkup = renderCard({ event: eventWithRunType });
    const fullMarkup = renderCard({
      event: eventWithRunType,
      calculation: calculationFor(),
      shopTargetExists: true,
    });

    expect(compactMarkup).toContain(`${prefix}9/30(수) 11:00 ~</span>`);
    expect(fullMarkup).toContain(`${prefix}9/30(수) 11:00 ~ 10/13(화) 10:59`);
  });

  it("keeps a planned targetless event removable", () => {
    const markup = renderCard({ plan: { accessAt: null } });

    expect(markup).toContain("모으기 계산 취소");
    expect(markup).not.toContain("AP 모으기 계획에 추가</button>");
  });

  it("keeps the desktop plan marker inline with dates and the mobile marker below the title", () => {
    const markup = renderCard({
      calculation: calculationFor(),
      shopTargetExists: true,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
    });

    expect(markup).toContain("hidden items-center gap-1 font-medium text-green-700 dark:text-green-400 md:inline-flex");
    expect(markup).toContain("inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 md:hidden");
    expect(markup).not.toContain("계획에서 빼기");
  });

  it.each([
    { accountLevel: null, cafeRank: 8, comfort: 4_500 },
    { accountLevel: 85, cafeRank: null, comfort: null },
  ])("shows required AP and the condition action when inputs are missing", (missingConditions) => {
    const calculation = calculateApPlannerEvent({
      event,
      conditions: missingConditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const markup = renderCard({
      calculation,
      shopTargetExists: true,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
    });

    expect(markup).toContain("필요");
    expect(markup).toContain("계정 레벨과 카페 랭크를 입력하면 확보 가능한 AP를 계산해요.");
    expect(markup).toContain("플레이 조건 입력");
    expect(markup).not.toContain("확보 가능</h4>");
    expect(markup).not.toContain("계산 근거");
    expect(calculation.availableAp).toBeNull();
    expect(calculation.supplyBreakdown).toBeNull();
  });

  it("puts the result first, labels the comparison in text, and hides its decorative bar", () => {
    const calculation = calculationFor();
    const markup = renderCard({ calculation, shopTargetExists: true, plan: { accessAt: "2026-09-30T03:00:00.000Z" } });

    expect(markup).toContain(`${Math.abs(calculation.resultAp ?? 0).toLocaleString()} AP 부족`);
    expect(markup).toContain("확보 가능");
    expect(markup.indexOf("확보 가능")).toBeLessThan(markup.indexOf("계산 근거"));
    const controls = markup.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeDefined();
    expect(markup.indexOf("계산 근거")).toBeLessThan(markup.indexOf(`id="${controls}"`, markup.indexOf("계산 근거")));
    expect(markup).toContain("필요");
    expect(markup).toMatch(/<div aria-hidden="true" class="relative h-2 w-full/);
    expect(markup).toContain("계산 근거");
    expect(markup).not.toContain("계산 방식");
    expect(markup).toContain('aria-expanded="false"');
  });

  it("renders expanded calculation totals and omits zero requirement rows", () => {
    const calculation = calculationFor({
      requiredAp: 0,
      requiredBreakdown: { firstClearAp: 0, questSweepAp: 0, extraSweepAp: 0 },
    });
    const markup = renderCard({
      calculation,
      shopTargetExists: true,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      deepLink: true,
    });

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("필요</h4><span class=\"shrink-0 text-right tabular-nums\">0</span>");
    expect(markup).toContain("확보 가능");
    const controls = markup.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeDefined();
    const disclosureIndex = markup.indexOf("계산 근거");
    const basisRowsIndex = markup.indexOf(`id="${controls}"`, disclosureIndex);
    expect(basisRowsIndex).toBeGreaterThan(disclosureIndex);
    expect(markup.slice(basisRowsIndex, basisRowsIndex + 100)).toContain('class="hidden"');
    expect(markup).not.toContain("스토리 초회");
    expect(markup).not.toContain("퀘스트 소탕");
    expect(markup).not.toContain("추가 소탕");
  });

  it("shows refill proposal titles, resource chips, primary choice, and undo state", () => {
    const calculation = calculationFor({ requiredAp: 100_000 });
    const markup = renderCard({ calculation, shopTargetExists: true, plan: { accessAt: "2026-09-30T03:00:00.000Z" } });
    const applyClasses = [...markup.matchAll(/<button[^>]*class="([^"]+)"[^>]*>적용<\/button>/g)].map(
      (match) => match[1],
    );

    expect(calculation.refillSuggestions.length).toBeGreaterThan(0);
    expect(markup).toContain("AP 충전으로 채우기");
    expect(markup).toContain("적용하면 청휘석 플래너 설정에 반영돼요");
    expect(markup).toMatch(/\d+\/\d+\(.\) AP 충전 \d+회/);
    expect(markup).toContain("bg-green-700/10");
    expect(markup).toContain("−");
    expect(markup).toContain("dark:text-red-300");
    expect(markup).toContain("space-y-6 md:space-y-1");
    expect(markup).toContain("min-w-0 space-y-0 rounded-md p-3 md:space-y-0");
    expect(applyClasses[0]).toContain("bg-primary");
    expect(applyClasses.slice(1).every((classes) => classes?.includes("bg-background"))).toBe(true);
    expect(applyClasses[0]).toContain("md:text-xs");
    expect(applyClasses.at(-1)).toContain("dark:bg-muted-foreground/25");
  });

  it("shows refill results as the post-apply availability minus the required AP", () => {
    const baseline = calculationFor({ requiredAp: 100_000 });
    expect(baseline.refillSuggestions.length).toBeGreaterThanOrEqual(2);
    const [closesGap, leavesGap] = baseline.refillSuggestions;
    if (!closesGap || !leavesGap) return;
    const calculation = {
      ...baseline,
      refillSuggestions: [
        { ...closesGap, resultAp: baseline.requiredAp + 725 },
        { ...leavesGap, resultAp: baseline.requiredAp - 1_234 },
      ],
    };
    const markup = renderCard({
      calculation,
      shopTargetExists: true,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
    });

    expect(markup).toMatch(/class="[^"]*text-green-700[^"]*">적용하면 725 AP 여유/);
    expect(markup).toMatch(/class="[^"]*text-red-700[^"]*">적용하면 1,234 AP 부족/);
  });

  it("keeps an applied refill tile visible after it removes the deficit", () => {
    const accessAt = "2026-09-30T03:00:00.000Z";
    const baseline = calculateApPlannerEvent({
      event: { ...event, requiredAp: 0 },
      conditions,
      plan: { accessAt },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const before = calculateApPlannerEvent({
      event: { ...event, requiredAp: (baseline.availableAp ?? 0) + 1 },
      conditions,
      plan: { accessAt },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const suggestion = before.refillSuggestions[0];
    expect(suggestion).toBeDefined();
    if (!suggestion) return;
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: {
        ...defaultPyroxenePlannerOptions.consumption,
        apChargeExceptions: [
          {
            uid: "applied-refill",
            startDate: suggestion.startDate,
            endDate: suggestion.endDate,
            count: suggestion.toCount,
          },
        ],
      },
    };
    const appliedCalculation = calculateApPlannerEvent({
      event: { ...event, requiredAp: suggestion.resultAp },
      conditions,
      plan: { accessAt },
      currentAt: "2026-09-27T00:00:00.000Z",
      options,
    });
    expect(appliedCalculation.resultAp).toBeGreaterThanOrEqual(0);
    expect(
      appliedCalculation.refillSuggestions.some(
        ({ startDate, endDate, toCount }) =>
          startDate === suggestion.startDate && endDate === suggestion.endDate && toCount === suggestion.toCount,
      ),
    ).toBe(true);
    const markup = renderCard({
      calculation: appliedCalculation,
      options,
      plan: { accessAt },
      shopTargetExists: true,
    });

    expect(markup).toContain("적용됨");
    expect(markup).toContain("되돌리기");
    expect(markup).toContain(`${(appliedCalculation.resultAp ?? 0).toLocaleString()} AP 여유`);
  });

  it("uses ongoing wording and the approved excluded-AP caption", () => {
    const calculation = calculationFor({}, "2026-10-01T03:00:00.000Z");
    const markup = renderCard({ calculation, shopTargetExists: true, plan: null });

    expect(calculation.status).toBe("ongoing");
    expect(markup).toContain("종료까지");
    expect(markup).toContain(
      "현재 보유 AP와 오늘 일일 미션은 빼고, 오늘 AP 충전과 전술 대회 AP 구매는 아직 하지 않은 것으로 계산했어요.",
    );
    expect(markup).not.toContain("AP 모으기 계산</button>");
    expect(markup).not.toContain("접속 시");
    expect(markup).not.toContain(">모으기 순서 보기<");

    const earlierEventOwnsToday = renderCard({
      calculation: { ...calculation, todayPurchasesIncluded: false },
      shopTargetExists: true,
      plan: null,
    });
    expect(earlierEventOwnsToday).toContain("오늘 AP 충전과 전술 대회 AP 구매는 앞 이벤트 몫으로 계산했어요.");
  });

  it("omits the zero stockpile basis line when an ongoing event has no visible stockpile block", () => {
    const calculation = calculationFor({}, "2026-10-01T03:00:00.000Z");
    const supply = calculation.supplyBreakdown;
    const markup = renderCard({
      calculation,
      shopTargetExists: true,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      deepLink: true,
    });

    expect(calculation.status).toBe("ongoing");
    expect(calculation.accessTimePassed).toBe(true);
    expect(supply?.stockpile).toBe(0);
    expect(markup).not.toContain("시작 전 모은 AP");
    expect(
      (supply?.natural ?? 0) +
        (supply?.cafe ?? 0) +
        (supply?.dailyTasks ?? 0) +
        (supply?.apPackage ?? 0) +
        (supply?.apCharges ?? 0) +
        (supply?.tacticalApShop ?? 0),
    ).toBe(calculation.availableAp);
  });

  it("keeps ongoing results and offers access-time entry for a saved plan without one", () => {
    const calculation = calculationFor({}, "2026-10-01T03:00:00.000Z");
    const markup = renderCard({ calculation, shopTargetExists: true, plan: { accessAt: null } });

    expect(calculation.status).toBe("ongoing");
    expect(markup).toContain("종료까지");
    expect(markup).toContain("접속할 시각 입력");
    expect(markup).not.toContain(">모으기 순서 보기<");
  });

  it("shows missing reward data as a muted waiting message instead of a warning", () => {
    const message = "해당 이벤트의 퀘스트/미니게임 보상 데이터를 준비중이에요. 조금만 기다려주세요.";
    const markup = renderCard({
      calculation: null,
      calculationError: message,
      rewardDataPending: true,
      shopTargetExists: true,
    });

    expect(markup).toContain(`<p class="break-keep text-sm text-muted-foreground">${message}</p>`);
    expect(markup).not.toContain("계산할 수 없어요");
    expect(markup).not.toContain("text-amber-700");
    expect(markup).not.toContain("AP 모으기 계산");
  });

  it("keeps an invalid target out of the add-plan action state", () => {
    const markup = renderCard({
      calculation: null,
      calculationError: "이벤트 종료 시각을 확인할 수 없어 AP를 계산하지 못했어요.",
      shopTargetExists: true,
    });

    expect(markup).toContain("계산할 수 없어요");
    expect(markup).toContain("상점 목표 수정");
    expect(markup).not.toContain("상점 목표 등록");
    expect(markup).not.toContain("AP 모으기 계산");
  });
});

describe("AP planner sheets and timeline", () => {
  it("shows one responsive conditions form without a fallback comfort helper", () => {
    const markup = renderToStaticMarkup(
      <ApPlannerConditionsSheet
        open
        state={{ accountLevel: 85, cafeRank: 8, comfort: null, eventPlans: {} }}
        options={defaultPyroxenePlannerOptions}
        onClose={() => {}}
        onSave={() => true}
      />,
    );

    expect(markup).toContain('role="dialog" aria-label="플레이 조건"');
    expect(markup).toContain("계정 레벨");
    expect(markup).toContain("카페 랭크");
    expect(markup).toContain("카페 쾌적도");
    expect(markup).toContain("전술 대회 AP 구매");
    expect(markup).toContain("상점 1회에 30 AP + 60 AP · 하루 최대 4회");
    expect(markup).toContain("매일 AP 충전");
    expect(markup).toContain("최대 AP 230");
    expect(markup).toContain("보관 최대 600");
    expect(markup).not.toContain("시간당 약");
    expect(markup).not.toContain("청휘석 플래너와 같은 설정");
    expect(markup).toContain("grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2");
    expect(markup.match(/<button[^>]*>저장<\/button>/g)).toHaveLength(1);
    expect(markup).toContain("min-w-0 space-y-4 pb-8");
    expect(markup).toContain("max-w-none");
  });

  it("labels expanded rows with KST day headings and shows the access AP amount", () => {
    const calculation = calculationFor();
    const markup = renderToStaticMarkup(
      <ApStockpileSteps
        calculation={calculation}
        eventStartAt={event.startAt}
        accessAt="2026-09-30T03:00:00.000Z"
        initialExpanded
        onChangeAccessAt={() => {}}
      />,
    );

    expect(markup).toContain("모으기 시작");
    expect(markup).toContain("접속할 시각");
    expect(markup).toContain("모으기 순서 보기");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("사용 가능 약");
    expect(markup).toContain("개최일 · 9/30(수)");
    expect(markup).not.toContain("h-px");
  });

  it("anchors stockpile summary and row labels to the access date", () => {
    const accessAt = "2026-10-01T03:00:00.000Z";
    const calculation = calculateApPlannerEvent({
      event,
      conditions,
      plan: { accessAt },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const markup = renderToStaticMarkup(
      <ApStockpileSteps
        calculation={calculation}
        eventStartAt={event.startAt}
        accessAt={accessAt}
        initialExpanded
        onChangeAccessAt={() => {}}
      />,
    );

    expect(markup).toContain("하루 전 9/30(수) 12:00");
    expect(markup).toContain("하루 전 · 9/30(수)");
    expect(markup).toContain("접속일 · 10/1(목)");
  });

  it("shows the calculation-method groups and confirmed rules", () => {
    const markup = renderToStaticMarkup(<ApCalculationMethodSheet open onClose={() => {}} />);

    expect(markup).toContain("기본 계산에 포함하는 AP");
    expect(markup).toContain("6분마다 1 AP (계정 레벨에 따른 최대 보유 AP량까지)");
    expect(markup).toContain("카페 1호점 생산 AP (카페 쾌적도에 따른 최대 보유 AP량까지)");
    expect(markup).toContain("일일 미션 (150 AP)");
    expect(markup).toContain("전술 대회 코인을 이용한 AP 충전");
    expect(markup).toContain("2주 AP 패키지 구매");
    expect(markup).toContain("AP 모으기 계산 방법");
    expect(markup).not.toContain("확인되지 않은 규칙");
  });

  it("renders a skeleton status for the loading panel", () => {
    const markup = renderToStaticMarkup(
      <ApPlannerConditionsPanelContent
        ready={false}
        loading
        state={{ accountLevel: null, cafeRank: null, comfort: null, eventPlans: {} }}
        options={defaultPyroxenePlannerOptions}
        apPackageSummary="구매 기록 없음"
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('class="sr-only"');
    expect(markup).toContain("rounded bg-muted");
    expect(markup).toContain("space-y-3 text-sm");
    expect(markup).toContain("space-y-0.5");
    expect(markup.match(/rounded-md px-1\.5 py-1\.5 lg:min-h-7/g)).toHaveLength(6);
    expect(markup).not.toContain("tone-destructive");
  });

  it("uses the section title in the loading skeleton announcement", () => {
    const markup = renderToStaticMarkup(
      <ApPlannerListSkeleton groups={[{ month: "10월", events: [{ key: "event", kind: "compact" }] }]} />,
    );

    expect(markup).toContain('aria-label="이벤트 별 AP 계획을 불러오고 있어요"');
    expect(markup).toContain('<span class="sr-only">이벤트 별 AP 계획을 불러오고 있어요</span>');
  });

  it("shows AP package coverage and links to its owner in the conditions panel", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ApPlannerConditionsPanelContent
          ready
          loading={false}
          state={{ accountLevel: 85, cafeRank: 8, comfort: 4_500, eventPlans: {} }}
          options={defaultPyroxenePlannerOptions}
          apPackageSummary="10/3까지"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("2주 AP 패키지");
    expect(markup).toContain("10/3까지");
    expect(markup).toContain('href="/utils/pyroxene"');
    expect(markup).toContain("space-y-3 text-sm");
    expect(markup).toContain("space-y-0.5");
    expect(markup.match(/rounded-md px-1\.5/g)).toHaveLength(6);
  });

  it("mirrors month labels and compact/full cards in the list skeleton", () => {
    const markup = renderToStaticMarkup(
      <ApPlannerListSkeleton
        groups={[
          {
            month: "10월",
            events: [
              { key: "compact", kind: "compact" },
              { key: "full", kind: "full" },
            ],
          },
        ]}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("10월");
    expect(markup).toContain("p-3 md:p-4");
    expect(markup).toContain("h-5 w-1/2 max-w-full rounded bg-muted md:hidden");
    expect(markup).toContain("h-4 w-28 max-w-full rounded bg-muted");
    expect(markup).toContain("space-y-4 p-5 md:space-y-3.5 md:p-6");
  });

  it("hides failed AP event images until the KR or JP image loads while preserving planner defaults", () => {
    const apMarkup = renderToStaticMarkup(
      <PlannerEventThumbnail imageUrl="/kr.jpg" fallbackImageUrl="/jp.jpg" recoverPreloadedFailure />,
    );
    const plannerMarkup = renderToStaticMarkup(<PlannerEventThumbnail imageUrl="/planner.jpg" />);

    expect(apMarkup).toContain("opacity-0");
    expect(plannerMarkup).not.toContain("opacity-0");
    expect(plannerMarkup).toContain('class="relative size-full object-cover"');
  });

  it("keeps a NumberInput inside a narrow full-width field wrapper", () => {
    const markup = renderToStaticMarkup(
      <div className="min-w-0 grid grid-cols-1 md:grid-cols-2">
        <div className="min-w-0">
          <NumberInput label="계정 레벨" nullable fullWidth value={9_999} minValue={1} maxValue={90} onChange={() => {}} />
        </div>
      </div>,
    );

    expect(markup).toContain("grid-cols-1 md:grid-cols-2");
    expect(markup).toContain("max-w-none");
    expect(markup).toContain("계정 레벨");
  });
});
