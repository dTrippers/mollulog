import { describe, expect, it } from "@jest/globals";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { StudentProfileFacts } from "~/components/v2/features/students/StudentProfileFacts";
import { shouldOpenPopoverFromFocus } from "~/components/v2/features/furniture/FurnitureInteractionStudentsPopover";

type StudentProfileStudent = ComponentProps<typeof StudentProfileFacts>["student"];

function studentWithInteractionFurnitures(
  interactionFurnitures: StudentProfileStudent["interactionFurnitures"],
): StudentProfileStudent {
  return {
    uid: "student-1",
    name: "학생",
    school: "Abydos",
    attackType: "explosive",
    defenseType: "light",
    role: "striker",
    position: "front",
    tacticRole: "attacker",
    club: null,
    catalog: null,
    character: { uid: "character-1", studentVariants: [] },
    studentVariant: {
      uid: "variant-1",
      isMulticlass: false,
      primaryStudent: { uid: "student-1", name: "학생" },
      students: [],
    },
    interactionFurnitures,
  } as StudentProfileStudent;
}

function renderProfileFacts(interactionFurnitures: StudentProfileStudent["interactionFurnitures"]) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StudentProfileFacts student={studentWithInteractionFurnitures(interactionFurnitures)} />
    </MemoryRouter>,
  );
}

describe("Furniture interaction students popover input modality", () => {
  it("does not treat Escape focus return as a fresh keyboard focus open", () => {
    expect(
      shouldOpenPopoverFromFocus({
        closing: true,
        pointerOrClickInteraction: false,
        focusVisible: true,
      }),
    ).toBe(false);
  });

  it("ignores pointer and click focus while keeping keyboard focus eligible", () => {
    expect(
      shouldOpenPopoverFromFocus({
        closing: false,
        pointerOrClickInteraction: true,
        focusVisible: true,
      }),
    ).toBe(false);
    expect(
      shouldOpenPopoverFromFocus({
        closing: false,
        pointerOrClickInteraction: false,
        focusVisible: true,
      }),
    ).toBe(true);
  });
});

describe("Student profile interaction furniture section", () => {
  it("renders the label and icon without inline furniture-name text", () => {
    const markup = renderProfileFacts([
      {
        uid: "beach-chair",
        name: "해변 의자 세트",
        imageUrl: "https://assets.test/furniture.webp",
        rarity: 3,
      },
    ]);

    expect(markup).toContain("상호작용 가구");
    expect(markup).toContain('alt="해변 의자 세트"');
    expect(markup).not.toMatch(/>해변 의자 세트</);
    expect(markup).toContain("/furnitures/beach-chair.webp");
  });

  it("makes each furniture a name button without a title", () => {
    const markup = renderProfileFacts([
      {
        uid: "beach-chair",
        name: "해변 의자 세트",
        imageUrl: "https://assets.test/furniture.webp",
        rarity: 3,
      },
    ]);

    expect(markup).toContain('aria-label="해변 의자 세트 이름 표시"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('title="해변 의자 세트"');
  });

  it("omits the section when the student has no interaction furniture", () => {
    const markup = renderProfileFacts([]);

    expect(markup).not.toContain("상호작용 가구");
  });
});
