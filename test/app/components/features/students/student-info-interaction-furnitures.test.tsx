import { describe, expect, it } from "@jest/globals";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import StudentInfo from "~/components/features/students/StudentInfo";
import {
  clickPopoverButtonProgrammatically,
  shouldOpenPopoverFromFocus,
} from "~/components/features/furniture/FurnitureInteractionStudentsPopover";

type StudentInfoStudent = ComponentProps<typeof StudentInfo>["student"];

function studentWithInteractionFurnitures(
  interactionFurnitures: StudentInfoStudent["interactionFurnitures"],
): StudentInfoStudent {
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
  } as StudentInfoStudent;
}

function renderStudentInfo(interactionFurnitures: StudentInfoStudent["interactionFurnitures"]) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StudentInfo student={studentWithInteractionFurnitures(interactionFurnitures)} />
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

describe("StudentInfo interaction furniture section", () => {
  it("renders the label and icon without an inline furniture name", () => {
    const markup = renderStudentInfo([
      {
        uid: "beach-chair",
        name: "해변 의자 세트",
        imageUrl: "https://assets.test/furniture.webp",
        rarity: 3,
      },
    ]);

    expect(markup).toContain("상호작용 가구");
    expect(markup).not.toContain("해변 의자 세트");
    expect(markup).toContain('src="https://assets.test/furniture.webp"');
  });

  it("omits the section when the student has no interaction furniture", () => {
    const markup = renderStudentInfo([]);

    expect(markup).not.toContain("상호작용 가구");
  });
});
