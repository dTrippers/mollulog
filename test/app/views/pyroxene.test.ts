import { describe, expect, it, jest } from "@jest/globals";
import { bossImageUrl } from "~/models/assets";
import type { MainStoryVolume } from "~/models/main-story";
import type { TimelineContent } from "~/models/timeline-content.server";
import { buildMainStoryRewardContents, getPyroxenePlannerContents } from "~/views/pyroxene";

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupsByUids: jest.fn(),
  getRecruitmentPoolStudents: jest.fn(),
}));
jest.mock("~/models/raid", () => ({ getRaidSchedule: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));
jest.mock("~/models/main-story", () => ({
  ...jest.requireActual<typeof import("~/models/main-story")>("~/models/main-story"),
  getMainStories: jest.fn(),
}));
jest.mock("~/models/timeline-content.server", () => ({
  ...jest.requireActual<typeof import("~/models/timeline-content.server")>("~/models/timeline-content.server"),
  getFutureRaidContents: jest.fn(),
  getTimelineContent: jest.fn(),
  getTimelineContents: jest.fn(),
}));

function mainStoryVolume(overrides: Partial<MainStoryVolume> = {}): MainStoryVolume {
  return {
    uid: "volume-1",
    name: "대책위원회 편",
    label: "Vol.1",
    season: 1,
    sortOrder: 1,
    chapters: [
      {
        uid: "chapter-1",
        name: "첫 번째 장",
        chapterNumber: 1,
        parts: [
          {
            uid: "part-1",
            name: null,
            episodeStart: 1,
            episodeEnd: 3,
            sortOrder: 1,
            schedules: [
              { region: "jp", releasedAt: new Date("2026-07-01T02:00:00.000Z"), confirmed: true },
              { region: "gl", releasedAt: new Date("2026-09-01T02:00:00.000Z"), confirmed: false },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("buildMainStoryRewardContents", () => {
  it("builds GL main story reward contents using 60 pyroxenes per episode", () => {
    const contents = buildMainStoryRewardContents([mainStoryVolume()]);

    expect(contents).toEqual([
      expect.objectContaining({
        kind: "event",
        uid: "main-story-reward:part-1",
        recruitmentGroupUid: null,
        name: "1부 Vol.1 대책위원회 편 제1장 첫 번째 장",
        since: "2026-09-01T02:00:00.000Z",
        rewardAt: "2026-09-01T02:00:00.000Z",
        earnablePyroxene: 180,
        tags: ["main_story_reward"],
        recruitments: [],
      }),
    ]);
    expect(contents[0].until).toBe("2026-09-02T02:00:00.000Z");
  });

  it("omits parts without a GL release schedule or complete episode range", () => {
    const contents = buildMainStoryRewardContents([
      mainStoryVolume({
        chapters: [
          {
            uid: "chapter-1",
            name: null,
            chapterNumber: 1,
            parts: [
              {
                uid: "jp-only",
                name: "JP only",
                episodeStart: 1,
                episodeEnd: 1,
                sortOrder: 1,
                schedules: [{ region: "jp", releasedAt: new Date("2026-07-01T02:00:00.000Z"), confirmed: true }],
              },
              {
                uid: "missing-episode",
                name: "No episode",
                episodeStart: null,
                episodeEnd: 1,
                sortOrder: 2,
                schedules: [{ region: "gl", releasedAt: new Date("2026-09-01T02:00:00.000Z"), confirmed: true }],
              },
            ],
          },
        ],
      }),
    ]);

    expect(contents).toEqual([]);
  });
});

describe("getPyroxenePlannerContents main story rewards", () => {
  it("keeps content rewards at the event end and story-reading rewards at part release", async () => {
    const { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } =
      jest.requireMock<typeof import("~/models/recruitment")>("~/models/recruitment");
    const { getAllStudentsMap } = jest.requireMock<typeof import("~/models/student")>("~/models/student");
    const { getMainStories } = jest.requireMock<typeof import("~/models/main-story")>("~/models/main-story");
    const { getFutureRaidContents, getTimelineContent, getTimelineContents } = jest.requireMock<
      typeof import("~/models/timeline-content.server")
    >("~/models/timeline-content.server");
    const endAt = "2026-09-29T02:00:00.000Z";

    (getTimelineContents as jest.MockedFunction<typeof getTimelineContents>).mockResolvedValue([
      timelineContent({
        uid: "main-story-s2-ex-2-1",
        name: "2부 Ex. 로어추적 편 제2장: 드럼통 속에 숨은 것",
        contentType: "main_story",
        startAt: "2026-09-15T02:00:00.000Z",
        endAt,
        earnablePyroxene: 2_120,
      }),
      timelineContent({
        uid: "main-story-no-reward",
        contentType: "main_story",
        endAt,
        earnablePyroxene: null,
      }),
    ]);
    (getFutureRaidContents as jest.MockedFunction<typeof getFutureRaidContents>).mockResolvedValue([]);
    (getTimelineContent as jest.MockedFunction<typeof getTimelineContent>).mockResolvedValue(
      timelineContent({ uid: "pandemonium-cruise" }),
    );
    (getMainStories as jest.MockedFunction<typeof getMainStories>).mockResolvedValue([
      mainStoryVolume({
        chapters: [
          {
            uid: "chapter-2",
            name: "로어추적 편",
            chapterNumber: 2,
            parts: [
              {
                uid: "part-2-1",
                name: "드럼통 속에 숨은 것",
                episodeStart: 1,
                episodeEnd: 11,
                sortOrder: 1,
                schedules: [{ region: "gl", releasedAt: new Date("2026-09-15T02:00:00.000Z"), confirmed: true }],
              },
            ],
          },
        ],
      }),
    ]);
    (getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>).mockResolvedValue({});
    (getRecruitmentPoolStudents as jest.MockedFunction<typeof getRecruitmentPoolStudents>).mockResolvedValue([]);
    (getRecruitmentGroupsByUids as jest.MockedFunction<typeof getRecruitmentGroupsByUids>).mockResolvedValue([]);

    const contents = await getPyroxenePlannerContents({} as Env);
    const contentReward = contents.find((content) => content.uid === "main-story-s2-ex-2-1");
    const noRewardContent = contents.find((content) => content.uid === "main-story-no-reward");
    const readingReward = contents.find((content) => content.uid === "main-story-reward:part-2-1");

    expect(contentReward).toMatchObject({ until: endAt, earnablePyroxene: 2_120 });
    expect(noRewardContent).toMatchObject({ until: endAt, earnablePyroxene: null });
    expect(readingReward).toMatchObject({
      rewardAt: "2026-09-15T02:00:00.000Z",
      earnablePyroxene: 660,
    });
    expect(contentReward?.uid).not.toBe(readingReward?.uid);
  });
});

function timelineContent(overrides: Partial<TimelineContent> & { uid: string }): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-11-10T02:00:00.000Z",
    endAt: "2026-11-24T02:00:00.000Z",
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event",
    runType: "first",
    occurrence: null,
    contentUid: null,
    shopContentUid: null,
    recruitmentGroupUid: null,
    recruitmentStudentUids: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: null,
    ...overrides,
  };
}

function sharedGroupRecruitment(studentUid: string) {
  return {
    recruitmentType: "usual",
    pickup: true,
    rerun: false,
    since: "2026-11-10T02:00:00.000Z",
    until: null,
    studentName: studentUid,
    student: { uid: studentUid, name: studentUid, attackType: "explosive", defenseType: "light", role: "striker" },
  };
}

describe("getPyroxenePlannerContents with a recruitment group shared by two events", () => {
  it("splits into per-event reward-only entries plus one merged recruitment entry", async () => {
    const { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } =
      jest.requireMock<typeof import("~/models/recruitment")>("~/models/recruitment");
    const { getAllStudentsMap } = jest.requireMock<typeof import("~/models/student")>("~/models/student");
    const { getMainStories } = jest.requireMock<typeof import("~/models/main-story")>("~/models/main-story");
    const { getFutureRaidContents, getTimelineContent, getTimelineContents } = jest.requireMock<
      typeof import("~/models/timeline-content.server")
    >("~/models/timeline-content.server");

    const eventA = timelineContent({
      uid: "event-a",
      name: "이벤트A",
      imageUrl: "https://cdn.example.test/event-a.webp",
      startAt: "2026-11-11T02:00:00.000Z",
      endAt: "2026-11-20T02:00:00.000Z",
      earnablePyroxene: 600,
      tags: ["tag-a"],
      recruitmentGroupUid: "shared-group",
      recruitmentStudentUids: ["a", "b"],
    });
    const eventB = timelineContent({
      uid: "event-b",
      name: "이벤트B",
      startAt: "2026-11-12T02:00:00.000Z",
      endAt: "2026-11-22T02:00:00.000Z",
      earnablePyroxene: 500,
      tags: ["tag-b"],
      recruitmentGroupUid: "shared-group",
      recruitmentStudentUids: ["c", "d"],
    });

    (getTimelineContents as jest.MockedFunction<typeof getTimelineContents>).mockResolvedValue([eventA, eventB]);
    (getFutureRaidContents as jest.MockedFunction<typeof getFutureRaidContents>).mockResolvedValue([]);
    (getTimelineContent as jest.MockedFunction<typeof getTimelineContent>).mockResolvedValue(
      timelineContent({
        uid: "pandemonium-cruise",
        startAt: "2026-11-24T02:00:00.000Z",
        endAt: "2026-12-08T02:00:00.000Z",
      }),
    );
    (getMainStories as jest.MockedFunction<typeof getMainStories>).mockResolvedValue([]);
    (getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>).mockResolvedValue({});
    (getRecruitmentPoolStudents as jest.MockedFunction<typeof getRecruitmentPoolStudents>).mockResolvedValue([]);
    (getRecruitmentGroupsByUids as jest.MockedFunction<typeof getRecruitmentGroupsByUids>).mockResolvedValue([
      {
        uid: "shared-group",
        startAt: "2026-11-10T02:00:00.000Z",
        endAt: "2026-11-24T02:00:00.000Z",
        recruitmentType: "usual",
        recruitments: [
          sharedGroupRecruitment("a"),
          sharedGroupRecruitment("b"),
          sharedGroupRecruitment("c"),
          sharedGroupRecruitment("d"),
        ],
      },
    ] as unknown as Awaited<ReturnType<typeof getRecruitmentGroupsByUids>>);

    const contents = await getPyroxenePlannerContents({} as Env);

    expect(new Set(contents.map((c) => c.uid))).toEqual(new Set(["event-a", "event-b", "group:shared-group"]));

    const rewardA = contents.find((c) => c.uid === "event-a");
    const rewardB = contents.find((c) => c.uid === "event-b");
    expect(rewardA).toMatchObject({
      earnablePyroxene: 600,
      recruitments: [],
      imageUrl: "https://cdn.example.test/event-a.webp",
    });
    expect(rewardB).toMatchObject({ earnablePyroxene: 500, recruitments: [] });

    const merged = contents.find((c) => c.uid === "group:shared-group");
    expect(merged).toMatchObject({
      name: "이벤트A / 이벤트B",
      since: "2026-11-10T02:00:00.000Z",
      until: "2026-11-24T02:00:00.000Z",
      earnablePyroxene: null,
      imageUrl: null,
    });
    expect(merged && "recruitments" in merged ? merged.recruitments.map((r) => r.student?.uid) : null).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(
      merged && "recruitments" in merged ? merged.recruitments.map((r) => [r.student?.uid, r.sourceContentUid]) : null,
    ).toEqual([
      ["a", "event-a"],
      ["b", "event-a"],
      ["c", "event-b"],
      ["d", "event-b"],
    ]);
  });
});

describe("getPyroxenePlannerContents raid season identity", () => {
  it("forwards the raid schedule seasonIndex for the planner information link", async () => {
    const { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } =
      jest.requireMock<typeof import("~/models/recruitment")>("~/models/recruitment");
    const { getAllStudentsMap } = jest.requireMock<typeof import("~/models/student")>("~/models/student");
    const { getMainStories } = jest.requireMock<typeof import("~/models/main-story")>("~/models/main-story");
    const { getFutureRaidContents, getRaidSchedule, getTimelineContent, getTimelineContents } = {
      ...jest.requireMock<typeof import("~/models/timeline-content.server")>("~/models/timeline-content.server"),
      ...jest.requireMock<typeof import("~/models/raid")>("~/models/raid"),
    };

    (getTimelineContents as jest.MockedFunction<typeof getTimelineContents>).mockResolvedValue([]);
    (getFutureRaidContents as jest.MockedFunction<typeof getFutureRaidContents>).mockResolvedValue([
      timelineContent({
        uid: "raid-content-uid",
        contentType: "raid",
        contentUid: "raid-schedule-uid",
        startAt: "2026-11-10T02:00:00.000Z",
        endAt: "2026-11-17T02:00:00.000Z",
        imageUrl: "https://cdn.example.test/raid-content.webp",
      }),
    ]);
    (getTimelineContent as jest.MockedFunction<typeof getTimelineContent>).mockResolvedValue(
      timelineContent({ uid: "pandemonium-cruise" }),
    );
    (getMainStories as jest.MockedFunction<typeof getMainStories>).mockResolvedValue([]);
    (getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>).mockResolvedValue({});
    (getRecruitmentPoolStudents as jest.MockedFunction<typeof getRecruitmentPoolStudents>).mockResolvedValue([]);
    (getRecruitmentGroupsByUids as jest.MockedFunction<typeof getRecruitmentGroupsByUids>).mockResolvedValue([]);
    (getRaidSchedule as jest.MockedFunction<typeof getRaidSchedule>).mockResolvedValue({
      raidBoss: { uid: "shirokuro", name: "시로&쿠로" },
      raidType: "total_assault",
      seasonIndex: 41,
      endAt: "2026-11-17T02:00:00.000Z",
    } as Awaited<ReturnType<typeof getRaidSchedule>>);

    const contents = await getPyroxenePlannerContents({} as Env);

    expect(contents.find((content) => content.kind === "raid")).toMatchObject({
      uid: "raid-content-uid",
      type: "total_assault",
      seasonIndex: 41,
      name: "시로&쿠로",
      imageUrl: bossImageUrl("shirokuro"),
    });
  });

  it("falls back to the content image when the raid boss is unknown", async () => {
    const { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } =
      jest.requireMock<typeof import("~/models/recruitment")>("~/models/recruitment");
    const { getAllStudentsMap } = jest.requireMock<typeof import("~/models/student")>("~/models/student");
    const { getMainStories } = jest.requireMock<typeof import("~/models/main-story")>("~/models/main-story");
    const { getFutureRaidContents, getRaidSchedule, getTimelineContent, getTimelineContents } = {
      ...jest.requireMock<typeof import("~/models/timeline-content.server")>("~/models/timeline-content.server"),
      ...jest.requireMock<typeof import("~/models/raid")>("~/models/raid"),
    };

    (getTimelineContents as jest.MockedFunction<typeof getTimelineContents>).mockResolvedValue([]);
    (getFutureRaidContents as jest.MockedFunction<typeof getFutureRaidContents>).mockResolvedValue([
      timelineContent({
        uid: "raid-content-uid-2",
        contentType: "raid",
        contentUid: null,
        startAt: "2026-11-10T02:00:00.000Z",
        endAt: "2026-11-17T02:00:00.000Z",
        imageUrl: "https://cdn.example.test/raid-content.webp",
      }),
    ]);
    (getTimelineContent as jest.MockedFunction<typeof getTimelineContent>).mockResolvedValue(
      timelineContent({ uid: "pandemonium-cruise" }),
    );
    (getMainStories as jest.MockedFunction<typeof getMainStories>).mockResolvedValue([]);
    (getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>).mockResolvedValue({});
    (getRecruitmentPoolStudents as jest.MockedFunction<typeof getRecruitmentPoolStudents>).mockResolvedValue([]);
    (getRecruitmentGroupsByUids as jest.MockedFunction<typeof getRecruitmentGroupsByUids>).mockResolvedValue([]);
    (getRaidSchedule as jest.MockedFunction<typeof getRaidSchedule>).mockResolvedValue(null);

    const contents = await getPyroxenePlannerContents({} as Env);

    expect(contents.find((content) => content.kind === "raid")).toMatchObject({
      uid: "raid-content-uid-2",
      imageUrl: "https://cdn.example.test/raid-content.webp",
    });
  });
});

describe("getPyroxenePlannerContents with an unregistered pickup student", () => {
  it("keeps the target as a provisional three-star and switches rules at the anchor event", async () => {
    const { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } =
      jest.requireMock<typeof import("~/models/recruitment")>("~/models/recruitment");
    const { getAllStudentsMap } = jest.requireMock<typeof import("~/models/student")>("~/models/student");
    const { getMainStories } = jest.requireMock<typeof import("~/models/main-story")>("~/models/main-story");
    const { getFutureRaidContents, getTimelineContent, getTimelineContents } = jest.requireMock<
      typeof import("~/models/timeline-content.server")
    >("~/models/timeline-content.server");
    const event = timelineContent({
      uid: "pandemonium-cruise-schedule",
      name: "판데모니엄 크루즈",
      startAt: "2026-11-24T02:00:00.000Z",
      endAt: "2026-12-08T02:00:00.000Z",
      recruitmentGroupUid: "anchor-group",
    });

    (getTimelineContents as jest.MockedFunction<typeof getTimelineContents>).mockResolvedValue([event]);
    (getFutureRaidContents as jest.MockedFunction<typeof getFutureRaidContents>).mockResolvedValue([]);
    (getTimelineContent as jest.MockedFunction<typeof getTimelineContent>).mockResolvedValue(
      timelineContent({
        uid: "pandemonium-cruise",
        startAt: "2026-11-24T02:00:00.000Z",
        endAt: "2026-12-08T02:00:00.000Z",
      }),
    );
    (getMainStories as jest.MockedFunction<typeof getMainStories>).mockResolvedValue([]);
    (getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>).mockResolvedValue({});
    (getRecruitmentPoolStudents as jest.MockedFunction<typeof getRecruitmentPoolStudents>).mockResolvedValue([]);
    (getRecruitmentGroupsByUids as jest.MockedFunction<typeof getRecruitmentGroupsByUids>).mockResolvedValue([
      {
        uid: "anchor-group",
        startAt: "2026-11-24T02:00:00.000Z",
        endAt: "2026-12-08T02:00:00.000Z",
        recruitmentType: "usual",
        recruitments: [
          {
            recruitmentType: "usual",
            pickup: true,
            rerun: false,
            since: "2026-11-24T02:00:00.000Z",
            until: null,
            studentName: "미등록 학생",
            student: null,
          },
        ],
      },
    ] as unknown as Awaited<ReturnType<typeof getRecruitmentGroupsByUids>>);

    const content = (await getPyroxenePlannerContents({} as Env)).find(
      (candidate) => candidate.kind === "event" && candidate.uid === event.uid,
    );

    expect(content).toMatchObject({
      recruitmentRuleSet: "call_charge_v1",
      recruitmentPool: { tier3Count: 1 },
      recruitments: [
        {
          student: {
            uid: expect.stringMatching(/^provisional:/),
            imageUid: null,
            name: "미등록 학생",
            initialTier: 3,
          },
        },
      ],
    });
  });
});
