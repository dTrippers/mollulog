import { describe, expect, it } from "@jest/globals";
import { hasRecruitRecommendation, recruitVerdictLabel } from "~/domain/recruit-recommendation";
import {
  buildRecruitTimeline,
  type RecruitTimelinePickup,
  selectRecruitMarks,
} from "~/domain/recruit-recommendation-timeline";
import type { UtcIsoString } from "~/lib/date-time";
import type {
  RecruitGoalRecommendation,
  RecruitRecommendationAnswer,
  RecruitRecommendationStudent,
} from "~/models/recruit-recommendation-contract";

const now = "2026-11-24T00:00:00.000Z" as UtcIsoString;
const since = "2026-11-25T02:00:00.000Z" as UtcIsoString;
const until = "2026-12-02T02:00:00.000Z" as UtcIsoString;

function recommendation(overrides: Partial<RecruitGoalRecommendation> = {}): RecruitGoalRecommendation {
  return {
    verdict: { kind: "general", level: 2, evidence: "window" },
    tileBosses: [],
    bosses: [],
    communityLevel: null,
    growth: null,
    newbie: null,
    ...overrides,
  };
}

function student(studentUid: string, overrides: Partial<RecruitGoalRecommendation> = {}): RecruitRecommendationStudent {
  return { studentUid, tags: [], recommendation: recommendation(overrides) };
}

function pickup(studentUid: string | null, overrides: Partial<RecruitTimelinePickup> = {}): RecruitTimelinePickup {
  return { favoriteKey: studentUid ?? "unlisted", studentUid, since, until, ...overrides };
}

type Content = { uid: string; until: UtcIsoString | null; pickups: RecruitTimelinePickup[] };

function build(
  contents: Content[],
  answer: Pick<RecruitRecommendationAnswer, "students" | "pickups">,
  options: { goal?: "top" | "platinum" | "newbie"; recruited?: string[] } = {},
) {
  return buildRecruitTimeline<Content, RecruitTimelinePickup>({
    goal: options.goal ?? "top",
    answer,
    contents,
    recruitedStudentUids: new Set(options.recruited ?? []),
    now,
  });
}

describe("recruit verdict names", () => {
  it("names general and boss verdicts by goal, and nothing for no recommendation", () => {
    expect(recruitVerdictLabel("top", { kind: "general", level: 2, evidence: "window" })).toBe("최우선");
    expect(recruitVerdictLabel("platinum", { kind: "general", level: 2, evidence: "past" })).toBe("우선");
    expect(recruitVerdictLabel("top", { kind: "general", level: 1, evidence: "window" })).toBe("여유 시");
    expect(recruitVerdictLabel("top", { kind: "boss", level: 2, evidence: "window" })).toBe("특정 보스 특화");
    expect(recruitVerdictLabel("top", { kind: "boss", level: 1, evidence: "window" })).toBe("특정 보스 기용");
    expect(recruitVerdictLabel("top", { kind: "general", level: 0, evidence: null })).toBeNull();
    expect(recruitVerdictLabel("top", { kind: null, level: 0, evidence: null })).toBeNull();
  });

  it("recommends a newbie-goal student by its newbie rank alone", () => {
    const newbie = { rank: 1, group: "usual" as const, evidence: "statistics" as const };
    expect(hasRecruitRecommendation("newbie", { verdict: { kind: null, level: 0, evidence: null }, newbie })).toBe(
      true,
    );
    expect(
      hasRecruitRecommendation("newbie", { verdict: { kind: "general", level: 2, evidence: "window" }, newbie: null }),
    ).toBe(false);
  });
});

