import { describe, expect, it, jest } from "@jest/globals";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import PyroxeneCalculationAssumptions from "~/components/features/futures/PyroxeneCalculationAssumptions";
import PyroxeneCalculationMethodSheet from "~/components/features/futures/PyroxeneCalculationMethodSheet";
import {
  PYROXENE_PICKUP_CHANCE_OPTIONS,
  RECRUITMENT_PERK_TEN_PULL_THRESHOLDS,
  type PyroxeneCalculationAssumptions as CalculationAssumptions,
} from "~/domain/pyroxene-assumptions";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { RecruitmentTypeEnum } from "~/graphql/graphql";

jest.mock("~/components/primitives/BottomSheet", () => {
  const { createElement: element } = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: ({
      children,
      description,
      open,
      title,
    }: {
      children: ReactNode;
      description?: string;
      open?: boolean;
      title: string;
    }) =>
      open
        ? element("section", { "aria-label": title }, description ? element("p", null, description) : null, children)
        : null,
  };
});

const from = new Date("2026-10-08T00:00:00.000Z");

function sampleScheduleItems(): PyroxeneScheduleItem[] {
  return [
    {
      event: {
        uid: "rework-event",
        name: "개편 이벤트",
        since: new Date("2026-10-09T00:00:00.000Z"),
        until: new Date("2026-10-15T00:00:00.000Z"),
        earnablePyroxene: null,
        tags: ["recruit_free_100"],
        recruitmentRuleSet: "call_charge_v1",
        recruitments: [
          {
            recruitmentType: RecruitmentTypeEnum.Usual,
            pickup: true,
            rerun: false,
            until: "2026-10-15T00:00:00.000Z" as NonNullable<
              PyroxeneScheduleItem["event"]
            >["recruitments"][number]["until"],
            student: { uid: "student-a", name: "학생A", initialTier: 3 },
            favorited: true,
          },
        ],
      },
    },
  ];
}

function sampleAssumptions(overrides: Partial<CalculationAssumptions> = {}): CalculationAssumptions {
  return {
    recruitmentRule: { kind: "mixed", firstReworkEventName: "개편 이벤트" },
    pickupChance: "average_pity",
    showsRange: true,
    recruitmentPerks: true,
    freeRecruitment: true,
    ...overrides,
  };
}

