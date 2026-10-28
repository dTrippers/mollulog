/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";
import { ErrorBoundary, default as PostDetailPage } from "~/routes/posts.$uid";
import { routeError } from "~/lib/http-errors";
import { renderMarkdownToSafeHtml } from "~/lib/markdown.server";
import type { PostDetailView } from "~/views/post-detail";

jest.mock("~/lib/observability.client", () => ({ captureClientError: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock("~/models/post", () => ({ getPostByUid: jest.fn(), getRecentNewsPosts: jest.fn() }));

const newsView: PostDetailView = {
  post: {
    uid: "post-1",
    title: "9/8 업데이트 안내",
    content: "## 새로운 기능\n\n- 알림 이력을 확인할 수 있어요.\n\n![사진](https://mollulog.net/a.png)",
    thumbnailImageUrl: null,
    createdAt: "2026-09-08T00:00:00.000Z",
  },
  back: { kind: "news" },
  recent: {
    status: "success",
    data: [{ uid: "post-2", title: "8/30 업데이트 안내", createdAt: "2026-08-30T00:00:00.000Z" }],
  },
};

// The route loader renders the body on the server and sends it as HTML in place of the markdown.
function toLoaderData(view: PostDetailView) {
  const { content, ...post } = view.post;
  return { ...view, post, contentHtml: renderMarkdownToSafeHtml(content) };
}

function renderPost(
  options: { view?: PostDetailView; loaderError?: unknown; state?: unknown; history?: boolean } = {},
) {
  const loaderValue = options.view;
  const router = createMemoryRouter(
    [
      {
        path: "/posts/:uid",
        Component: PostDetailPage,
        ErrorBoundary,
        loader: () => {
          if (options.loaderError) {
            throw options.loaderError;
          }
          return loaderValue ? toLoaderData(loaderValue) : loaderValue;
        },
      },
      { path: "/news", element: <p>news list</p> },
    ],
    options.history
      ? {
          initialEntries: [{ pathname: "/news" }, { pathname: "/posts/post-1", state: options.state }],
          initialIndex: 1,
        }
      : { initialEntries: [{ pathname: "/posts/post-1", state: options.state }] },
  );
  return render(<RouterProvider router={router} />);
}

describe("post detail screen", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("shows the header with a news back link, the title, the date, the body, and recent news", async () => {
    renderPost({ view: newsView });

    expect(await screen.findByRole("heading", { level: 1, name: "9/8 업데이트 안내" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "업데이트 소식" }).getAttribute("href")).toBe("/news");
    expect(screen.getByText("2026/09/08").tagName).toBe("TIME");
    expect(screen.getByRole("heading", { level: 2, name: "새로운 기능" })).toBeTruthy();
    expect(screen.getByAltText("사진")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "최근 소식" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "8/30 업데이트 안내" }).getAttribute("href")).toBe("/posts/post-2");
    expect(screen.getByRole("link", { name: "모두 보기" }).getAttribute("href")).toBe("/news");
    expect(screen.getByRole("button", { name: "공유" }).closest(".v2-action-bar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "공유하기" }).closest("article")).toBeNull();
  });

  it("opens the native share sheet when Web Share is available", async () => {
    const share = jest.fn<(data: ShareData) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderPost({ view: newsView });

    fireEvent.click(await screen.findByRole("button", { name: "공유" }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: newsView.post.title, url: window.location.href }));
  });

  it("copies the page address when Web Share is unavailable", async () => {
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPost({ view: newsView });

    fireEvent.click(await screen.findByRole("button", { name: "공유하기" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
    expect(screen.getByRole("button", { name: "링크 복사됨" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "복사됨" })).toBeTruthy();
  });

  it("returns to the list page with a history back action when the detail was opened from the news list", async () => {
    renderPost({ view: newsView, state: { from: "news-list" }, history: true });

    const back = await screen.findByRole("button", { name: "업데이트 소식" });
    fireEvent.click(back);

    expect(await screen.findByText("news list")).toBeTruthy();
  });

  it("links an event post back to its event and shows no recent block", async () => {
    renderPost({
      view: {
        post: { ...newsView.post, title: "5.5주년 생방송" },
        back: { kind: "event", timelineContentUid: "jp-live-5-5th" },
        recent: null,
      },
    });

    expect((await screen.findByRole("link", { name: "이벤트 상세" })).getAttribute("href")).toBe(
      "/events/jp-live-5-5th",
    );
    expect(screen.queryByRole("heading", { name: "최근 소식" })).toBeNull();
  });

  it("shows no back link for a post without a linked event", async () => {
    renderPost({ view: { post: { ...newsView.post, title: "공지" }, back: { kind: "none" }, recent: null } });

    expect(await screen.findByRole("heading", { level: 1, name: "공지" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "업데이트 소식" })).toBeNull();
    expect(screen.queryByRole("link", { name: "이벤트 상세" })).toBeNull();
  });

  it("keeps the body and replaces only the recent block when recent news fails", async () => {
    renderPost({ view: { ...newsView, recent: { status: "error" } } });

    expect(await screen.findByText("새로운 기능", { selector: "h2" })).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("최근 소식을 불러오지 못했어요");
    expect(within(alert).getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("shows the 404 state with the back link and no raw error", async () => {
    renderPost({ loaderError: routeError(404, "post.not_found", "게시물을 찾을 수 없어요.") });

    expect(await screen.findByRole("heading", { level: 1, name: "글을 찾을 수 없어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "업데이트 소식" }).getAttribute("href")).toBe("/news");
    expect(screen.getByText("주소가 바뀌었거나 삭제된 글일 수 있어요.")).toBeTruthy();
    expect(screen.queryByText("게시물을 찾을 수 없어요.")).toBeNull();
  });

  it("shows the failure state with a retry and never the raw error message", async () => {
    renderPost({ loaderError: new Error("connection reset by peer") });

    expect(await screen.findByRole("heading", { level: 1, name: "글을 불러오지 못했어요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.queryByText(/connection reset/)).toBeNull();
  });
  it("keeps the list origin state when a failed load is retried, so back still returns to the list", async () => {
    let attempts = 0;
    const router = createMemoryRouter(
      [
        {
          path: "/posts/:uid",
          Component: PostDetailPage,
          ErrorBoundary,
          loader: () => {
            attempts += 1;
            if (attempts === 1) {
              throw new Error("connection reset by peer");
            }
            return toLoaderData(newsView);
          },
        },
        { path: "/news", element: <p>news list</p> },
      ],
      { initialEntries: [{ pathname: "/news" }, { pathname: "/posts/post-1", state: { from: "news-list" } }], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { level: 1, name: "9/8 업데이트 안내" })).toBeTruthy();
    expect(router.state.location.state).toEqual({ from: "news-list" });
    expect(screen.getByRole("button", { name: "업데이트 소식" }).tagName).toBe("BUTTON");
    expect(attempts).toBe(2);
  });
});
