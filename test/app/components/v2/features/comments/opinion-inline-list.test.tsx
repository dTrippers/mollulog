/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import {
  OpinionInlineList,
  type OpinionInlineListProps,
} from "~/components/v2/features/comments/OpinionInlineList";
import type { NestedComment } from "~/models/content";

function comment(uid: string, createdAt: string, pinned = false): NestedComment {
  return {
    uid,
    body: `의견 ${uid}`,
    visibility: "public",
    pinned,
    createdAt,
    sensei: { me: pinned, username: `sensei-${uid}`, profileStudentId: null },
    subcomments: [],
  } as NestedComment;
}

function renderList(comments: NestedComment[]) {
  const noop = () => undefined;
  const props: OpinionInlineListProps = {
    title: "의견",
    comments,
    count: comments.length,
    now: "2026-11-30T00:00:00.000Z" as OpinionInlineListProps["now"],
    loading: false,
    unavailable: false,
    hidden: false,
    signedIn: false,
    submitting: false,
    onCreate: noop,
    onDelete: noop,
    onPin: noop,
    onUnpin: noop,
    onOpenThread: noop,
    onRetry: noop,
    onRequestSignIn: noop,
  };
  render(
    <MemoryRouter>
      <OpinionInlineList {...props} />
    </MemoryRouter>,
  );
}

function shownBodies(): string[] {
  return screen.getAllByText(/^의견 [a-z]$/).map((node) => node.textContent ?? "");
}

describe("OpinionInlineList", () => {
  it("lists opinions oldest first, like the full thread, starting from the newest few", () => {
    renderList([
      comment("c", "2026-11-03T00:00:00.000Z"),
      comment("a", "2026-11-01T00:00:00.000Z"),
      comment("e", "2026-11-05T00:00:00.000Z"),
      comment("b", "2026-11-02T00:00:00.000Z"),
      comment("d", "2026-11-04T00:00:00.000Z"),
    ]);

    expect(shownBodies()).toEqual(["의견 c", "의견 d", "의견 e"]);
  });

  it("loads older opinions above the shown ones", () => {
    renderList([
      comment("a", "2026-11-01T00:00:00.000Z"),
      comment("b", "2026-11-02T00:00:00.000Z"),
      comment("c", "2026-11-03T00:00:00.000Z"),
      comment("d", "2026-11-04T00:00:00.000Z"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "이전 의견 1개 더 보기" }));

    expect(shownBodies()).toEqual(["의견 a", "의견 b", "의견 c", "의견 d"]);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });

  it("keeps a pinned opinion in posting order", () => {
    renderList([
      comment("a", "2026-11-01T00:00:00.000Z"),
      comment("b", "2026-11-02T00:00:00.000Z", true),
      comment("c", "2026-11-03T00:00:00.000Z"),
    ]);

    expect(shownBodies()).toEqual(["의견 a", "의견 b", "의견 c"]);
  });
});
