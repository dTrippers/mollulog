import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Attack, Defense } from "~/graphql/graphql";
import StudentComparisonTable from "~/routes/students.compare._components/StudentComparisonTable";

const selectedTypes = {
  leftTypes: { attackType: Attack.Explosive, defenseType: Defense.Light },
  rightTypes: { attackType: Attack.Mystic, defenseType: Defense.Heavy },
  leftAdaptations: [
    { key: "street", label: "시가지", rank: "A" },
    { key: "outdoor", label: "야외", rank: "B" },
    { key: "indoor", label: "실내", rank: "S" },
  ] as const,
  rightAdaptations: [
    { key: "street", label: "시가지", rank: "B" },
    { key: "outdoor", label: "야외", rank: "A" },
    { key: "indoor", label: "실내", rank: "SS" },
  ] as const,
};

function renderTable(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(StudentComparisonTable, {
      leftUid: "10000",
      rightUid: "10022",
      leftName: "아루",
      rightName: "히나(수영복)",
      ...selectedTypes,
      leftStats: new Map([ ["ATTACK_POWER", 9426] ]),
      rightStats: new Map([ ["ATTACK_POWER", 9926] ]),
      leftUnavailableReason: null,
      rightUnavailableReason: null,
      ...overrides,
    } as React.ComponentProps<typeof StudentComparisonTable>),
  );
}

describe("StudentComparisonTable", () => {
  it("announces the right student as larger when the right value is greater", () => {
    const markup = renderTable();

    expect(markup).toContain("아루보다 히나(수영복)의 공격력 값이 500 더 큽니다.");
    expect(markup).not.toContain("히나(수영복)보다 아루의 공격력 값이 500 더 큽니다.");
  });

  it("shows student heads, type dots, and terrain icons without comparison differences", () => {
    const markup = renderTable();
    const rows = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row);
    const attackRow = rows.find((row) => row.includes("공격 타입"));
    const defenseRow = rows.find((row) => row.includes("방어 타입"));
    const streetRow = rows.find((row) => row.includes("시가지 적성"));
    const indoorRow = rows.find((row) => row.includes("실내 적성"));

    expect(markup).toContain("아루");
    expect(markup).toContain("히나(수영복)");
    expect(markup).toContain('aria-label="아루 시가지 적성 A"');
    expect(markup).toContain('aria-label="히나(수영복) 실내 적성 SS"');
    expect(attackRow).toContain("신비");
    expect(attackRow).toContain("신비");
    expect(attackRow).toContain("bg-red-500");
    expect(attackRow).toContain("bg-blue-500");
    expect(attackRow).not.toContain("+");
    expect(defenseRow).toContain("경장갑");
    expect(defenseRow).toContain("중장갑");
    expect(defenseRow).not.toContain("+");
    expect(streetRow).not.toContain("+");
    expect(indoorRow).not.toContain("+");
    expect(streetRow).not.toContain(">A</span>");
    expect(indoorRow).not.toContain(">SS</span>");
    expect(streetRow).toContain('aria-label="아루 시가지 적성 A"');
  });

  it("places boundaries after the final terrain row and each numeric section, not before sections", () => {
    const markup = renderTable({ leftStats: new Map(), rightStats: new Map() });
    const rows = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row);
    const attackRow = rows.find((row) => row.includes("공격 타입"));
    const defenseRow = rows.find((row) => row.includes("방어 타입"));
    const indoorRow = rows.find((row) => row.includes("실내 적성"));
    const firstGroupHeading = rows.find((row) => row.includes("주요 능력치"));
    const secondGroupHeading = rows.find((row) => row.includes("명중·치명"));
    const firstNumericGroupEnd = rows.find((row) => row.includes("치유력"));
    const secondNumericGroupEnd = rows.find((row) => row.includes("안정성"));
    const finalNumericRow = rows.find((row) => row.includes("이동 속도"));

    expect(attackRow).toContain("공격 타입");
    expect(attackRow).not.toContain("border-t");
    expect(attackRow).not.toContain("border-b");
    expect(defenseRow).not.toContain("border-b");
    expect(attackRow).toContain("break-keep");
    expect(defenseRow).toContain("break-keep");
    expect(indoorRow).toContain("실내 적성");
    expect((indoorRow ?? "").match(/border-b border-border\/60/g)).toHaveLength(3);
    expect(firstGroupHeading).toContain("주요 능력치");
    expect(firstGroupHeading).not.toContain("border-t");
    expect(secondGroupHeading).toContain("명중·치명");
    expect(secondGroupHeading).not.toContain("border-t");
    expect(firstNumericGroupEnd).toContain("치유력");
    expect((firstNumericGroupEnd ?? "").match(/border-b border-border\/60/g)).toHaveLength(3);
    expect(secondNumericGroupEnd).toContain("안정성");
    expect((secondNumericGroupEnd ?? "").match(/border-b border-border\/60/g)).toHaveLength(3);
    expect(finalNumericRow).toContain("이동 속도");
    expect(finalNumericRow).not.toContain("border-b");
  });

  it("keeps missing selected values distinct from zero and explicitly names invalid students", () => {
    const markup = renderTable({
      leftName: null,
      rightName: "히나(수영복)",
      leftTypes: null,
      leftAdaptations: null,
      leftStats: new Map(),
      rightStats: new Map([
        ["MAX_HP", 0],
        ["ATTACK_POWER", 5],
      ]),
      leftUnavailableReason: "학생 확인 필요",
    });
    const attackRow = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row).find((row) =>
      row.includes("공격 타입"),
    );
    const hpRow = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row).find((row) => row.includes("최대 체력"));
    const defenseRow = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row).find((row) => row.includes("방어력"));

    expect(attackRow).toContain("학생 확인 필요");
    expect(attackRow).toContain("신비");
    expect(hpRow).toContain(">0</span>");
    expect(defenseRow).toContain("학생 확인 필요");
    expect(defenseRow).toContain(">-</span>");
  });

  it("shows a dash for an unavailable terrain value without an invalid-student error", () => {
    const markup = renderTable({ leftAdaptations: null });
    const streetRow = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row).find((row) =>
      row.includes("시가지 적성"),
    );

    expect(streetRow).toContain(">-</span>");
  });

  it("renders only the 22 common numeric rows after the battle information", () => {
    const markup = renderTable({ leftStats: new Map(), rightStats: new Map() });

    expect(Array.from(markup.matchAll(/<th scope="row"/g))).toHaveLength(27);
    expect(markup).not.toContain("추가 효과");
    expect(markup).not.toContain("일반 공격 강화");
    expect(markup).not.toContain("치유 비율");
    expect(markup).not.toContain("버프 지속시간 증가");
    expect(markup).not.toContain("MAX_BULLET_COUNT");
    expect(markup).not.toContain("IGNORE_DELAY_COUNT");
  });

  it("keeps table headings below the mobile page header and student screen tabs", () => {
    const markup = renderTable();

    expect(markup).toContain("top-[3.25rem]");
    expect(markup).toContain("lg:top-0");
  });
});
