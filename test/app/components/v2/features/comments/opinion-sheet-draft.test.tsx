/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OpinionSheet, type OpinionSheetProps } from "~/components/v2/features/comments/OpinionSheet";
import { installLayoutTestEnv } from "../../layout/layout-test-env";
import { stubCoarsePointer } from "./pointer-media-stub";

const EDITOR_PLACEHOLDER = "의견을 남겨보세요 (Enter로 등록, Shift+Enter 줄바꿈)";
type CreateHandler = (body: string, visibility: "private" | "public") => void;

function sheetProps(contentUid: string | null, onCreate: CreateHandler): OpinionSheetProps {
  return {
    open: true,
    contentUid,
    isLive: false,
    contentName: "테스트 이벤트",
    commentCount: 1,
    comments: [
      {
        uid: "comment-1",
        body: "기존 의견",
        visibility: "public",
        pinned: false,
        createdAt: "2026-10-14T00:00:00.000Z",
        sensei: { me: false, username: "sensei", profileStudentId: null },
      },
    ],
    loading: false,
    unavailable: false,
    now: "2026-10-15T00:00:00.000Z" as OpinionSheetProps["now"],
    signedIn: true,
    hideRecruitmentOpinions: false,
    submitting: false,
    tutorial: null,
    actions: {
      canReply: true,
      onReply: () => undefined,
      onUpdate: () => undefined,
      onDelete: () => undefined,
      onPin: () => undefined,
      onUnpin: () => undefined,
      onCreate,
    },
    onRetry: () => undefined,
    onRequestSignIn: () => undefined,
    onClose: () => undefined,
  };
}

// The route keeps one sheet mounted and changes its content, so `show` rerenders the same sheet for another content.
function renderSheet(contentUid: string | null, onCreate: CreateHandler) {
  const ui = (uid: string | null) => (
    <MemoryRouter>
      <OpinionSheet {...sheetProps(uid, onCreate)} />
    </MemoryRouter>
  );
  const view = render(ui(contentUid));
  return { ...view, show: (uid: string | null) => view.rerender(ui(uid)) };
}

describe("OpinionSheet footer draft", () => {
  beforeEach(() => {
    installLayoutTestEnv();
    stubCoarsePointer(false);
  });

  it("keeps the private draft and visibility across opening and cancelling a reply", () => {
    renderSheet("content-a", jest.fn<CreateHandler>());
    fireEvent.change(screen.getByPlaceholderText(EDITOR_PLACEHOLDER), { target: { value: "나만 볼 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "공개 범위: 전체 공개" }));

    fireEvent.click(screen.getByRole("button", { name: "답글 달기" }));
    // The footer composer is hidden while the inline reply is open.
    expect(screen.queryByPlaceholderText(EDITOR_PLACEHOLDER)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "답글 취소" }));

    const editor = screen.getByPlaceholderText(EDITOR_PLACEHOLDER) as HTMLTextAreaElement;
    expect(editor.value).toBe("나만 볼 초안");
    expect(screen.getByRole("button", { name: "공개 범위: 나만 보기" })).toBeTruthy();
  });

  it("clears the draft and visibility after a submit, and keeps them cleared across a reply", () => {
    const onCreate = jest.fn<CreateHandler>();
    renderSheet("content-a", onCreate);
    const editor = screen.getByPlaceholderText(EDITOR_PLACEHOLDER) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "보낼 의견" } });
    fireEvent.click(screen.getByRole("button", { name: "공개 범위: 전체 공개" }));
    fireEvent.keyDown(screen.getByPlaceholderText(EDITOR_PLACEHOLDER), { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith("보낼 의견", "private");

    fireEvent.click(screen.getByRole("button", { name: "답글 달기" }));
    fireEvent.click(screen.getByRole("button", { name: "답글 취소" }));

    expect((screen.getByPlaceholderText(EDITOR_PLACEHOLDER) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "공개 범위: 전체 공개" })).toBeTruthy();
  });

  it("does not show a draft written for another content, and posts only the shown content's own text", () => {
    const onCreate = jest.fn<CreateHandler>();
    const sheet = renderSheet("content-a", onCreate);
    fireEvent.change(screen.getByPlaceholderText(EDITOR_PLACEHOLDER), { target: { value: "A 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "공개 범위: 전체 공개" }));

    sheet.show("content-b");

    const editor = screen.getByPlaceholderText(EDITOR_PLACEHOLDER) as HTMLTextAreaElement;
    expect(editor.value).toBe("");
    expect(screen.getByRole("button", { name: "공개 범위: 전체 공개" })).toBeTruthy();

    fireEvent.change(editor, { target: { value: "B 의견" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith("B 의견", "public");
  });

  it("opens at the newest opinion after loading without resetting a reader's scroll", async () => {
    const props = sheetProps("content-a", jest.fn<CreateHandler>());
    const ui = (next: OpinionSheetProps) => (
      <MemoryRouter>
        <OpinionSheet {...next} />
      </MemoryRouter>
    );
    const view = render(ui({ ...props, loading: true, comments: undefined }));
    const scrollBody = document.querySelector(".overscroll-contain") as HTMLDivElement;
    Object.defineProperty(scrollBody, "scrollHeight", { configurable: true, value: 640 });

    view.rerender(ui(props));
    await waitFor(() => expect(scrollBody.scrollTop).toBe(640));

    scrollBody.scrollTop = 100;
    view.rerender(ui({ ...props, submitting: true }));
    expect(scrollBody.scrollTop).toBe(100);
  });
});
