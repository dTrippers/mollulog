import { describe, expect, it } from "@jest/globals";
import { pyroxeneActionMutatesStudentState } from "../../../app/domain/student-state-cutover";

describe("pyroxene student-state maintenance boundary", () => {
  it("guards owned-resource pickup writes", () => {
    expect(
      pyroxeneActionMutatesStudentState("POST", {
        createData: { ownedResources: { eventUid: "event-1", pyroxene: 1, oneTimeTicket: 0, tenTimeTicket: 0 } },
      }),
    ).toBe(true);
  });

  it("does not guard planner or recruitment-result deletes", () => {
    expect(
      pyroxeneActionMutatesStudentState("DELETE", {
        deleteData: { eventUid: "event-1", recruitmentGroupUid: "group-1" },
      }),
    ).toBe(false);
  });

  it("does not guard unrelated planner writes", () => {
    expect(
      pyroxeneActionMutatesStudentState("POST", {
        createData: { buy: { quantity: 1, date: "2026-08-01T00:00:00.000Z" } },
      }),
    ).toBe(false);
    expect(
      pyroxeneActionMutatesStudentState("DELETE", {
        deleteData: { itemUid: "timeline-item-1" },
      }),
    ).toBe(false);
  });
});
