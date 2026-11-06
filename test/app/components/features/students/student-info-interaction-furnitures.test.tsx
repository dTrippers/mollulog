import { describe, expect, it } from "@jest/globals";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { StudentProfileFacts } from "~/components/v2/features/students/StudentProfileFacts";
import {
  clickPopoverButtonProgrammatically,
  shouldOpenPopoverFromFocus,
} from "~/components/features/furniture/FurnitureInteractionStudentsPopover";

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
  it("does not treat the programmatic click's focus as keyboard focus after its click handler consumes the marker", () => {
    const syntheticClickRef = { current: false };
    const activatingRef = { current: false };
    let shouldOpenFromFocus = true;

    clickPopoverButtonProgrammatically(
      {
        click() {
          expect(activatingRef.current).toBe(true);
          expect(syntheticClickRef.current).toBe(true);
          // Headless UI composes the user's click handler before focusing the button.
          syntheticClickRef.current = false;
          shouldOpenFromFocus = shouldOpenPopoverFromFocus({
            activating: activatingRef.current,
            syntheticClick: syntheticClickRef.current,
            pointerOrClickInteraction: false,
            focusVisible: true,
          });
        },
      },
      syntheticClickRef,
      activatingRef,
    );

    expect(shouldOpenFromFocus).toBe(false);
    expect(syntheticClickRef.current).toBe(false);
    expect(activatingRef.current).toBe(false);
  });

  it("ignores pointer and click focus while keeping keyboard focus eligible", () => {
    expect(
      shouldOpenPopoverFromFocus({
        activating: false,
        syntheticClick: false,
        pointerOrClickInteraction: true,
        focusVisible: true,
      }),
    ).toBe(false);
    expect(
      shouldOpenPopoverFromFocus({
        activating: false,
        syntheticClick: false,
        pointerOrClickInteraction: false,
        focusVisible: true,
      }),
    ).toBe(true);
  });

  it("clears activation flags even when programmatic click throws", () => {
    const syntheticClickRef = { current: false };
    const activatingRef = { current: false };

    expect(() =>
      clickPopoverButtonProgrammatically(
        {
          click() {
            throw new Error("click failed");
          },
        },
        syntheticClickRef,
        activatingRef,
      ),
    ).toThrow("click failed");
    expect(syntheticClickRef.current).toBe(false);
    expect(activatingRef.current).toBe(false);
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

  it("omits the section when the student has no interaction furniture", () => {
    const markup = renderProfileFacts([]);

    expect(markup).not.toContain("상호작용 가구");
  });
});
