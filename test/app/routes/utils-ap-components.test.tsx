import { describe, expect, it, jest } from "@jest/globals";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Input, NumberInput } from "~/components/primitives";
import { calculateApPlannerEvent, type ApPlannerEvent } from "~/domain/ap-planner";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import ApTimelineEvent from "~/routes/utils.ap._components/ApTimelineEvent";
import ApStockpileSteps from "~/routes/utils.ap._components/ApStockpileSteps";
import { ApPlannerConditionsPanelContent } from "~/routes/utils.ap._components/ApPlannerConditionsPanel";

const event: ApPlannerEvent = {
  timelineUid: "event-1",
  name: "테스트 이벤트",
  startAt: "2026-09-30T02:00:00.000Z",
  endAt: "2026-10-13T01:59:00.000Z",
  exchangeUntil: "2026-10-20T01:59:00.000Z",
  requiredAp: 16_500,
  requiredBreakdown: { firstClearAp: 1_000, questSweepAp: 15_000, extraSweepAp: 500 },
};

function renderCard(props: Partial<ComponentProps<typeof ApTimelineEvent>> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ApTimelineEvent
        event={event}
        calculation={null}
        shopTargetExists={false}
        plan={null}
        conditions={{ accountLevel: null, cafeRank: null, comfort: null }}
        options={defaultPyroxenePlannerOptions}
        onAddPlan={jest.fn()}
        onRemovePlan={jest.fn()}
        onSaveAccessAt={jest.fn()}
        onApplyException={jest.fn()}
        onRemoveException={jest.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("AP planner event card", () => {
  it("renders a zero-target event compactly without showing zero or allowing a plan", () => {
    const markup = renderCard();

    expect(markup).toContain("상점 계산기에서 목표를 정하면 필요 AP를 계산해요");
    expect(markup).toContain("상점 계산기");
    expect(markup).not.toContain("0 AP");
    expect(markup).not.toContain("AP 모으기 계획에 추가");
  });

  it("keeps a planned zero-target event visible with an explicit removal action", () => {
    const markup = renderCard({ plan: { accessAt: null } });

    expect(markup).toContain("상점 목표가 없어 AP 모으기 계산을 할 수 없어요.");
    expect(markup).toContain("계획에서 빼기");
    expect(markup).not.toMatch(/<button[^>]*>AP 모으기 계획에 추가<\/button>/);
    expect(markup).not.toContain("0 AP");
  });

  it.each([
    { conditions: { accountLevel: null, cafeRank: 8, comfort: 4_500 } },
    { conditions: { accountLevel: 85, cafeRank: null, comfort: null } },
  ])("shows an input prompt without supply numbers when level or cafe rank is missing", ({ conditions }) => {
    const calculation = calculateApPlannerEvent({
      event,
      conditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const markup = renderCard({
      calculation,
      shopTargetExists: true,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      conditions,
    });

    expect(markup).toContain("플레이 조건을 입력하면 확보 가능한 AP를 계산해요.");
    expect(markup).not.toContain("확보 가능한 AP</p>");
    expect(markup).not.toContain("계산 근거");
    expect(calculation.availableAp).toBeNull();
    expect(calculation.supplyBreakdown).toBeNull();
    expect(calculation.stockpileSteps).toEqual([]);
  });

  it("keeps calculation conditions collapsed and merges the available AP into the access step", () => {
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: { ...defaultPyroxenePlannerOptions.consumption, apChargeCount: 3 },
    };
    const calculation = calculateApPlannerEvent({
      event,
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options,
    });
    const markup = renderToStaticMarkup(
      <ApStockpileSteps
        calculation={calculation}
        conditions={{ accountLevel: 85, cafeRank: 8, comfort: 4_500 }}
        options={options}
        eventEndAt={event.endAt}
        initialExpanded
      />,
    );

    expect(markup).toContain("AP 모으기");
    expect(markup).toContain("부터 · 접속 시 약");
    expect(markup).toMatch(/aria-expanded="false"[^>]*>계산 조건 확인/);
    expect(markup).toContain("계산 방식 및 계정 상태에 따라 정확하지 않을 수 있어요.");
    expect(markup.match(/계산 조건 확인/g)).toHaveLength(1);
    expect(markup).toContain("D-1 AP 사용 가정 안내");
    expect(markup).toContain("break-keep");
    expect(markup).not.toContain("최대 AP 230 (계정 레벨 85)");
    expect(markup).toContain("사용 가능 약 1,120 AP");
    expect(markup.match(/사용 가능 약 [\d,]+ AP/g)).toHaveLength(1);
    expect(markup).not.toContain("접기⌄");
  });

  it("keeps an applied refill visible after it removes the deficit", () => {
    const conditions = { accountLevel: 85, cafeRank: 8, comfort: 4_500 };
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
    const markup = renderCard({
      calculation: appliedCalculation,
      conditions,
      options,
      plan: { accessAt },
      shopTargetExists: true,
    });

    expect(appliedCalculation.resultAp).toBeGreaterThanOrEqual(0);
    expect(markup).toContain("적용됨");
    expect(markup).toContain("되돌리기");
    expect(markup).toContain(
      `+${suggestion.additionalAp.toLocaleString()} AP · 청휘석 ${suggestion.pyroxeneCost.toLocaleString()}개 · 적용 후`,
    );
    expect(markup).toContain("청휘석 플래너에도 반영돼요");
    expect(markup).not.toContain("적용하면");
    expect(markup).not.toMatch(/<button[^>]*>적용<\/button>/);
  });

  it("uses one primary and one secondary action for the two additional refill suggestions", () => {
    const conditions = { accountLevel: 85, cafeRank: 8, comfort: 4_500 };
    const calculation = calculateApPlannerEvent({
      event: { ...event, requiredAp: 100_000 },
      conditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const markup = renderCard({ calculation, conditions, plan: { accessAt: "2026-09-30T03:00:00.000Z" }, shopTargetExists: true });
    const applyClasses = [...markup.matchAll(/<button[^>]*class="([^"]+)"[^>]*>적용<\/button>/g)].map(
      (match) => match[1],
    );

    expect(calculation.refillSuggestions).toHaveLength(2);
    expect(applyClasses).toHaveLength(2);
    expect(applyClasses[0]).toContain("bg-primary");
    expect(applyClasses[1]).toContain("bg-card");
    expect(markup).toContain("AP 모으는 날(9/30) AP 충전");
    expect(markup).toMatch(/AP 모으는 날\(9\/30\) AP 충전 \d+회/);
  });

  it("shows the overlapping-exception resolution link when refill suggestions are blocked", () => {
    const conditions = { accountLevel: 85, cafeRank: 8, comfort: 4_500 };
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: {
        ...defaultPyroxenePlannerOptions.consumption,
        apChargeExceptions: [{ uid: "existing", startDate: "2026-10-02", endDate: "2026-10-03", count: 1 }],
      },
    };
    const calculation = calculateApPlannerEvent({
      event: { ...event, requiredAp: 100_000 },
      conditions,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options,
    });
    const markup = renderCard({
      calculation,
      conditions,
      options,
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      shopTargetExists: true,
    });

    expect(calculation.refillOverlapConflict).toBe(true);
    expect(markup).toContain("추가 확보");
    expect(markup).toContain("기간별 AP 충전 예외가 겹쳐 적용할 수 없어요.");
    expect(markup).toContain("청휘석 플래너에서 기존 예외를 먼저 수정해주세요.");
  });

  it("associates every condition and access-time input with its visible label", () => {
    const labels = ["계정 레벨", "카페 랭크", "편의성", "매일 충전 횟수", "날짜", "시간"];
    const markup = renderToStaticMarkup(
      <>
        <NumberInput label="계정 레벨" value={85} minValue={1} maxValue={90} onChange={() => {}} />
        <NumberInput label="카페 랭크" value={8} minValue={1} maxValue={10} onChange={() => {}} />
        <NumberInput label="편의성" value={4_500} minValue={0} maxValue={4_500} onChange={() => {}} />
        <NumberInput label="매일 충전 횟수" value={3} minValue={0} maxValue={20} onChange={() => {}} />
        <Input label="날짜" type="date" value="" onChange={() => {}} />
        <Input label="시간" type="time" value="" onChange={() => {}} />
      </>,
    );

    for (const label of labels) {
      const match = markup.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`));
      expect(match).not.toBeNull();
      expect(markup).toContain(`id="${match?.[1]}"`);
    }
  });

  it("keeps narrow mobile statistic values padded and result words intact", () => {
    const calculation = calculateApPlannerEvent({
      event: { ...event, requiredAp: 12_345 },
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const markup = renderCard({
      calculation,
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      shopTargetExists: true,
    });

    expect(markup.match(/class="min-w-0 p-2 md:p-3"/g)).toHaveLength(6);
    expect(markup).toContain("text-sm min-[390px]:text-base md:text-lg");
    expect(markup).toContain("12,345");
    expect(markup).toContain("flex min-w-0 flex-wrap gap-x-1 text-sm font-semibold tabular-nums md:text-base");
    expect(markup).toMatch(/<span class="whitespace-nowrap">\d[\d,]*<\/span><span class="whitespace-nowrap">(?:부족|여유)<\/span>/);
  });

  it("reports AP charge exceptions that overlap the stockpile-to-event window", () => {
    const options = {
      ...defaultPyroxenePlannerOptions,
      consumption: {
        ...defaultPyroxenePlannerOptions.consumption,
        apChargeExceptions: [
          { uid: "inside", startDate: "2026-10-01", endDate: "2026-10-02", count: 4 },
          { uid: "outside", startDate: "2026-11-01", endDate: "2026-11-02", count: 5 },
        ],
      },
    };
    const calculation = calculateApPlannerEvent({
      event,
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options,
    });
    const markup = renderToStaticMarkup(
      <ApStockpileSteps
        calculation={calculation}
        conditions={{ accountLevel: 85, cafeRank: 8, comfort: 4_500 }}
        options={options}
        eventEndAt={event.endAt}
        initialExpanded
        initialConditionsExpanded
      />,
    );

    expect(markup).toContain("매일 AP 충전은 청휘석 플래너의 0회 설정(예외 1건 반영)을 사용해요.");
  });

  it("labels sparse preparation rows by their calendar-day distance from access", () => {
    const calculation = calculateApPlannerEvent({
      event,
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-10-05T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
      previousPlannedEvents: [
        { name: "앞 이벤트", startAt: "2026-09-20T02:00:00.000Z", endAt: "2026-10-01T03:00:00.000Z" },
      ],
    });
    const sparseCalculation = {
      ...calculation,
      stockpileStartsAt: "2026-10-01T03:00:00.000Z",
      stockpileSteps: [
        { at: "2026-10-01T03:00:00.000Z", label: "AP 모으기 시작", ap: 0, kind: "drain" as const },
        { at: "2026-10-03T03:00:00.000Z", label: "자연 회복이 최대 AP에 도달", ap: 230, kind: "natural" as const },
        { at: "2026-10-05T03:00:00.000Z", label: "접속", ap: 830, kind: "access" as const },
      ],
    };
    const markup = renderToStaticMarkup(
      <ApStockpileSteps
        calculation={sparseCalculation}
        conditions={{ accountLevel: 85, cafeRank: 8, comfort: 4_500 }}
        options={defaultPyroxenePlannerOptions}
        eventEndAt={event.endAt}
        initialExpanded
      />,
    );

    expect(markup).toContain("10/1 (목) · D-4");
    expect(markup).toContain("10/3 (토) · D-2");
    expect(markup).toContain("10/5 (월) · 시작");
  });

  it("shows the unverified 999 caution when a stockpile refill would reach the threshold", () => {
    const calculation = calculateApPlannerEvent({
      event: { ...event, requiredAp: 100_000 },
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      currentAt: "2026-09-27T00:00:00.000Z",
      options: defaultPyroxenePlannerOptions,
    });
    const suggestion = calculation.refillSuggestions.find(({ kind }) => kind === "stockpile-day");
    expect(suggestion).toBeDefined();
    expect((calculation.supplyBreakdown?.stockpile ?? 0) + (suggestion?.additionalAp ?? 0)).toBeGreaterThanOrEqual(999);

    const markup = renderCard({
      calculation,
      conditions: { accountLevel: 85, cafeRank: 8, comfort: 4_500 },
      plan: { accessAt: "2026-09-30T03:00:00.000Z" },
      shopTargetExists: true,
    });

    expect(markup).toContain('aria-label="AP 999 이상 보유 시 충전 주의"');
    expect(markup).toContain("보유 AP가 999 이상이면 충전하지 못할 수 있어요(미확인 정보)");
  });

  it("shows a loading placeholder in the play-conditions panel while the guest snapshot loads", () => {
    const markup = renderToStaticMarkup(
      <ApPlannerConditionsPanelContent
        ready={false}
        loading
        state={{ accountLevel: null, cafeRank: null, comfort: null, eventPlans: {} }}
        options={defaultPyroxenePlannerOptions}
        onSave={() => {}}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("플레이 조건을 불러오고 있어요.");
    expect(markup).not.toContain("tone-destructive");
    expect(markup).not.toContain("플레이 조건을 불러오지 못했어요.");
  });
});
