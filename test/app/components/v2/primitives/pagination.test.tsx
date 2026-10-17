/**
 * @jest-environment jsdom
 */
import "../layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { Pagination } from "~/components/v2/primitives/Pagination";
import { installLayoutTestEnv } from "../layout/layout-test-env";

function href(page: number) {
  return page <= 1 ? "/news" : `/news?page=${page}`;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPagination(currentPage: number, totalPages: number) {
  const router = createMemoryRouter(
    [
      {
        path: "/news",
        element: (
          <>
            <Pagination currentPage={currentPage} totalPages={totalPages} getHref={href} />
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: ["/news"] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

describe("Pagination", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("renders a nav with page links, marks the current page, and links the first page to /news", () => {
    renderPagination(2, 3);
    const nav = screen.getByRole("navigation", { name: "페이지" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "2페이지" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "1페이지" }).getAttribute("href")).toBe("/news");
    expect(screen.getByRole("link", { name: "3페이지" }).getAttribute("href")).toBe("/news?page=3");
  });

  it("disables previous on the first page and next on the last page", () => {
    const { unmount } = renderPagination(1, 3);
    expect(screen.getByRole("link", { name: "다음 페이지" }).getAttribute("href")).toBe("/news?page=2");
    expect(screen.queryByRole("link", { name: "이전 페이지" })).toBeNull();
    expect((screen.getByRole("button", { name: "이전 페이지" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    renderPagination(3, 3);
    expect((screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is hidden when there is only one page", () => {
    const { container } = renderPagination(1, 1);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders the jump field as text with numeric input, so no native number spinner is shown", () => {
    renderPagination(1, 3);
    const input = screen.getByLabelText("이동할 페이지 (1–3)") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByText("/ 3")).toBeTruthy();
  });

  it("moves to a valid page from the jump form with the crossfade view transition", () => {
    const { router } = renderPagination(1, 3);
    const navigate = jest.spyOn(router, "navigate");
    fireEvent.change(screen.getByLabelText("이동할 페이지 (1–3)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "이동" }));
    expect(navigate).toHaveBeenCalledWith("/news?page=2", expect.objectContaining({ viewTransition: true }));
    expect(screen.getByTestId("location").textContent).toBe("/news?page=2");
  });

  it("keeps the move action disabled for out-of-range input", () => {
    renderPagination(1, 3);
    const input = screen.getByLabelText("이동할 페이지 (1–3)");
    const move = screen.getByRole("button", { name: "이동" }) as HTMLButtonElement;
    expect(move.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "4" } });
    expect(move.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "3" } });
    expect(move.disabled).toBe(false);
    fireEvent.click(move);
    expect(screen.getByTestId("location").textContent).toBe("/news?page=3");
  });
});
