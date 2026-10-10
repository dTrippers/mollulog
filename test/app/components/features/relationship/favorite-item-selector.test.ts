import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildGiftPlanSavePayload,
  createStudentItemsMap,
  GiftPlanSaveError,
  getGiftPlanSaveSnapshotForResult,
  hasStudentGiftPlanChanges,
  syncStudentItemsFromProps,
  updateSavedGiftPlanBaseline,
  updateStudentGiftPlanQuantity,
} from "~/components/features/relationship/FavoritedItemSelector";
import { getOwnedGiftQuantities } from "~/components/features/relationship/FavoriteItemSelector";
import { STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";

describe("buildGiftPlanSavePayload", () => {
  it("marks nullable gift-plan saves without sending relationship values", () => {
    expect(buildGiftPlanSavePayload("student-a", { "gift-a": 2 })).toEqual({
      studentId: "student-a",
      items: { "gift-a": 2 },
      stateFormat: "nullable",
    });
  });
});

describe("gift-plan save and student-prop synchronization", () => {
  it.each([
    "nullable",
    "legacy",
  ] as const)("keeps an edit made after a failed save through retry success and revalidation in %s mode", (writeMode) => {
    const initialProps = [{ uid: "student-a", items: { "gift-a": 0 } }];
    let edited = createStudentItemsMap(initialProps);
    let savedBaseline = createStudentItemsMap(initialProps);

    edited = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 3);
    const submittedItems = { ...edited.get("student-a")?.items };
    const retryPayload =
      writeMode === "nullable"
        ? [buildGiftPlanSavePayload("student-a", submittedItems)]
        : [{ studentId: "student-a", items: submittedItems, currentLevel: 1, currentExp: null, targetLevel: 2 }];
    const failedResponse = { success: false, retryable: true };
    expect(failedResponse.retryable).toBe(true);
    expect(getGiftPlanSaveSnapshotForResult(failedResponse.success, retryPayload)).toBeNull();
    expect(savedBaseline.get("student-a")?.items["gift-a"]).toBe(0);

    edited = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 5);
    expect(retryPayload[0]?.items).toEqual({ "gift-a": 3 });

    const savedPlans = getGiftPlanSaveSnapshotForResult(true, retryPayload) ?? [];
    savedBaseline = updateSavedGiftPlanBaseline(savedBaseline, savedPlans);
    const parentStudents = [{ uid: "student-a", items: { "gift-a": 3 } }];
    const parentProps = createStudentItemsMap(parentStudents);
    edited = syncStudentItemsFromProps(edited, savedBaseline, parentProps);
    savedBaseline = parentProps;

    expect(savedBaseline.get("student-a")?.items["gift-a"]).toBe(3);
    expect(edited.get("student-a")?.items["gift-a"]).toBe(5);
    expect(hasStudentGiftPlanChanges(edited, savedBaseline, "student-a", "gift-a")).toBe(true);

    const revalidatedProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    edited = syncStudentItemsFromProps(edited, parentProps, revalidatedProps);
    savedBaseline = revalidatedProps;

    expect(savedBaseline.get("student-a")?.items["gift-a"]).toBe(3);
    expect(edited.get("student-a")?.items["gift-a"]).toBe(5);
    expect(hasStudentGiftPlanChanges(edited, savedBaseline, "student-a", "gift-a")).toBe(true);

    const postSubmitReset = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 0);
    const stillSavedProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    const preservedReset = syncStudentItemsFromProps(postSubmitReset, savedBaseline, stillSavedProps);
    expect(preservedReset.get("student-a")?.items["gift-a"]).toBe(0);
  });

  it("adopts updated props after a legacy save when there were no later edits", () => {
    const initialProps = [{ uid: "student-a", items: { "gift-a": 0 } }];
    let edited = createStudentItemsMap(initialProps);
    let savedBaseline = createStudentItemsMap(initialProps);
    edited = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 3);

    const retryPayload = [
      {
        studentId: "student-a",
        items: { ...edited.get("student-a")?.items },
        currentLevel: 1,
        currentExp: null,
        targetLevel: 2,
      },
    ];
    const savedPlans = getGiftPlanSaveSnapshotForResult(true, retryPayload) ?? [];
    savedBaseline = updateSavedGiftPlanBaseline(savedBaseline, savedPlans);
    const nextProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    edited = syncStudentItemsFromProps(edited, savedBaseline, nextProps);

    expect(edited.get("student-a")?.items["gift-a"]).toBe(nextProps.get("student-a")?.items["gift-a"]);
    expect(hasStudentGiftPlanChanges(edited, nextProps, "student-a", "gift-a")).toBe(false);
  });
});

describe("GiftPlanSaveError", () => {
  it("keeps the page-level stale alert visible without a local save error or retry", () => {
    const markup = renderToStaticMarkup(
      createElement(GiftPlanSaveError, {
        saveError: null,
        staleWriteBlocked: true,
        retryAvailable: true,
        onRetry: () => {},
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain(STUDENT_STATE_STALE_MESSAGE);
    expect(markup).toContain("새로고침");
    expect(markup).not.toContain("다시 시도");
  });

  it("renders nothing during normal switch-off use", () => {
    expect(
      renderToStaticMarkup(
        createElement(GiftPlanSaveError, {
          saveError: null,
          staleWriteBlocked: false,
          retryAvailable: false,
          onRetry: () => {},
        }),
      ),
    ).toBe("");
  });
});

describe("getOwnedGiftQuantities", () => {
  const favoriteItems = [{ item: { uid: "gift-a" } }, { item: { uid: "gift-b" } }, { item: { uid: "gift-c" } }];

  it("keeps only positive inventory quantities for gifts the selected student can receive", () => {
    expect(
      getOwnedGiftQuantities(favoriteItems, {
        "gift-a": 3,
        "gift-b": 0,
        "other-resource": 99,
      }),
    ).toEqual({ "gift-a": 3 });
  });

  it("returns an empty plan before gift or inventory data is available", () => {
    expect(getOwnedGiftQuantities(undefined, { "gift-a": 3 })).toEqual({});
    expect(getOwnedGiftQuantities(favoriteItems, null)).toEqual({});
  });
});
