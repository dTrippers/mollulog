/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { type FeedPageData, InfiniteFeed } from "~/components/v2/features/feed/InfiniteFeed";

// jsdom has no IntersectionObserver. The feed also loads on scroll, but these tests press the button.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.defineProperty(globalThis, "IntersectionObserver", { value: NoopIntersectionObserver, configurable: true });

jest.mock("~/components/v2/features/feed/FeedPost", () => ({
  FeedPost: ({ post }: { post: { uid: string } }) => <article>{`post ${post.uid}`}</article>,
}));

const post = (uid: string) => ({ uid }) as unknown as FeedPageData["posts"][number];
const firstPage: FeedPageData = {
  page: 1,
  totalPages: 2,
  signedIn: false,
  studentsByUid: {},
  posts: [post("a"), post("b")],
  failed: false,
};

function renderFeed(secondPage: FeedPageData) {
  const Stub = createRoutesStub([
    {
      path: "/",
      loader: () => secondPage,
      Component: () => (
        <InfiniteFeed {...firstPage} emptyText="비어 있음" resetKey="arona" getPageUrl={(page) => `/?page=${page}`} />
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("InfiniteFeed more states", () => {
  it("appends the next page when 더 보기 is pressed", async () => {
    renderFeed({ ...firstPage, page: 2, totalPages: 2, posts: [post("c")] });
    fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
    expect(await screen.findByText("post c")).toBeTruthy();
    expect(screen.getByText("post a")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });

  it("keeps the loaded posts and shows the failure line with a retry when the next page fails", async () => {
    renderFeed({ ...firstPage, page: 2, totalPages: 2, posts: [], failed: true });
    fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
    expect(await screen.findByText("글을 더 불러오지 못했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByText("post a")).toBeTruthy();
    expect(screen.getByText("post b")).toBeTruthy();
  });
});
