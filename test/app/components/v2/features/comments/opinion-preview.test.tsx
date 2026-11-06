/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OpinionPreview, type OpinionPreviewProps } from "~/components/v2/features/comments/OpinionPreview";
import type { NestedComment } from "~/models/content";

function comment(uid: string, body: string, createdAt: string, subcomments: NestedComment[] = []): NestedComment {
  return {
    uid,
    body,
    visibility: "public",
    pinned: false,
    createdAt,
    sensei: { me: false, username: `sensei-${uid}`, profileStudentId: null },
    subcomments,
  } as NestedComment;
}

function renderPreview(comments: NestedComment[], onOpen = jest.fn()) {
  const props: OpinionPreviewProps = {
    title: "이벤트 의견",
    comments,
    count: comments.length,
    now: "2026-11-06T00:00:00.000Z" as OpinionPreviewProps["now"],
    loading: false,
    unavailable: false,
    hidden: false,
    onOpen,
    onRetry: () => undefined,
  };
  render(
    <MemoryRouter>
      <OpinionPreview {...props} />
    </MemoryRouter>,
  );
  return onOpen;
}

describe("OpinionPreview", () => {
  it("previews the first reply and opens the sheet for the remaining ones", () => {
    const onOpen = renderPreview([
      comment("a", "의견", "2026-11-01T00:00:00.000Z", [
        comment("a2", "두 번째 답글", "2026-11-03T00:00:00.000Z"),
        comment("a1", "첫 답글", "2026-11-02T00:00:00.000Z"),
        comment("a3", "세 번째 답글", "2026-11-04T00:00:00.000Z"),
      ]),
    ]);

    expect(screen.getByText("첫 답글")).toBeTruthy();
    expect(screen.queryByText("두 번째 답글")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "답글 2개 더 보기" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows a single reply without a more button", () => {
    renderPreview([comment("a", "의견", "2026-11-01T00:00:00.000Z", [comment("a1", "답글", "2026-11-02T00:00:00.000Z")])]);

    expect(screen.getByText("답글")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });

  it("opens every opinion from the button below the list", () => {
    const onOpen = renderPreview([comment("a", "의견", "2026-11-01T00:00:00.000Z")]);

    fireEvent.click(screen.getByRole("button", { name: "의견 1개 모두 보기" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
