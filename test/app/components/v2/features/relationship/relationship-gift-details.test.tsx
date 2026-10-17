/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  createStudentItemsMap,
  updateStudentGiftPlanQuantity,
  type StudentItemsMap,
} from "~/domain/relationship-gift-plan";
import { STUDENT_STATE_STALE_CODE, STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";
import {
  RelationshipGiftDetails,
  type RelationshipGiftStudent,
} from "~/components/v2/features/relationship/RelationshipGiftDetails";
import { V2Page } from "~/components/v2/layout";
import type { AllStudentsFavoriteItems } from "~/models/resource";

const student: RelationshipGiftStudent = {
  uid: "student-a",
  name: "키사키(수영복)",
  currentLevel: 20,
  currentExp: null,
  targetLevel: 50,
  items: { "gift-a": 0 },
  order: 1,
};
const item: AllStudentsFavoriteItems = {
  itemUid: "gift-a",
  itemName: "테스트 선물",
  itemRarity: 3,
  favoriteLevels: { 3: { exp: 60, students: [{ uid: student.uid, name: student.name }] } },
};

function GiftDetailsHarness({
  onStaleWriteBlocked,
  initiallyStale = false,
}: {
  onStaleWriteBlocked: () => void;
  initiallyStale?: boolean;
}) {
  const [studentItemsMap, setStudentItemsMap] = useState<StudentItemsMap>(() =>
    createStudentItemsMap([{ uid: student.uid, items: { "gift-a": 2 } }]),
  );
  const [initialStudentItems] = useState(() => createStudentItemsMap([{ uid: student.uid, items: { "gift-a": 0 } }]));
  const [staleWriteBlocked, setStaleWriteBlocked] = useState(initiallyStale);
  return (
    <RelationshipGiftDetails
      item={item}
      students={[student]}
      studentItemsMap={studentItemsMap}
      initialStudentItems={initialStudentItems}
      requiredQuantity={2}
      ownedQuantity={null}
      breakdown={[]}
      writeMode="legacy"
      isAuthenticated
      staleWriteBlocked={staleWriteBlocked}
      commonItemUids={[]}
      onQuantityChange={(studentUid, itemUid, quantity) =>
        setStudentItemsMap((current) => updateStudentGiftPlanQuantity(current, studentUid, itemUid, quantity))
      }
      onStaleWriteBlocked={() => {
        setStaleWriteBlocked(true);
        onStaleWriteBlocked();
      }}
      onSaved={() => undefined}
    />
  );
}

function renderGiftDetails(
  action: () => Promise<unknown>,
  onStaleWriteBlocked = jest.fn(),
  openEditor = true,
  initiallyStale = false,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: () => (
          <V2Page width="wide">
            <GiftDetailsHarness onStaleWriteBlocked={onStaleWriteBlocked} initiallyStale={initiallyStale} />
          </V2Page>
        ),
        action,
      },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <div className="mllg-content-area">
      <RouterProvider router={router} />
    </div>,
  );
  if (openEditor) fireEvent.click(screen.getByRole("button", { name: "선물 개수 입력" }));
  return onStaleWriteBlocked;
}

describe("RelationshipGiftDetails", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.useRealTimers();
  });

  it("shows formatted student variants on separate lines in the read-only gift grid", () => {
    renderGiftDetails(
      jest.fn(async () => ({ success: true })),
      jest.fn(),
      false,
    );

    expect(screen.getByText("키사키")).toBeTruthy();
    expect(screen.getByText("수영복")).toBeTruthy();
  });

  it("scrolls a focused edit row only by its measured overlap with the save bar", () => {
    const windowScrollBy = jest.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    renderGiftDetails(jest.fn(async () => ({ success: true })));

    const input = screen.getByRole("textbox", { name: "키사키(수영복) 테스트 선물 수량" });
    const row = input.closest("[data-gift-edit-row]");
    const scrollContainer = row?.closest<HTMLElement>(".mllg-content-area");
    const saveBar = screen.getByRole("button", { name: "취소" }).parentElement?.parentElement;
    if (!(row instanceof HTMLElement) || !scrollContainer || !(saveBar instanceof HTMLElement)) {
      throw new Error("Expected the gift edit row, scroll container, and save bar to be rendered");
    }
    const scrollBy = jest.fn();
    Object.defineProperty(scrollContainer, "scrollBy", { configurable: true, value: scrollBy });

    const rect = (top: number, bottom: number): DOMRect => ({
      x: 0,
      y: top,
      width: 100,
      height: bottom - top,
      top,
      right: 100,
      bottom,
      left: 0,
      toJSON: () => ({}),
    });
    const rowRect = jest.spyOn(row, "getBoundingClientRect").mockReturnValue(rect(618, 662));
    jest.spyOn(saveBar, "getBoundingClientRect").mockReturnValue(rect(658, 706));

    fireEvent.focusIn(input);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 8, behavior: "instant" });

    rowRect.mockReturnValue(rect(600, 640));
    fireEvent.focusIn(input);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(windowScrollBy).not.toHaveBeenCalled();
  });

  it("keeps retryable save failures visible and retries the explicit save", async () => {
    const action = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ success: false, error: "저장하지 못했어요", retryable: true })
      .mockResolvedValueOnce({ success: false, error: "저장하지 못했어요", retryable: true });
    renderGiftDetails(action);

    fireEvent.click(screen.getByRole("button", { name: "변경 사항 저장" }));
    expect(await screen.findByText("저장하지 못했어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it("blocks stale gift saves and asks the user to refresh", async () => {
    const onStaleWriteBlocked = jest.fn();
    const action = jest.fn(async () => ({ success: false, code: STUDENT_STATE_STALE_CODE }));
    renderGiftDetails(action, onStaleWriteBlocked);

    fireEvent.click(screen.getByRole("button", { name: "변경 사항 저장" }));
    expect(await screen.findByText(STUDENT_STATE_STALE_MESSAGE)).toBeTruthy();
    expect(onStaleWriteBlocked).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "새로고침" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("shows global stale recovery even when this gift has no local save error", () => {
    renderGiftDetails(
      jest.fn(async () => ({ success: true })),
      jest.fn(),
      true,
      true,
    );
    expect(screen.getByRole("alert").textContent).toBe(STUDENT_STATE_STALE_MESSAGE + "새로고침");
    expect(screen.getByRole("button", { name: "새로고침" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "변경 사항 저장" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("reports explicit gift saves while pending and after success", async () => {
    let resolveAction: (value: unknown) => void = () => undefined;
    const action = jest.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderGiftDetails(action);

    fireEvent.click(screen.getByRole("button", { name: "변경 사항 저장" }));
    expect(await screen.findByText("저장 중")).toBeTruthy();
    await act(async () => {
      resolveAction({ success: true });
    });
    expect(await screen.findByText("저장됨")).toBeTruthy();
  });
});
