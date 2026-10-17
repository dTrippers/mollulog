/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import {
  fieldNeedsReview,
  ReviewFieldCell,
  reviewIssueCountOf,
} from "~/routes/scanner.student._components/StudentScanner";

// The student review cell's warning background follows the same predicate as the "⚠ n" count (V7).
const levelField = { resultKey: "level", applyKey: "level", label: "학생 Lv", min: 1, max: 90 } as never;
const getInputProps = () => ({ "data-number-input-flow": "test", onFocus: () => {}, onKeyDown: () => {} }) as never;

function renderLevelCell(detail: object, value: string, current: number | null, confirmed = true) {
  render(
    <ReviewFieldCell
      studentName="케이"
      field={levelField}
      student={{ fieldDetails: { level: detail } } as never}
      state={{ values: { level: value }, confirmed: { level: confirmed } } as never}
      currentState={{ level: current } as never}
      disabled={false}
      getInputProps={getInputProps}
      onValueChange={() => {}}
      initialTier={1}
    />,
  );
  return screen.getByLabelText("케이 학생 Lv 인식 결과") as HTMLInputElement;
}

describe("student review warning", () => {
  it("flags a decreased value with the warning background and keeps the current value out of red", () => {
    const detail = { state: "recognized", confidence: 0.95 };
    const input = renderLevelCell(detail, "70", 79);

    expect(fieldNeedsReview(detail as never, "70", true, 79)).toBe(true);
    expect(input.classList.contains("bg-v2-warning-subtle")).toBe(true);
    expect(screen.getByText("현재 79").classList.contains("text-v2-danger")).toBe(false);
  });

  it("flags a low-accuracy read the same way the count does", () => {
    const detail = { state: "recognized", confidence: 0.5 };
    const input = renderLevelCell(detail, "79", 79);

    expect(fieldNeedsReview(detail as never, "79", true, 79)).toBe(true);
    expect(input.classList.contains("bg-v2-warning-subtle")).toBe(true);
  });

  it("leaves a confirmed, accurate, unchanged value without the background", () => {
    const detail = { state: "recognized", confidence: 0.95 };
    const input = renderLevelCell(detail, "79", 79);

    expect(fieldNeedsReview(detail as never, "79", true, 79)).toBe(false);
    expect(input.classList.contains("bg-v2-warning-subtle")).toBe(false);
  });

  it("counts the same cells that carry the background", () => {
    const keys = [
      "tier",
      "level",
      "weaponLevel",
      "abilityHp",
      "abilityAtk",
      "abilityHeal",
      "skillEx",
      "skillNormal",
      "skillEnhanced",
      "skillSub",
      "equip1",
      "equip2",
      "equip3",
      "equipSpecial",
      "relationshipRank",
    ];
    const applyKeyOf = (key: string) => (key === "relationshipRank" ? "bond" : key);
    const fieldDetails = Object.fromEntries(keys.map((key) => [key, { state: "recognized", confidence: 0.95 }]));
    fieldDetails.level = { state: "recognized", confidence: 0.95 };
    fieldDetails.skillEx = { state: "unknown", confidence: 0 };
    const values = Object.fromEntries(keys.map((key) => [applyKeyOf(key), "1"]));
    const confirmed = Object.fromEntries(keys.map((key) => [applyKeyOf(key), true]));
    values.level = "70";
    confirmed.skillEx = false;
    const current = Object.fromEntries(keys.map((key) => [applyKeyOf(key), 1]));
    current.level = 79;
    const student = { studentUid: "s-1", fieldDetails } as never;
    const state = { values, confirmed } as never;
    const job = { currentStudentStates: { "s-1": current } } as never;

    // "level" is decreased, "skillEx" is an unconfirmed failure: two cells, and the count is two.
    expect(reviewIssueCountOf(student, state, job)).toBe(2);
    expect(fieldNeedsReview(fieldDetails.level as never, "70", true, 79)).toBe(true);
    expect(fieldNeedsReview(fieldDetails.skillEx as never, "1", false, 1)).toBe(true);
  });
});
