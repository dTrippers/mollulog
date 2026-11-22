import { describe, expect, it } from "@jest/globals";
import {
  isActionOutsideParty,
  moveItem,
  renumberSteps,
  walkthroughPartySlots,
  walkthroughPartyStudentUids,
  walkthroughUnitsFromSlots,
} from "~/components/v2/features/walkthroughs/walkthrough-editor-state";
import type { TimelineStep } from "~/domain/walkthrough-timeline";

describe("walkthrough editor state", () => {
  it("moves an item and ignores a move outside the list", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 3)).toEqual(["a", "b", "c"]);
  });

  it("renumbers steps in list order", () => {
    const steps: TimelineStep[] = [
      { uid: "b", order: 1, kind: "divider", actions: [] },
      { uid: "a", order: 0, kind: "divider", actions: [] },
    ];
    expect(renumberSteps(steps).map((step) => [step.uid, step.order])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("turns units into slots and back, keeping growth values and dropping slots outside the party size", () => {
    const party = {
      units: [
        { slot: 4, studentUid: "special", snapshot: { tier: 7, level: 90 } },
        { slot: 0, studentUid: "striker" },
        { slot: 9, studentUid: "outside" },
      ],
    };
    const slots = walkthroughPartySlots(party, 6, { special: { tier: 5 } });
    expect(slots).toHaveLength(6);
    expect(slots[0]).toMatchObject({ studentUid: "striker", assist: false, baseline: null });
    expect(slots[4]).toMatchObject({ studentUid: "special", snapshot: { tier: 7, level: 90 }, baseline: { tier: 5 } });
    expect(slots.filter(Boolean)).toHaveLength(2);

    expect(walkthroughUnitsFromSlots(slots)).toEqual({
      units: [
        { slot: 0, studentUid: "striker" },
        { slot: 4, studentUid: "special", snapshot: { tier: 7, level: 90 } },
      ],
      baselines: { special: { tier: 5 } },
    });
  });

  it("lists the party's students in slot order", () => {
    expect(
      walkthroughPartyStudentUids({
        units: [
          { slot: 2, studentUid: "c" },
          { slot: 0, studentUid: "a" },
          { slot: 1, studentUid: null },
        ],
      }),
    ).toEqual(["a", "c"]);
  });

  it("marks a skill whose student or target left the party", () => {
    const party = new Set(["a", "b"]);
    expect(isActionOutsideParty({ kind: "student_ex", studentUid: "a", targetStudentUid: "b" }, party)).toBe(false);
    expect(isActionOutsideParty({ kind: "student_ex", studentUid: "c" }, party)).toBe(true);
    expect(isActionOutsideParty({ kind: "student_ex", studentUid: "a", targetStudentUid: "c" }, party)).toBe(true);
    expect(isActionOutsideParty({ kind: "free_text", text: "보스 패턴" }, party)).toBe(false);
  });
});
