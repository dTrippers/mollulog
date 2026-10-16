/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommentComposer } from "~/components/v2/features/comments/CommentComposer";
import { stubCoarsePointer } from "./pointer-media-stub";

function renderComposer(onSubmit = jest.fn<(body: string, visibility: "private" | "public") => void>()) {
  render(
    <CommentComposer
      label="의견 작성"
      placeholder="의견을 남겨보세요"
      submitLabel="등록"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("CommentComposer", () => {
  beforeEach(() => stubCoarsePointer(false));

  it("resets visibility to public after a submit, with the cleared body", () => {
    const onSubmit = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "공개 범위: 전체 공개" }));
    const editor = screen.getByPlaceholderText("의견을 남겨보세요");
    fireEvent.change(editor, { target: { value: "나만 볼 의견" } });

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("나만 볼 의견", "private");
    expect(editor).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: "공개 범위: 전체 공개" })).toBeTruthy();
  });

  it("labels the editor from its own label, with an id that is unique per instance", () => {
    render(
      <>
        <CommentComposer label="의견 작성" placeholder="첫째" submitLabel="등록" onSubmit={() => undefined} />
        <CommentComposer label="의견 작성" placeholder="둘째" submitLabel="등록" onSubmit={() => undefined} />
      </>,
    );

    const editors = screen.getAllByRole("textbox");
    expect(editors).toHaveLength(2);
    expect(editors[0].id).not.toBe(editors[1].id);
    expect(screen.getAllByLabelText("의견 작성")).toHaveLength(2);
  });

  it("appends the shortcut hint to the placeholder only for a fine pointer", () => {
    const composer = (
      <CommentComposer
        label="의견 작성"
        placeholder="의견을 남겨보세요"
        shortcutHint="Enter로 등록"
        submitLabel="등록"
        onSubmit={() => undefined}
      />
    );
    const { unmount } = render(composer);
    expect(screen.getByRole("textbox").getAttribute("placeholder")).toBe("의견을 남겨보세요 (Enter로 등록)");
    unmount();

    stubCoarsePointer(true);
    render(composer);
    expect(screen.getByRole("textbox").getAttribute("placeholder")).toBe("의견을 남겨보세요");
  });
});