describe("recruit recommendation timeline", () => {
  it("places each pickup student as recommended, not recommended, or pending", () => {
    const timeline = build(
      [{ uid: "fes", until, pickups: [pickup("10001"), pickup("10002"), pickup("10003"), pickup(null)] }],
      {
        students: [student("10001"), student("10002", { verdict: { kind: null, level: 0, evidence: null } })],
        pickups: [{ studentUid: "10001", startAt: since, aiRecommended: true }],
      },
    );

    expect(timeline.allRecommendedRecruited).toBe(false);
    expect(timeline.contents).toHaveLength(1);
    const [content] = timeline.contents;
    expect(content.recommended.map(({ pickup, aiRecommended }) => [pickup.studentUid, aiRecommended])).toEqual([
      ["10001", true],
    ]);
    expect(content.notRecommended.map(({ pickup }) => pickup.studentUid)).toEqual(["10002"]);
    expect(content.pending.map(({ studentUid }) => studentUid)).toEqual(["10003", null]);
  });

  it("marks AI recommendation per pickup start, so the same student can differ between pickups", () => {
    const later = "2027-01-05T02:00:00.000Z" as UtcIsoString;
    const timeline = build(
      [
        { uid: "first", until, pickups: [pickup("10001")] },
        { uid: "second", until: null, pickups: [pickup("10001", { since: later, until: null })] },
      ],
      {
        students: [student("10001", { verdict: { kind: "boss", level: 2, evidence: "window" } })],
        pickups: [
          { studentUid: "10001", startAt: since, aiRecommended: true },
          { studentUid: "10001", startAt: later, aiRecommended: false },
        ],
      },
    );

    expect(timeline.contents.map(({ recommended }) => recommended[0].aiRecommended)).toEqual([true, false]);
  });

  it("places recruited students apart, and leaves out ended contents and pickups and repeated pickups", () => {
    const ended = "2026-11-20T02:00:00.000Z" as UtcIsoString;
    const timeline = build(
      [
        { uid: "ended", until: ended, pickups: [pickup("10002")] },
        {
          uid: "open",
          until,
          pickups: [pickup("10001"), pickup("10002"), pickup("10002"), pickup("10003", { until: ended })],
        },
        { uid: "recruited-only", until, pickups: [pickup("10001")] },
      ],
      { students: [student("10001"), student("10002"), student("10003")], pickups: [] },
      { recruited: ["10001"] },
    );

    expect(timeline.contents.map(({ content }) => content.uid)).toEqual(["open", "recruited-only"]);
    expect(timeline.contents[0].recommended.map(({ pickup }) => pickup.studentUid)).toEqual(["10002"]);
    expect(timeline.contents[0].recruited.map(({ studentUid }) => studentUid)).toEqual(["10001"]);
    expect(timeline.contents[1].recommended).toEqual([]);
    expect(timeline.contents[1].recruited.map(({ studentUid }) => studentUid)).toEqual(["10001"]);
    expect(timeline.allRecommendedRecruited).toBe(false);
  });

  it("says when every recommended student was recruited", () => {
    const timeline = build(
      [{ uid: "fes", until, pickups: [pickup("10001"), pickup("10002")] }],
      {
        students: [student("10001"), student("10002", { verdict: { kind: null, level: 0, evidence: null } })],
        pickups: [],
      },
      { recruited: ["10001"] },
    );

    expect(timeline.allRecommendedRecruited).toBe(true);
    expect(timeline.contents[0].notRecommended).toHaveLength(1);
  });

  it("does not call a goal with no recommendation all recruited", () => {
    const timeline = build(
      [{ uid: "fes", until, pickups: [pickup("10002")] }],
      { students: [student("10002", { verdict: { kind: null, level: 0, evidence: null } })], pickups: [] },
      { recruited: ["10002"] },
    );

    expect(timeline.allRecommendedRecruited).toBe(false);
    expect(timeline.contents[0].recruited.map(({ studentUid }) => studentUid)).toEqual(["10002"]);
  });

  it("orders the newbie goal's students by newbie rank", () => {
    const rank = (value: number) => ({
      newbie: { rank: value, group: "usual" as const, evidence: "statistics" as const },
    });
    const timeline = build(
      [{ uid: "fes", until, pickups: [pickup("10001"), pickup("10002"), pickup("10003")] }],
      { students: [student("10001", rank(3)), student("10002", rank(1)), student("10003")], pickups: [] },
      { goal: "newbie" },
    );

    expect(timeline.contents[0].recommended.map(({ pickup }) => pickup.studentUid)).toEqual(["10002", "10001"]);
    expect(timeline.contents[0].notRecommended.map(({ pickup }) => pickup.studentUid)).toEqual(["10003"]);
  });
});

describe("미래시 recruit marks", () => {
  it("keeps the recommended pickups of students not recruited", () => {
    expect(
      selectRecruitMarks(
        [
          { studentUid: "10001", startAt: since, aiRecommended: true },
          { studentUid: "10002", startAt: since, aiRecommended: true },
          { studentUid: "10003", startAt: since, aiRecommended: false },
        ],
        new Set(["10002"]),
      ),
    ).toEqual([{ studentUid: "10001", startAt: since }]);
  });
});
