/** @jest-environment jsdom */
import "../../v2/layout/layout-test-polyfills";
import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { StudentProfileFacts } from "~/components/v2/features/students/StudentProfileFacts";

afterEach(cleanup);

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

const standing = { uid: "10000", name: "리쿠하치마 아루" };

function renderFacts(props: Omit<ComponentProps<typeof StudentProfileFacts>, "student">) {
  return render(
    <MemoryRouter>
      <StudentProfileFacts student={student} {...props} />
    </MemoryRouter>,
  );
}

function backdropImage(container: HTMLElement) {
  return container.querySelector<HTMLImageElement>('img[src$="/images/students/standing/10000.webp"]');
}

const expandLabel = "일러스트 크게 보기";

describe("Student profile standing illustration", () => {
  it.each([false, true])("offers the expand button once the illustration has loaded (compact: %s)", (compact) => {
    const { container } = renderFacts({ compact, standing });
    const image = backdropImage(container);

    expect(image).not.toBeNull();
    expect(screen.queryByRole("button", { name: expandLabel })).toBeNull();
    fireEvent.load(image as HTMLImageElement);
    expect(screen.getByRole("button", { name: expandLabel })).not.toBeNull();
  });

  it("leaves out the backdrop and the button when the illustration fails", () => {
    const { container } = renderFacts({ standing });

    fireEvent.error(backdropImage(container) as HTMLImageElement);
    expect(backdropImage(container)).toBeNull();
    expect(screen.queryByRole("button", { name: expandLabel })).toBeNull();
  });

  it("opens the whole illustration in an untitled dialog and closes it", async () => {
    const { container } = renderFacts({ standing });

    fireEvent.load(backdropImage(container) as HTMLImageElement);
    fireEvent.click(screen.getByRole("button", { name: expandLabel }));

    const dialog = await screen.findByRole("dialog", { name: "리쿠하치마 아루 일러스트" });
    const image = dialog.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("리쿠하치마 아루 스탠딩 일러스트");
    expect(image?.getAttribute("src")).toContain("/images/students/standing/10000.webp");
    expect(dialog.querySelector("h2")?.className).toContain("sr-only");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows neither the backdrop nor the button without a standing student", () => {
    const { container } = renderFacts({});

    expect(container.querySelector('img[src*="/images/students/standing/"]')).toBeNull();
    expect(screen.queryByRole("button", { name: expandLabel })).toBeNull();
  });
});
