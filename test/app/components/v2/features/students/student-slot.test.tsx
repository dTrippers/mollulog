/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StudentSlot } from "~/components/v2/features/students/StudentSlot";
import type { FutureStudentEntry } from "~/components/v2/features/students/types";
import { V2Page } from "~/components/v2/layout";
import { installLayoutTestEnv, setLayoutWidth } from "../../layout/layout-test-env";

function makeEntry(onToggleFavorite: (favorited: boolean) => void): FutureStudentEntry {
  return {
    studentUid: "student-1",
    studentName: "키사키(수영복)",
    attackType: null,
    defenseType: null,
    role: null,
    recruitmentLabel: "신규",
    recruitmentType: undefined,
    rerun: false,
    favoritedCount: 1284,
    favorited: false,
    completed: false,
    canComplete: false,
    viewerPending: false,
    viewerUnavailable: false,
    resultEditLink: null,
    onToggleFavorite,
    onToggleComplete: () => {},
  } as unknown as FutureStudentEntry;
}

function renderSlot({
  open,
  onOpenChange,
  onToggleFavorite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleFavorite: (favorited: boolean) => void;
}) {
  return (
    <MemoryRouter>
      <V2Page width="wide">
        <StudentSlot entry={makeEntry(onToggleFavorite)} signedIn={false} open={open} onOpenChange={onOpenChange} />
      </V2Page>
    </MemoryRouter>
  );
}

describe("StudentSlot guest actions", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it("closes the popover before a guest's favorite press opens sign-in", () => {
    setLayoutWidth(1024);
    const onOpenChange = jest.fn();
    const onToggleFavorite = jest.fn();
    render(renderSlot({ open: true, onOpenChange, onToggleFavorite }));

    const panel = screen.getByRole("dialog", { name: "키사키 빠른 보기" });
    fireEvent.click(within(panel).getByRole("button", { name: /관심 학생에 등록/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onToggleFavorite).toHaveBeenCalledWith(true);
    expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(onToggleFavorite.mock.invocationCallOrder[0]);
  });

  it("keeps focus off the thumbnail when a guest's sheet closes for sign-in", async () => {
    setLayoutWidth(390);
    const onOpenChange = jest.fn();
    const onToggleFavorite = jest.fn();
    const { container, rerender } = render(renderSlot({ open: false, onOpenChange, onToggleFavorite }));
    // The thumbnail has focus when the sheet opens, so the dialog would restore focus to it on close.
    const thumbnail = container.querySelector("button") as HTMLButtonElement;
    thumbnail.focus();
    rerender(renderSlot({ open: true, onOpenChange, onToggleFavorite }));

    const sheet = screen.getByRole("dialog", { name: "키사키(수영복)" });
    fireEvent.click(within(sheet).getByRole("button", { name: /관심 학생에 등록/ }));
    expect(onToggleFavorite).toHaveBeenCalledWith(true);

    // The parent closes the sheet in response to the close request, as the route does.
    rerender(renderSlot({ open: false, onOpenChange, onToggleFavorite }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).not.toBe(thumbnail));
  });
});
