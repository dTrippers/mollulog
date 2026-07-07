import { describe, expect, it } from "@jest/globals";
import { buildPyroxeneScheduleItems, type PyroxeneScheduleContent } from "~/domain/pyroxene-schedule";
import { RecruitmentTypeEnum } from "~/graphql/graphql";

function recruitment(
  studentUid: string,
  sourceContentUid?: string,
): NonNullable<PyroxeneScheduleContent & { kind: "event" }>["recruitments"][number] {
  return {
    recruitmentType: RecruitmentTypeEnum.Usual,
    pickup: true,
    rerun: false,
    until: null,
    student: { uid: studentUid, name: studentUid, initialTier: 3 },
    ...(sourceContentUid ? { sourceContentUid } : {}),
  };
}

describe("buildPyroxeneScheduleItems favorited resolution", () => {
  it("resolves favorited using the content uid when recruitments carry no sourceContentUid", () => {
    const contents: PyroxeneScheduleContent[] = [
      {
        kind: "event",
        uid: "event-a",
        name: "이벤트A",
        since: "2026-11-10T02:00:00.000Z",
        until: "2026-11-24T02:00:00.000Z",
        earnablePyroxene: null,
        tags: [],
        recruitments: [recruitment("a")],
      },
    ];

    const items = buildPyroxeneScheduleItems(contents, [{ contentUid: "event-a", studentUid: "a" }], []);

    expect(items[0].event?.recruitments[0].favorited).toBe(true);
  });

  it("resolves favorited per-student using sourceContentUid when recruitments are merged from multiple events", () => {
    // Simulates the getPyroxenePlannerContents merged entry: students A/B belong to event-a,
    // students C/D belong to event-b, all surfaced under one synthetic "group:*" content.
    const contents: PyroxeneScheduleContent[] = [
      {
        kind: "event",
        uid: "group:shared-group",
        name: "이벤트A / 이벤트B",
        since: "2026-11-10T02:00:00.000Z",
        until: "2026-11-24T02:00:00.000Z",
        earnablePyroxene: null,
        tags: [],
        recruitments: [
          recruitment("a", "event-a"),
          recruitment("b", "event-a"),
          recruitment("c", "event-b"),
          recruitment("d", "event-b"),
        ],
      },
    ];
    const favoritedStudents = [
      { contentUid: "event-a", studentUid: "a" },
      { contentUid: "event-b", studentUid: "c" },
    ];

    const items = buildPyroxeneScheduleItems(contents, favoritedStudents, []);
    const favoritedByStudentUid = Object.fromEntries(
      (items[0].event?.recruitments ?? []).map((r) => [r.student?.uid, r.favorited]),
    );

    expect(favoritedByStudentUid).toEqual({ a: true, b: false, c: true, d: false });
  });
});
