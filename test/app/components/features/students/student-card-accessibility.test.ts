import { describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StudentCard from "~/components/features/students/StudentCard";
import { HaloModeProvider } from "~/contexts/HaloModeContext";

function renderStudentCard(
  props: { checked?: boolean; indeterminate?: boolean; onSelect?: (uid: string) => void },
  haloMode = false,
) {
  return renderToStaticMarkup(
    createElement(
      HaloModeProvider,
      { value: { haloMode, setHaloMode: () => {} } },
      createElement(StudentCard, {
        uid: "student-1",
        name: "학생 하나",
        ...props,
      }),
    ),
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

  test("guards card hover scaling and keeps transitions off the halo portrait frame", () => {
    const haloMarkup = renderStudentCard({ onSelect: () => {} }, true);
    const frameClassName = haloMarkup.match(/<span class="([^"]*aspect-\[200\/226\][^"]*)"/)?.[1] ?? "";
    expect(haloMarkup).toContain("[@media(hover:hover)_and_(pointer:fine)]:hover:scale-105");
    expect(frameClassName).not.toMatch(/\btransition(?:-[^\s]*)?\b/);

    const regularMarkup = renderStudentCard({ onSelect: () => {} });
    expect(regularMarkup).toContain('class="w-full h-full object-cover transition"');
  });
});
