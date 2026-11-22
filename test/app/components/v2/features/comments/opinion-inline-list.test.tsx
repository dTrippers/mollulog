/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { afterEach, describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import {
  OpinionInlineList,
  type OpinionInlineListProps,
} from "~/components/v2/features/comments/OpinionInlineList";
import type { NestedComment } from "~/models/content";
import { stubCoarsePointer } from "./pointer-media-stub";

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

function renderList(comments: NestedComment[], overrides: Partial<OpinionInlineListProps> = {}) {
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
    ...overrides,
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

  describe("a long first reply", () => {
    const original = {
      scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
      clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
    };
    afterEach(() => {
      for (const [key, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      }
    });

    it("unfolds in place for a signed-out reader with no other way into the thread", () => {
      // jsdom has no layout: report the clamped paragraph as taller than its three visible lines.
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 120 });
      Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 60 });
      const parent = comment("a", "2026-11-01T00:00:00.000Z");
      const reply = { ...comment("r", "2026-11-02T00:00:00.000Z"), body: "첫 줄\n둘째 줄\n셋째 줄\n넷째 줄" };
      renderList([{ ...parent, subcomments: [reply] } as NestedComment]);

      const replyBody = screen.getByText(/첫 줄/);
      expect(replyBody.className).toContain("line-clamp-3");
      expect(screen.queryByRole("button", { name: "답글 달기" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
      expect(screen.getByText(/첫 줄/).className).not.toContain("line-clamp-3");
      expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
    });
  });

  it("unfolds the remaining replies in place instead of opening the full thread", () => {
    let opened = 0;
    const parent = comment("a", "2026-11-01T00:00:00.000Z");
    const replies = ["x", "y", "z"].map((uid, index) => ({
      ...comment(uid, `2026-11-0${index + 2}T00:00:00.000Z`),
      body: `답글 ${uid}`,
    }));
    renderList([{ ...parent, subcomments: [replies[2], replies[0], replies[1]] } as NestedComment], {
      onOpenThread: () => {
        opened += 1;
      },
    });

    expect(screen.getByText("답글 x")).toBeTruthy();
    expect(screen.queryByText("답글 y")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "답글 2개 더 보기" }));
    expect(screen.getAllByText(/^답글 [xyz]$/).map((node) => node.textContent)).toEqual(["답글 x", "답글 y", "답글 z"]);
    expect(screen.queryByRole("button", { name: "답글 2개 더 보기" })).toBeNull();
    expect(opened).toBe(0);
    expect(document.activeElement?.textContent).toContain("답글 y");
  });

  it("offers the reply composer only once every reply is on the page", () => {
    stubCoarsePointer(false);
    let opened = 0;
    const parent = comment("a", "2026-11-01T00:00:00.000Z");
    const replies = ["x", "y"].map((uid, index) => comment(uid, `2026-11-0${index + 2}T00:00:00.000Z`));
    renderList([{ ...parent, subcomments: replies } as NestedComment], {
      signedIn: true,
      onOpenThread: () => {
        opened += 1;
      },
    });

    expect(screen.queryByRole("button", { name: "답글 달기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "답글 1개 더 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "답글 달기" }));
    expect(opened).toBe(1);
  });
});