function renderMethodSheet(overrides: Partial<ComponentProps<typeof PyroxeneCalculationMethodSheet>> = {}) {
  const assumptions = overrides.assumptions ?? sampleAssumptions();
  return renderToStaticMarkup(
    <MemoryRouter>
      <PyroxeneCalculationMethodSheet
        open
        onClose={() => undefined}
        onExited={() => undefined}
        assumptions={assumptions}
        showRange
        description="그래프와 타임라인의 청휘석을 이렇게 계산해요"
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("PyroxeneCalculationAssumptions", () => {
  it("renders two icon-free plain-text items in order beside the method button", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PyroxeneCalculationAssumptions
          scheduleItems={sampleScheduleItems()}
          pickupChance="average_pity"
          from={from}
          showRange
          onChangePickupChance={() => undefined}
        />
      </MemoryRouter>,
    );
    const list = html.match(/<ul aria-label="계산 가정" class="[^"]*">(.*?)<\/ul>/s)?.[1];
    const items = list?.match(/<li class="([^"]*)">(.*?)<\/li>/gs) ?? [];

    expect(html).toContain('aria-label="계산 가정"');
    expect(items).toHaveLength(2);
    expect(items[0]).toContain(">모집 개편 반영</li>");
    expect(items[1]).toContain(">계산 기준: 평균 (천장 반영)</li>");
    for (const item of items) {
      expect(item).not.toContain("<svg");
      expect(item).not.toMatch(/(?:^|[\s"'])(?:px-|py-|rounded|bg-|border|shadow)/);
      expect(item).toContain("whitespace-nowrap");
      expect(item).toContain("text-sm");
      expect(item).toContain("text-muted-foreground");
    }
    expect(html).toContain("계산 방식");
    const methodButton = html.match(/<button\b[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/s);
    expect(methodButton?.[1]).toContain("text-xs");
    expect(methodButton?.[1]).toContain("bg-card");
    expect(methodButton?.[1]).toContain("dark:bg-muted");
    expect(methodButton?.[1]).toContain("shrink-0");
    expect(methodButton?.[2]).toContain("<svg");
    expect(html.match(/\bbg-card\b/g)).toHaveLength(1);
    expect(html.match(/\bdark:bg-muted\b/g)).toHaveLength(1);
    expect(html).not.toContain("truncate");
    expect(html).not.toContain("상위 10%");
    expect(html).not.toContain("모집 특전");
    expect(html).not.toContain("무료 모집");
  });

  it("places the integrated-planner lead label outside the list and uses its accessible label", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PyroxeneCalculationAssumptions
          scheduleItems={sampleScheduleItems()}
          pickupChance="ceil"
          from={from}
          showRange={false}
          leadLabel="청휘석 예상"
          changePickupChanceTo="/utils/pyroxene"
          sheetDescription="달력의 청휘석 예상 재화를 이렇게 계산해요"
        />
      </MemoryRouter>,
    );

    const leadIndex = html.indexOf("청휘석 예상");
    const listIndex = html.indexOf('<ul aria-label="청휘석 계산 가정"');
    expect(leadIndex).toBeGreaterThanOrEqual(0);
    expect(leadIndex).toBeLessThan(listIndex);
    expect(html).toContain('aria-label="청휘석 계산 가정"');
  });
});

describe("PyroxeneCalculationMethodSheet", () => {
  it("shows all sections, a quiet rule label in the heading, the mixed explanation, and the selected mode", () => {
    const html = renderMethodSheet();
    const ruleSection = html.match(/<section class="space-y-1">.*?<\/section>/s)?.[0] ?? "";
    const normalizedHtml = html.replace(/\s+/g, " ");

    expect(html).toContain("그래프와 타임라인의 청휘석을 이렇게 계산해요");
    expect(html).toContain("모집 규칙");
    expect(ruleSection).toMatch(/<h3 class="font-semibold">모집 규칙<\/h3><span class="[^"]*text-xs[^"]*text-primary[^"]*">모집 개편 반영<\/span>/);
    expect(ruleSection).not.toContain("<svg");
    expect(html).toContain("개편 이벤트부터 개편 후 규칙으로 계산해요.");
    expect(html).toContain("개편 전 규칙에서는 200회마다 픽업 학생과 교환할 수 있다고 보고 계산해요.");
    expect(html).toContain("개편 후 규칙에서는 픽업 학생이 나오기 전까지 100회째 모집에서 50% 확률로, 200회째 모집에서 반드시 픽업 학생을 얻어요.");
    expect(html).toContain("★3 학생 모집 목표");
    expect(html).toContain("평균 (천장 미반영)");
    expect(html).toContain("픽업 확률만으로 계산한 평균 모집 횟수를 써요.");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("사용 중");
    expect(html).toContain("이벤트에 예상 모집 횟수를 직접 입력했다면 그 횟수로 계산해요.");
    expect(html).toContain("예상 범위");
    expect(html).toContain("실제 결과가 이 범위를 벗어날 확률은 약 20%예요.");
    expect(html).toContain("모집 특전과 무료 모집");
    expect(normalizedHtml).toContain(
      `누적 ${RECRUITMENT_PERK_TEN_PULL_THRESHOLDS.join(", ")}회째에 받는 10회 모집권을 바로 쓴다고 보고 계산해요.`,
    );
    expect(html).toContain("무료 모집 100회가 있는 이벤트는 그만큼 청휘석을 덜 쓰는 것으로 계산해요.");
    expect(html).not.toContain("차지");
  });

  it("uses the ceiling-only range explanation and omits range when disabled", () => {
    const ceilingHtml = renderMethodSheet({
      assumptions: sampleAssumptions({ pickupChance: "ceil", showsRange: false }),
    });
    expect(ceilingHtml).toContain("천장 모드는 천장까지 모집하는 경우만 계산하므로 범위를 표시하지 않아요.");

    const hiddenRangeHtml = renderMethodSheet({ showRange: false });
    expect(hiddenRangeHtml).not.toContain("예상 범위");
  });

  it("omits the inline rule label for no eligible pickup event", () => {
    const html = renderMethodSheet({ assumptions: sampleAssumptions({ recruitmentRule: { kind: "none" } }) });
    const ruleSection = html.match(/<section class="space-y-1">.*?<\/section>/s)?.[0] ?? "";

    expect(ruleSection).toContain("계산할 픽업 모집이 아직 없어요.");
    expect(ruleSection).not.toContain("text-primary");
    expect(ruleSection).not.toContain("<svg");
  });

  it("links to the pyroxene planner for integrated-planner settings and supports all goal labels", () => {
    const html = renderMethodSheet({
      onChangePickupChance: undefined,
      changePickupChanceTo: "/utils/pyroxene",
    });

    expect(html).toContain('href="/utils/pyroxene"');
    for (const { label, description } of PYROXENE_PICKUP_CHANCE_OPTIONS) {
      expect(html).toContain(label);
      expect(html).toContain(description);
    }
  });
});
