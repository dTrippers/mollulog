import { describe, expect, it } from "@jest/globals";
import { parseWalkthroughTimelineDocument } from "~/domain/walkthrough-timeline";
import {
  DEMO_WALKTHROUGH_STUDENT_UIDS,
  DEMO_WALKTHROUGH_TIMELINE,
  DEMO_WALKTHROUGH_TIMELINE_UID,
  isDemoWalkthroughTimelineUid,
} from "~/domain/walkthrough-timeline-demo";

describe("walkthrough timeline demo", () => {
  it("is a valid Binah heavy-armor timeline document", () => {
    expect(parseWalkthroughTimelineDocument(DEMO_WALKTHROUGH_TIMELINE.document)).toBe(
      DEMO_WALKTHROUGH_TIMELINE.document,
    );
    expect(DEMO_WALKTHROUGH_TIMELINE.document.context).toEqual({
      bossUid: "binah",
      terrain: "street",
      defenseType: "heavy",
      maxDifficulty: "torment",
    });
  });

  it("uses the requested party and starting skills", () => {
    const party = DEMO_WALKTHROUGH_TIMELINE.document.parties[0];
    expect(party.units.map((unit) => unit.studentUid)).toEqual(Object.values(DEMO_WALKTHROUGH_STUDENT_UIDS));
    expect(party.startingSkillStudentUids).toEqual([
      DEMO_WALKTHROUGH_STUDENT_UIDS.armedAris,
      DEMO_WALKTHROUGH_STUDENT_UIDS.swimsuitMika,
      DEMO_WALKTHROUGH_STUDENT_UIDS.aru,
    ]);
    expect(party.units.map((unit) => unit.snapshot?.tier)).toEqual([8, 7, 6, 5, 4, 3]);
  });

  it("uses the requested nine-stage skill sequence", () => {
    const steps = DEMO_WALKTHROUGH_TIMELINE.document.parties[0].steps;
    const stages = steps.filter((step) => step.kind !== "divider");
    expect(stages).toHaveLength(9);
    expect(new Set(steps.flatMap((step) => (step.marker ? [step.marker.kind] : [])))).toEqual(
      new Set(["time_remaining", "cost", "after", "immediate"]),
    );
    expect(stages.every((step) => step.kind === "actions")).toBe(true);
    expect(stages.map((step) => step.marker?.value)).toEqual([
      "즉시",
      "코스트 5",
      "코스트 6",
      "즉시",
      "02:30.566",
      "즉시",
      "아루 1스 후",
      "코스트 8",
      "코스트 2",
    ]);
    expect(stages[3].actions).toEqual([
      {
        kind: "student_ex",
        studentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.armedAris,
        copied: true,
        text: "자신에게 사용",
      },
      { kind: "student_ex", studentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.armedAris },
    ]);
    expect(stages[5].note).toBe("그로기 안걸리면 리트");
    expect(steps.find((step) => step.kind === "divider")?.note).toBe("그로기 상태");
    expect(stages[7].actions).toEqual([
      {
        kind: "student_ex",
        studentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.swimsuitNagisa,
        targetStudentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.swimsuitMika,
      },
      {
        kind: "student_ex",
        studentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.swimsuitMika,
        text: "자신에게",
      },
    ]);
    expect(stages[8].actions).toEqual([
      { kind: "student_ex", studentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.swimsuitMika },
      { kind: "student_ex", studentUid: DEMO_WALKTHROUGH_STUDENT_UIDS.swimsuitMika },
    ]);
  });

  it("recognizes only the reserved demo uid", () => {
    expect(isDemoWalkthroughTimelineUid(DEMO_WALKTHROUGH_TIMELINE_UID)).toBe(true);
    expect(isDemoWalkthroughTimelineUid("another-timeline")).toBe(false);
    expect(isDemoWalkthroughTimelineUid(undefined)).toBe(false);
  });
});
