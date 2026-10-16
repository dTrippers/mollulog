/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { getFavoriteLabelState } from "~/domain/futures/futures-view-model";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";

const favorited = getFavoriteLabelState({ count: 1200, favorited: true, completed: false, signedIn: true });
const quiet = getFavoriteLabelState({ count: 0, favorited: false, completed: false, signedIn: false });

function renderThumb(props: Partial<Parameters<typeof StudentThumb>[0]> = {}) {
  return render(
    <StudentThumb
      studentUid="student-1"
      name="키사키"
      variant="수영복"
      recruitmentLabel="한정 신규"
      isNew
      favorite={favorited}
      onOpen={jest.fn<() => void>()}
      {...props}
    />,
  );
}

describe("StudentThumb accessible name", () => {
  it("names the detail button with the favorite count and the viewer's own state", () => {
    renderThumb();

    expect(screen.getByRole("button", { name: `키사키(수영복) 상세, ${favorited.accessibleName}` })).toBeTruthy();
  });

  it("names the button with the detail label alone when the favorite label is hidden", () => {
    renderThumb({ favorite: quiet });

    expect(screen.getByRole("button", { name: "키사키(수영복) 상세" })).toBeTruthy();
  });
});

describe("StudentThumb new recruitment accent", () => {
  it("accents the recruitment label when the recruitment is new", () => {
    renderThumb({ isNew: true });

    expect(screen.getByText("한정 신규").className).toContain("text-v2-new");
  });

  it("does not accent a rerun whose label happens to contain the same word", () => {
    renderThumb({ recruitmentLabel: "신규 복각", isNew: false });

    expect(screen.getByText("신규 복각").className).not.toContain("text-v2-new");
  });
});
