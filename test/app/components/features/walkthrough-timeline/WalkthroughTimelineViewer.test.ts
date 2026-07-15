import { describe, expect, it } from "@jest/globals";
import { flattenTimelineParties } from "~/components/features/walkthrough-timeline";

describe("flattenTimelineParties", () => {
  it("orders parties and steps while preserving multi-action steps", () => {
    const items = flattenTimelineParties([
      {
        uid: "party-2",
        order: 1,
        startingSkillStudentUids: [],
        units: [],
        steps: [{ uid: "step-2", order: 0, kind: "actions", actions: [{ kind: "student_ex", studentUid: "b" }] }],
      },
      {
        uid: "party-1",
        order: 0,
        startingSkillStudentUids: [],
        units: [],
        steps: [
          {
            uid: "step-1",
            order: 0,
            kind: "actions",
            actions: [
              { kind: "student_ex", studentUid: "a" },
              { kind: "student_ex", studentUid: "b" },
            ],
          },
        ],
      },
    ]);
    expect(items.map(({ partyNumber, step }) => [partyNumber, step.uid, step.actions.length])).toEqual([
      [1, "step-1", 2],
      [2, "step-2", 1],
    ]);
  });
});
