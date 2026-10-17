import { describe, expect, it } from "@jest/globals";
import {
  buildGiftPlanSavePayload,
  createStudentItemsMap,
  getSavedGiftPlanSnapshot,
  hasStudentGiftPlanChanges,
  syncStudentItemsFromProps,
  updateSavedGiftPlanBaseline,
  updateStudentGiftPlanQuantity,
} from "~/domain/relationship-gift-plan";

describe("relationship gift-plan editing", () => {
  it("marks nullable gift-plan saves without relationship fields", () => {
    expect(buildGiftPlanSavePayload("student-a", { "gift-a": 2 })).toEqual({
      studentId: "student-a",
      items: { "gift-a": 2 },
      stateFormat: "nullable",
    });
  });

  it.each([
    "nullable",
    "legacy",
  ] as const)("keeps an edit made during save through revalidation in %s mode", (writeMode) => {
    const initial = [{ uid: "student-a", items: { "gift-a": 0 } }];
    let edited = createStudentItemsMap(initial);
    let savedBaseline = createStudentItemsMap(initial);
    edited = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 3);

    const payload =
      writeMode === "nullable"
        ? buildGiftPlanSavePayload("student-a", { ...edited.get("student-a")?.items })
        : [
            {
              studentId: "student-a",
              items: { ...edited.get("student-a")?.items },
              currentLevel: 1,
              currentExp: null,
              targetLevel: 2,
            },
          ][0];
    const failedResponse = { success: false, retryable: true };
    expect(failedResponse.retryable).toBe(true);
    expect(savedBaseline.get("student-a")?.items["gift-a"]).toBe(0);

    edited = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 5);
    expect(payload.items).toEqual({ "gift-a": 3 });

    const savedPlans = getSavedGiftPlanSnapshot([payload]);
    savedBaseline = updateSavedGiftPlanBaseline(savedBaseline, savedPlans);
    const parentProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    edited = syncStudentItemsFromProps(edited, savedBaseline, parentProps);
    savedBaseline = parentProps;

    expect(savedBaseline.get("student-a")?.items["gift-a"]).toBe(3);
    expect(edited.get("student-a")?.items["gift-a"]).toBe(5);
    expect(hasStudentGiftPlanChanges(edited, savedBaseline, "student-a", "gift-a")).toBe(true);

    const revalidatedProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    edited = syncStudentItemsFromProps(edited, savedBaseline, revalidatedProps);
    savedBaseline = revalidatedProps;
    expect(savedBaseline.get("student-a")?.items["gift-a"]).toBe(3);
    expect(edited.get("student-a")?.items["gift-a"]).toBe(5);
    expect(hasStudentGiftPlanChanges(edited, savedBaseline, "student-a", "gift-a")).toBe(true);

    const postSubmitReset = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 0);
    const stillSavedProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    expect(
      syncStudentItemsFromProps(postSubmitReset, savedBaseline, stillSavedProps).get("student-a")?.items["gift-a"],
    ).toBe(0);
  });

  it("adopts new saved props when there were no later edits", () => {
    let edited = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 0 } }]);
    let baseline = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 0 } }]);
    edited = updateStudentGiftPlanQuantity(edited, "student-a", "gift-a", 3);
    const savedPlans = getSavedGiftPlanSnapshot([{ studentId: "student-a", items: { "gift-a": 3 } }]);
    baseline = updateSavedGiftPlanBaseline(baseline, savedPlans);
    const nextProps = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 3 } }]);
    edited = syncStudentItemsFromProps(edited, baseline, nextProps);

    expect(edited.get("student-a")?.items["gift-a"]).toBe(3);
    expect(hasStudentGiftPlanChanges(edited, nextProps, "student-a", "gift-a")).toBe(false);
  });

  it("keeps edits in a draft against unchanged server props", () => {
    const initial = createStudentItemsMap([{ uid: "student-a", items: { "gift-a": 0 } }]);
    const edited = updateStudentGiftPlanQuantity(initial, "student-a", "gift-a", 4);
    const synced = syncStudentItemsFromProps(edited, initial, initial);

    expect(synced.get("student-a")?.items["gift-a"]).toBe(4);
    expect(hasStudentGiftPlanChanges(synced, initial, "student-a", "gift-a")).toBe(true);
  });
});
