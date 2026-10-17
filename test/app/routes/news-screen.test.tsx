/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";
import type { Post } from "~/models/post";
import { getNewsPosts } from "~/models/post";
import { default as News, ErrorBoundary, loader } from "~/routes/news";

jest.mock("~/lib/observability.client", () => ({ captureClientError: jest.fn() }));
jest.mock("~/models/post", () => ({ getNewsPosts: jest.fn() }));

const mockedGetNewsPosts = getNewsPosts as jest.MockedFunction<typeof getNewsPosts>;
const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as Env;
const ctx = {} as ExecutionContext;

function post(index: number): Post {
  const day = String(index + 1).padStart(2, "0");
  return {
    uid: `post-${index}`,
    title: `${index + 1}번째 업데이트 안내`,
    content: index === 0 ? "## 새로운 기능\n\n- 항목" : "짧은 본문",
    board: "news",
    timelineContentUid: null,
    thumbnailImageUrl: null,
    createdAt: `2026-09-${day}T00:00:00.000Z`,
    updatedAt: `2026-09-${day}T00:00:00.000Z`,
  };
}

// The loader result the screen renders: the posts of the page, the clamped page, and the page count.
function pageData(count: number, page: number, totalPages: number) {
  return {
    posts: Array.from({ length: count }, (_, index) => post(index)),
    page,
    totalPages,
  };
}

function renderNews(url: string, data: unknown, error?: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: "/news",
        Component: News,
        ErrorBoundary,
        loader: () => {
          if (error) {
            throw error;
          }
          return data;
        },
      },
    ],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />);
}

function modelPage(count: number, page: number, totalPages: number) {
  return {
    items: Array.from({ length: count }, (_, index) => post(index)),
    page,
    pageSize: 20,
    totalCount: 47,
    totalPages,
  };
}

describe("news list loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads 20 posts per page and passes the requested page", async () => {
    mockedGetNewsPosts.mockResolvedValue(modelPage(20, 2, 3));

    const result = await loader({
      request: new Request("https://mollulog.net/news?page=2"),
      context: { cloudflare: { env, ctx } },
      params: {},
    } as never);

    expect(mockedGetNewsPosts).toHaveBeenCalledWith(env, 2, 20, { ctx });
    expect(result).toMatchObject({ page: 2, totalPages: 3 });
  });

  it("treats a missing or invalid page as page 1", async () => {
    mockedGetNewsPosts.mockResolvedValue(modelPage(0, 1, 1));

    await loader({
      request: new Request("https://mollulog.net/news?page=abc"),
      context: { cloudflare: { env, ctx } },
      params: {},
    } as never);

    expect(mockedGetNewsPosts).toHaveBeenCalledWith(env, 1, 20, { ctx });
  });
});

describe("news list screen", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("expands the newest post on page 1 and lists the other 19 posts as rows under 지난 소식", async () => {
    renderNews("/news", pageData(20, 1, 3));

    expect(await screen.findByRole("heading", { level: 2, name: /1번째 업데이트 안내/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "지난 소식" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /번째 업데이트 안내/ })).toHaveLength(20);
    expect(screen.getByRole("navigation", { name: "페이지" })).toBeTruthy();
  });

  it("shows only rows from page 2 onward, with no expanded post and no 지난 소식 heading", async () => {
    renderNews("/news?page=2", pageData(20, 2, 3));

    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("link")).toHaveLength(20);
    expect(screen.queryByRole("heading", { name: "지난 소식" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "페이지" }).querySelector('[aria-current="page"]')?.textContent).toBe(
      "2",
    );
  });

  it("shows the empty copy with no pagination when nothing is registered", async () => {
    renderNews("/news", pageData(0, 1, 1));

    expect(await screen.findByText("등록된 소식이 없어요")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "페이지" })).toBeNull();
  });

  it("keeps the header and shows the failure block with a retry when the list fails", async () => {
    renderNews("/news", undefined, new Error("db down"));

    expect(await screen.findByRole("heading", { level: 1, name: "업데이트 소식" })).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("업데이트 소식을 불러오지 못했어요");
    expect(within(alert).getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.queryByText(/db down/)).toBeNull();
  });
});
