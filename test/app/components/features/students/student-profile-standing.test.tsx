import { describe, expect, it } from "@jest/globals";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { StudentProfileFacts } from "~/components/v2/features/students/StudentProfileFacts";

type StudentProfileStudent = ComponentProps<typeof StudentProfileFacts>["student"];

const student = {
  club: null,
  catalog: null,
  character: { uid: "character-1", studentVariants: [] },
  studentVariant: {
    uid: "variant-1",
    isMulticlass: false,
    primaryStudent: { uid: "student-1", name: "학생" },
    students: [],
  },
  interactionFurnitures: [],
} as unknown as StudentProfileStudent;

function render(props: Omit<ComponentProps<typeof StudentProfileFacts>, "student">) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StudentProfileFacts student={student} {...props} />
    </MemoryRouter>,
  );
}

describe("Student profile standing illustration", () => {
  it.each([false, true])("offers the expanded illustration beside the backdrop (compact: %s)", (compact) => {
    const markup = render({ compact, standing: { uid: "10000", name: "리쿠하치마 아루" } });

    expect(markup).toContain("/images/students/standing/10000.webp");
    expect(markup).toContain('aria-label="일러스트 크게 보기"');
  });

  it("shows neither the backdrop nor the button without a standing student", () => {
    const markup = render({});

    expect(markup).not.toContain("/images/students/standing/");
    expect(markup).not.toContain("일러스트 크게 보기");
  });
});
