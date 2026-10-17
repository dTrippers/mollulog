/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { createMemoryRouter, Outlet, RouterProvider, useLocation, useNavigationType } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";
import type { Post } from "~/models/post";
import { newsScrollStateKey, shouldKeepNewsScrollOnNavigation } from "~/routes/news._components/news-scroll-state";
import { default as News } from "~/routes/news";

jest.mock("~/lib/observability.client", () => ({ captureClientError: jest.fn() }));
jest.mock("~/models/post", () => ({ getNewsPosts: jest.fn() }));

function post(index: number): Post {
  const day = String(index + 1).padStart(2, "0");
  return {
    uid: `post-${index}`,
    title: `${index + 1}번째 업데이트 안내`,
    content: "짧은 본문",
    board: "news",
    timelineContentUid: null,
    createdAt: `2026-09-${day}T00:00:00.000Z`,
    updatedAt: `2026-09-${day}T00:00:00.000Z`,
  };
}

const listData = { posts: Array.from({ length: 3 }, (_, index) => post(index)), page: 1, totalPages: 1 };

// Mirrors root's layout effect: the scroll container is reset to 0 on a pathname change, unless root keeps a saved
// news offset for a back navigation (the same condition as app/root.tsx).
function Shell() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (
      shouldKeepNewsScrollOnNavigation({
        pathname: location.pathname,
        navigationType,
        entryKey: location.key,
        storage: window.sessionStorage,
      })
    ) {
      return;
    }
    const container = document.querySelector<HTMLElement>(".mllg-content-area");
    if (container) {
      container.scrollTop = 0;
    }
  }, [location.key, location.pathname, navigationType]);
  return <Outlet />;
}

function setupScrollContainer(initialScrollTop: number) {
  const area = document.createElement("div");
  area.className = "mllg-content-area";
  Object.defineProperty(area, "scrollTop", { configurable: true, writable: true, value: initialScrollTop });
  document.body.appendChild(area);
  return area;
}

function renderApp(initialEntries: string[], initialIndex = 0) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: Shell,
        children: [
          { path: "news", Component: News, loader: () => listData },
          { path: "posts/:uid", element: <p>post detail</p> },
        ],
      },
    ],
    { initialEntries, initialIndex },
  );
  const container = document.body.appendChild(document.createElement("div"));
  return { router, ...render(<RouterProvider router={router} />, { container }) };
}

function storedScrollTop(entryKey: string): number | null {
  const saved = window.sessionStorage.getItem(newsScrollStateKey);
  const entries = saved ? (JSON.parse(saved) as { entryKey: string; scrollTop: number }[]) : [];
  return entries.find((entry) => entry.entryKey === entryKey)?.scrollTop ?? null;
}

describe("news list scroll save and restore ordering", () => {
  beforeEach(() => {
    installLayoutTestEnv();
    window.sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("keeps the offset saved on a row click after the list unmounts and root resets the scroll container", async () => {
    const area = setupScrollContainer(0);
    renderApp(["/news"]);
    await screen.findByRole("link", { name: "2번째 업데이트 안내" });
    area.scrollTop = 500;

    fireEvent.click(screen.getByRole("link", { name: "2번째 업데이트 안내" }));

    await screen.findByText("post detail");
    // The container was reset by root for the new route, and the list has unmounted.
    expect(area.scrollTop).toBe(0);
    expect(storedScrollTop("default")).toBe(500);
  });

  it("restores the saved offset on a back navigation to the list", async () => {
    const area = setupScrollContainer(0);
    const { router } = renderApp(["/news", "/posts/post-1"], 1);
    await screen.findByText("post detail");

    // The list entry (index 0) has a saved offset from an earlier click. Going back is a POP to that entry.
    window.sessionStorage.setItem(newsScrollStateKey, JSON.stringify([{ entryKey: "default", scrollTop: 740 }]));
    area.scrollTop = 0;
    await act(async () => {
      await router.navigate(-1);
    });

    await screen.findByRole("link", { name: "2번째 업데이트 안내" });
    await waitFor(() => expect(area.scrollTop).toBe(740));
  });
});
