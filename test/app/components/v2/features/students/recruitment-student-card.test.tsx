/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AttributeStripes } from "~/components/v2/features/students/AttributeStripes";
import { RecruitmentStudentCard } from "~/components/v2/features/students/RecruitmentStudentCard";
import { RecruitmentStudentCardRail } from "~/components/v2/features/students/RecruitmentStudentCardRail";
import { Attack, Defense } from "~/graphql/graphql";

const mockShowSignIn = jest.fn();

jest.mock("~/contexts/SignInProvider", () => ({
  useSignIn: () => ({ showSignIn: mockShowSignIn }),
}));
jest.mock("react-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, children }: { to: string; children: ReactNode }) => React.createElement("a", { href: to }, children),
  };
});

function renderCard(
  signedIn: boolean,
  onToggleFavorite = jest.fn(),
  overrides: Partial<ComponentProps<typeof RecruitmentStudentCard>> = {},
) {
  return render(
    createElement(RecruitmentStudentCard, {
      studentUid: "student-1",
      favoriteKey: "student-1",
      studentName: "시로코(라이딩)",
      label: "페스 복각",
      attackType: Attack.Explosive,
      defenseType: Defense.Light,
      role: "striker",
      favorited: false,
      favoritedCount: 12,
      signedIn,
      onToggleFavorite,
      ...overrides,
    }),
  );
}

describe("RecruitmentStudentCard", () => {
  beforeEach(() => {
    mockShowSignIn.mockClear();
  });

  it("shows the recruitment card details and count-only favorite content with an accessible name", () => {
    renderCard(false);

    expect(screen.getByText("페스 복각")).toBeTruthy();
    expect(screen.getByText("라이딩")).toBeTruthy();
    expect(screen.getByText("시로코")).toBeTruthy();
    expect(screen.getByText("폭발")).toBeTruthy();
    expect(screen.getByText("경장갑")).toBeTruthy();
    expect(screen.getByText("스트라이커")).toBeTruthy();
    expect(screen.getByRole("link", { name: "평가/통계" }).getAttribute("href")).toBe("/students/student-1");
    const favoriteButton = screen.getByRole("button", { name: "관심 12명" });
    expect(favoriteButton.getAttribute("aria-pressed")).toBe("false");
    expect(favoriteButton.textContent).toBe("12");
    expect(favoriteButton.className).toContain("text-sm");
  });

  it("uses solid danger emphasis when favorited", () => {
    renderCard(true, undefined, { favorited: true });

    const favoriteButton = screen.getByRole("button", { name: "관심 12명" });
    expect(favoriteButton.className).toContain("bg-v2-danger");
    expect(favoriteButton.className).toContain("text-v2-on-danger");
  });

  it("omits a pending count without rendering a placeholder", () => {
    renderCard(false, undefined, { favoritedCount: null });

    const favoriteButton = screen.getByRole("button", { name: "관심" });
    expect(favoriteButton.textContent).toBe("");
    expect(screen.queryByText("—")).toBeNull();
  });

  it("opens sign-in for guests and updates the signed-in favorite count optimistically", () => {
    const guest = renderCard(false);
    fireEvent.click(screen.getByRole("button", { name: "관심 12명" }));
    expect(mockShowSignIn).toHaveBeenCalledTimes(1);
    guest.unmount();

    const onToggleFavorite = jest.fn();
    renderCard(true, onToggleFavorite);
    fireEvent.click(screen.getByRole("button", { name: "관심 12명" }));

    expect(onToggleFavorite).toHaveBeenCalledWith("student-1", true);
    expect(screen.getByRole("button", { name: "관심 13명" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("allows favoriting a uid-less recruitment by its favorite key", () => {
    const onToggleFavorite = jest.fn();
    renderCard(true, onToggleFavorite, { studentUid: null, favoriteKey: "provisional:abc" });

    const favoriteButton = screen.getByRole("button", { name: "관심 12명" });
    expect(favoriteButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(favoriteButton);

    expect(onToggleFavorite).toHaveBeenCalledWith("provisional:abc", true);
    expect(screen.queryByRole("link", { name: "평가/통계" })).toBeNull();
  });

  it("renders full attribute labels as compact shared stripes without tag chips", () => {
    renderCard(false);

    const attackLabel = screen.getByText("폭발");
    const attackItem = attackLabel.parentElement;
    expect(screen.getByText("경장갑")).toBeTruthy();
    expect(screen.getByText("스트라이커")).toBeTruthy();
    expect(attackLabel.closest("p")?.className).toContain("gap-x-1");
    expect(attackItem?.className).toContain("whitespace-nowrap");
    expect(attackItem?.className).not.toContain("rounded-md");
    expect(attackItem?.className).not.toContain("px-2");
    expect(attackItem?.className).not.toContain("py-1");
    expect(attackLabel.previousElementSibling?.classList.contains("w-0.5")).toBe(true);
    expect(attackLabel.previousElementSibling?.classList.contains("bg-v2-attr-red")).toBe(true);
  });

  it("keeps regular stripe spacing by default and narrows it only when compact is requested", () => {
    const props = { attackType: Attack.Explosive, defenseType: Defense.Light, role: "striker" as const };
    const { container, rerender } = render(createElement(AttributeStripes, props));

    expect(container.querySelector("p")?.className).toContain("gap-x-3");

    rerender(createElement(AttributeStripes, { ...props, compact: true }));

    expect(container.querySelector("p")?.className).toContain("gap-x-1");
    expect(container.querySelector("p")?.className).not.toContain("gap-x-3");
  });

  it("shows only the edge fades that match the rail's current scroll position", () => {
    const { container } = render(
      <RecruitmentStudentCardRail fadeFrom="surface">
        <li className="list-none">student</li>
      </RecruitmentStudentCardRail>,
    );
    const list = container.querySelector("ul");
    if (!list) throw new Error("Recruitment card rail was not rendered");
    let scrollLeft = 0;
    Object.defineProperties(list, {
      scrollWidth: { configurable: true, value: 500 },
      clientWidth: { configurable: true, value: 200 },
      scrollLeft: {
        configurable: true,
        get: () => scrollLeft,
        set: (value: number) => {
          scrollLeft = value;
        },
      },
    });

    fireEvent.resize(window);
    expect(container.querySelector('[data-edge="left"]')).toBeNull();
    expect(container.querySelector('[data-edge="right"]')?.className).toContain("from-v2-surface");

    scrollLeft = 100;
    fireEvent.scroll(list);
    expect(container.querySelector('[data-edge="left"]')?.className).toContain("from-v2-surface");
    expect(container.querySelector('[data-edge="right"]')?.className).toContain("from-v2-surface");

    scrollLeft = 300;
    fireEvent.scroll(list);
    expect(container.querySelector('[data-edge="left"]')).toBeTruthy();
    expect(container.querySelector('[data-edge="right"]')).toBeNull();
  });
});
