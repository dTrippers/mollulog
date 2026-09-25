import { describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StudentCard from "~/components/features/students/StudentCard";

function renderStudentCard(props: { checked?: boolean; indeterminate?: boolean; onSelect?: (uid: string) => void }) {
  return renderToStaticMarkup(
    createElement(StudentCard, {
      uid: "student-1",
      name: "학생 하나",
      ...props,
    }),
  );
}

describe("StudentCard selection accessibility", () => {
  test("announces selected and unselected interactive cards as pressed toggle buttons", () => {
    const selectedCard = renderStudentCard({ checked: true, onSelect: () => {} });
    expect(selectedCard).toContain('aria-pressed="true"');
    expect(renderStudentCard({ checked: false, onSelect: () => {} })).toContain('aria-pressed="false"');
  });

  test("announces an indeterminate selection as mixed and omits the state when unchecked", () => {
    expect(renderStudentCard({ checked: false, indeterminate: true, onSelect: () => {} })).toContain(
      'aria-pressed="mixed"',
    );
    expect(renderStudentCard({ onSelect: () => {} })).not.toContain("aria-pressed");
  });
});
