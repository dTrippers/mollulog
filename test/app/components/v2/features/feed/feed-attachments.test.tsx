/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { EventAttachment } from "~/components/v2/features/feed/FeedAttachments";
import { InfiniteFeed } from "~/components/v2/features/feed/InfiniteFeed";

function renderInRouter(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "*", element }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

const students = (count: number) => Array.from({ length: count }, (_, index) => ({ uid: `s${index}`, name: `학생${index}` }));

describe("EventAttachment", () => {
  it("shows up to three pickup students as avatars without an overflow count", async () => {
    renderInRouter(<EventAttachment contentUid="e1" contentType="event" name="이벤트" pickupStudents={students(3)} />);
    await screen.findByRole("link", { name: "이벤트" });
    expect(screen.getAllByTitle(/^학생/)).toHaveLength(3);
    expect(screen.queryByText(/^외 /)).toBeNull();
  });

  it("shows two avatars and 외 N명 from four pickup students", async () => {
    renderInRouter(<EventAttachment contentUid="e1" contentType="event" name="이벤트" pickupStudents={students(5)} />);
    await screen.findByRole("link", { name: "이벤트" });
    expect(screen.getAllByTitle(/^학생/)).toHaveLength(2);
    expect(screen.getByText("외 3명")).toBeTruthy();
  });

  it("keeps the whole event name as the tooltip of a one-line title", async () => {
    const name = "아주 긴 이벤트 이름 ".repeat(8).trim();
    renderInRouter(<EventAttachment contentUid="e1" contentType="event" name={name} pickupStudents={[]} />);
    const link = await screen.findByRole("link", { name });
    expect(link.getAttribute("title")).toBe(name);
    expect(link.getAttribute("href")).toBe("/events/e1");
    expect(link.querySelector(".truncate")?.textContent).toBe(name);
    expect(screen.queryByText("픽업")).toBeNull();
  });

  it("links a live to its live page", async () => {
    renderInRouter(<EventAttachment contentUid="l1" contentType="live" name="라이브" pickupStudents={[]} />);
    expect((await screen.findByRole("link", { name: "라이브" })).getAttribute("href")).toBe("/lives/l1");
  });
});

describe("InfiniteFeed", () => {
  const base = { page: 1, totalPages: 1, signedIn: false, studentsByUid: {}, resetKey: "arona", getPageUrl: () => "/" };

  it("shows the empty text when there are no posts", async () => {
    renderInRouter(<InfiniteFeed {...base} posts={[]} failed={false} emptyText="아직 작성한 글이 없어요" />);
    expect(await screen.findByText("아직 작성한 글이 없어요")).toBeTruthy();
  });

  it("shows a failure with a retry, not the empty text, when the first page failed", async () => {
    renderInRouter(<InfiniteFeed {...base} posts={[]} failed emptyText="아직 작성한 글이 없어요" />);
    expect(await screen.findByText("작성한 글을 불러오지 못했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.queryByText("아직 작성한 글이 없어요")).toBeNull();
  });
});
