import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudentComparisonSide } from "~/domain/student-comparison";
import StudentComparisonStudentSlot from "~/routes/students.compare._components/StudentComparisonStudentSlot";

function renderSlot(side: StudentComparisonSide, uidError: string | null = null) {
  return renderToStaticMarkup(
    createElement(StudentComparisonStudentSlot, {
      side,
      isMobile: true,
      student: null,
      uidError,
      chooserOpen: false,
      settingsOpen: false,
      settings: null,
      invalidFields: [],
      settingsErrors: [],
      calculatorCatalog: null,
      stats: null,
      calculationFailed: false,
      onOpenChooser: () => undefined,
      onToggleSettings: () => undefined,
      onSettingChange: () => undefined,
      onResetSettings: () => undefined,
    }),
  );
}

describe("StudentComparisonStudentSlot", () => {
  it("names blank slots by side while keeping clear student-selection buttons", () => {
    const left = renderSlot("left");
    const right = renderSlot("right");

    expect(left).toContain('aria-labelledby="left-student-title"');
    expect(left).toContain("첫 번째 학생</h2>");
    expect(left).toContain('aria-label="첫 번째 학생 선택"');
    expect(left).toContain(">학생 선택</button>");
    expect(right).toContain('aria-labelledby="right-student-title"');
    expect(right).toContain("두 번째 학생</h2>");
    expect(right).toContain('aria-label="두 번째 학생 선택"');
    expect(right).toContain(">학생 선택</button>");
  });

  it("keeps invalid student feedback compact in the slot", () => {
    const markup = renderSlot("right", "학생을 찾지 못했어요.");

    expect(markup).toContain('aria-describedby="right-student-slot-error"');
    expect(markup).toContain('id="right-student-slot-error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(">학생 정보 오류</p>");
    expect(markup).not.toContain("다른 학생을 선택해 링크를 바로잡을 수 있어요.");
  });
});
