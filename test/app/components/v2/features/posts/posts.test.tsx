/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PostLatest } from "~/components/v2/features/posts/PostLatest";
import { newsListOriginState, PostRowList } from "~/components/v2/features/posts/PostRowList";
import { RecentPosts } from "~/components/v2/features/posts/RecentPosts";
import {
  PostDetailFailure,
  PostListEmpty,
  PostListFailure,
  PostNotFound,
  RecentPostsFailure,
} from "~/components/v2/features/posts/PostStates";
import { installLayoutTestEnv } from "../../layout/layout-test-env";

const rows = [
  { uid: "post-b", title: "8/30 업데이트 안내", createdAt: "2026-08-30T20:00:00.000Z" as const },
  { uid: "post-a", title: "6/24 업데이트 및 서버 혼잡 개선 안내 — 긴 제목도 줄바꿈합니다", createdAt: "2026-06-24T00:00:00.000Z" as const },
];

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("PostRowList", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("makes each row one link whose accessible name is the title and whose description is the date", () => {
    renderInRouter(<PostRowList posts={rows} timeZone="UTC" />);
    const link = screen.getByRole("link", { name: "8/30 업데이트 안내" });
    expect(link.getAttribute("href")).toBe("/posts/post-b");
    expect(link.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("formats the date in the display timezone with YYYY/MM/DD and a machine-readable time element", () => {
    const { container } = renderInRouter(<PostRowList posts={rows} timeZone="Asia/Seoul" />);
    const time = container.querySelector("time");
    expect(time?.textContent).toBe("2026/08/31");
    expect(time?.getAttribute("datetime")).toBe("2026-08-30T20:00:00.000Z");
  });

  it("uses a 48px row with the title as the full link text", () => {
    renderInRouter(<PostRowList posts={rows} timeZone="UTC" />);
    const link = screen.getByRole("link", { name: "8/30 업데이트 안내" });
    expect(link.className).toContain("min-h-12");
    expect(link.className).toContain("py-3");
  });

  it("passes the origin state to row links", () => {
    renderInRouter(<PostRowList posts={rows} timeZone="UTC" linkState={newsListOriginState} />);
    expect(screen.getByRole("link", { name: "8/30 업데이트 안내" })).toBeTruthy();
  });
});

describe("PostLatest", () => {
  it("links the expanded title to the detail and renders the body with the list heading offset", () => {
    renderInRouter(
      <PostLatest
        post={{
          uid: "post-1",
          title: "9/8 업데이트 안내",
          content: "## 새로운 기능\n\n- 항목",
          createdAt: "2026-09-08T00:00:00.000Z",
        }}
        timeZone="UTC"
      />,
    );
    expect(screen.getByRole("link", { name: "9/8 업데이트 안내" }).getAttribute("href")).toBe("/posts/post-1");
    // The last word and the chevron are kept together in a non-wrapping group.
    const lastWord = screen.getByText("안내");
    expect(lastWord.className).toContain("whitespace-nowrap");
    expect(lastWord.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /9\/8 업데이트 안내/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "새로운 기능" })).toBeTruthy();
  });
});

describe("RecentPosts", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("lists the recent posts with the all-posts link", () => {
    renderInRouter(<RecentPosts source={{ status: "success", data: rows }} timeZone="UTC" onRetry={jest.fn()} />);
    expect(screen.getByRole("heading", { name: "최근 소식" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "모두 보기" }).getAttribute("href")).toBe("/news");
    expect(screen.getAllByRole("link", { name: /업데이트|긴 제목/ })).toHaveLength(2);
  });

  it("omits the whole block when there is nothing to show", () => {
    const { container } = renderInRouter(
      <RecentPosts source={{ status: "success", data: [] }} timeZone="UTC" onRetry={jest.fn()} />,
    );
    expect(container.querySelector("section")).toBeNull();
  });

  it("replaces only the rows with a failure line and retries from it", () => {
    const onRetry = jest.fn();
    renderInRouter(<RecentPosts source={{ status: "error" }} timeZone="UTC" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("최근 소식을 불러오지 못했어요");
    expect(screen.getByRole("heading", { name: "최근 소식" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "모두 보기" })).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("PostStates", () => {
  it("shows the empty copy", () => {
    renderInRouter(<PostListEmpty />);
    expect(screen.getByText("등록된 소식이 없어요")).toBeTruthy();
  });

  it("shows the list failure with a retry and never a raw error", () => {
    const onRetry = jest.fn();
    renderInRouter(<PostListFailure onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("업데이트 소식을 불러오지 못했어요");
    expect(alert.textContent).toContain("일시적인 문제일 수 있어요. 잠시 후 다시 시도해 주세요.");
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the not-found explanation without a retry", () => {
    renderInRouter(<PostNotFound />);
    expect(screen.getByText("주소가 바뀌었거나 삭제된 글일 수 있어요.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the detail failure and recent-only failure with retry", () => {
    const onRetry = jest.fn();
    const { unmount } = renderInRouter(<PostDetailFailure onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    renderInRouter(<RecentPostsFailure onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("최근 소식을 불러오지 못했어요");
  });
});
