import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Attack, Defense } from "~/graphql/graphql";
import StudentComparisonTable from "~/routes/students.compare._components/StudentComparisonTable";

const selectedTypes = {
  leftTypes: { attackType: Attack.Explosive, defenseType: Defense.Light },
  rightTypes: { attackType: Attack.Mystic, defenseType: Defense.Heavy },
};

describe("StudentComparisonTable", () => {
  it("announces the right student as larger when the right value is greater", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentComparisonTable, {
        leftName: "아루",
        rightName: "히나(수영복)",
        ...selectedTypes,
        leftStats: new Map([["ATTACK_POWER", 9426]]),
        rightStats: new Map([["ATTACK_POWER", 9926]]),
        leftUnavailableReason: null,
        rightUnavailableReason: null,
      }),
    );

    expect(markup).toContain("아루보다 히나(수영복)의 공격력 값이 500 더 큽니다.");
    expect(markup).not.toContain("히나(수영복)보다 아루의 공격력 값이 500 더 큽니다.");
  });

  it("renders attack and defense types as categorical rows before numeric stats without differences", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentComparisonTable, {
        leftName: "아루",
        rightName: "히나(수영복)",
        ...selectedTypes,
        leftStats: new Map([["ATTACK_POWER", 9426]]),
        rightStats: new Map([["ATTACK_POWER", 9926]]),
        leftUnavailableReason: null,
        rightUnavailableReason: null,
      }),
    );
    const rows = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row);
    const attackRow = rows.find((row) => row.includes("공격 타입"));
    const defenseRow = rows.find((row) => row.includes("방어 타입"));
    const numericGroupRow = rows.find((row) => row.includes("주요 능력치"));

    expect(attackRow).toContain("폭발");
    expect(attackRow).toContain("신비");
    expect(attackRow).toContain("bg-red-500");
    expect(attackRow).toContain("bg-blue-500");
    expect(attackRow).not.toContain("+");
    expect(defenseRow).toContain("경장갑");
    expect(defenseRow).toContain("중장갑");
    expect(defenseRow).toContain("bg-red-500");
    expect(defenseRow).toContain("bg-yellow-500");
    expect(defenseRow).not.toContain("+");
    expect(markup.indexOf("공격 타입")).toBeLessThan(markup.indexOf("방어 타입"));
    expect(markup.indexOf("방어 타입")).toBeLessThan(markup.indexOf("주요 능력치"));
  });

  it("keeps invalid and unselected student categories explicit", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentComparisonTable, {
        leftName: null,
        rightName: null,
        leftTypes: null,
        rightTypes: null,
        leftStats: null,
        rightStats: null,
        leftUnavailableReason: "학생 확인 필요",
        rightUnavailableReason: null,
      }),
    );
    const attackRow = Array.from(markup.matchAll(/<tr>(.*?)<\/tr>/g), ([row]) => row).find((row) =>
      row.includes("공격 타입"),
    );

    expect(attackRow).toContain("학생 확인 필요");
    expect(attackRow).toContain("학생 선택");
  });
});
