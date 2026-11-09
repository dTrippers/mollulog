/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
jest.mock("react-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, prefetch, children, ...props }: { to: string; prefetch?: string; children: React.ReactNode }) =>
      React.createElement("a", { ...props, href: to, "data-prefetch": prefetch }, children),
  };
});
jest.mock("~/components/v2/layout/screen-transition", () => ({
  getV2LinkTransitionProps: () => ({ "data-transition": "forward" }),
}));
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

  it("uses an opt-in selection action label and exposes pressed state", () => {
    renderThumb({
      onOpen: undefined,
      onSelect: jest.fn<() => void>(),
      selected: false,
      selectionActionLabel: "선택",
      favorite: quiet,
    });

    const button = screen.getByRole("button", { name: "키사키(수영복) 선택, 선택 안 됨" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
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

describe("StudentThumb without onOpen", () => {
  it("renders the same portrait as a non-interactive element with no button role", () => {
    renderThumb({ onOpen: undefined });

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("키사키")).toBeTruthy();
  });

  it("keeps the button when onOpen is given", () => {
    renderThumb();

    expect(screen.getByRole("button")).toBeTruthy();
  });
});

describe("StudentThumb while the student data is being prepared", () => {
  it("shows the in-game placeholder icon and only the name below it", () => {
    const { container } = renderThumb({ studentUid: null, name: "라나", variant: null, recruitmentLabel: "배포" });

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://assets.mollulog.net/assets/images/students/-1",
    );
    expect(screen.queryByText("정보 준비 중")).toBeNull();
    expect(screen.getByText("라나")).toBeTruthy();
  });
});

describe("StudentThumb directory links", () => {
  it("links to the student detail, and exposes the scrim value accessibly", () => {
    const { container } = renderThumb({
      onOpen: undefined,
      linkTo: "/students/42",
      recruitmentLabel: undefined,
      favorite: undefined,
      scrimLabel: "2025/03/07 예정",
      scrimAriaLabel: "2025/03/07 예정",
    });

    const link = screen.getByRole("link", { name: "키사키(수영복) 상세, 2025/03/07 예정" });
    expect(link.getAttribute("href")).toBe("/students/42");
    expect(link.getAttribute("data-prefetch")).toBe("intent");
    expect(link.getAttribute("data-transition")).toBe("forward");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("StudentThumb shop grid options", () => {
  it("fills its grid cell, overlays the caption, and grays an unselected portrait", () => {
    const { container } = renderThumb({
      onOpen: undefined,
      onSelect: jest.fn<() => void>(),
      selected: false,
      fluid: true,
      captionPlacement: "overlay",
      grayscaleWhenUnselected: true,
      recruitmentLabel: "모집",
      showRecruitmentLabel: true,
    });

    expect(container.firstElementChild?.className).toContain("w-full");
    expect(container.querySelector("img")?.className).toContain("grayscale");
    expect(container.querySelector(".bg-linear-15")?.textContent).toContain("키사키");
    expect(screen.getByText("모집")).toBeTruthy();
  });

  it("keeps an opted-in overlay caption visible on mobile", () => {
    const { container } = renderThumb({
      onOpen: undefined,
      captionPlacement: "overlay",
      overlayOnMobile: true,
    });

    const caption = container.querySelector(".bg-linear-15");
    expect(caption?.className).toContain("flex");
    expect(caption?.className).not.toContain("hidden");
    // The variant sits small above the name, as the 1.x cards did.
    expect(caption?.textContent).toBe("수영복키사키");
  });

  it("moves the selected check below the recruitment badge when opted in", () => {
    const { container } = renderThumb({
      onOpen: undefined,
      onSelect: jest.fn<() => void>(),
      selected: true,
      selectedIndicatorPosition: "mobile-bottom-left",
      recruitmentLabel: "모집",
      captionPlacement: "overlay",
    });

    const selectedIndicator = container.querySelector(".bg-v2-fg");
    expect(selectedIndicator?.className).toContain("bottom-1");
    expect(selectedIndicator?.className).toContain("md:top-1");
    expect(selectedIndicator?.className).toContain("md:bottom-auto");
    expect(screen.getByText("모집")).toBeTruthy();
  });

  it("keeps the selected check at the top for callers that do not opt in", () => {
    const { container } = renderThumb({ onOpen: undefined, onSelect: jest.fn<() => void>(), selected: true });

    const selectedIndicator = container.querySelector(".bg-v2-fg");
    expect(selectedIndicator?.className).toContain("top-1");
    expect(selectedIndicator?.className).not.toContain("bottom-1");
  });
});
