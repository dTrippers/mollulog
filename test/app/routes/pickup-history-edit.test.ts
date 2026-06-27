import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { mergeEditableRecruitmentResultStudents } from "~/domain/recruitment-result";
import { Attack, Defense } from "~/graphql/graphql";
import { getPickupHistory } from "~/models/pickup-history";
import { getAllHistoricalRecruitmentGroups, getRecruitmentGroupByUid } from "~/models/recruitment";
import {
  getRecruitmentResult,
  getRecruitmentResultComment,
  upsertRecruitmentResult,
} from "~/models/recruitment-result";
import { getAllStudents } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import {
  action,
  getVisibleTier3StudentUids,
  loader,
  shouldSkipTier3StudentListInitially,
} from "../../../app/routes/$username.pickups.edit.$id";

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(),
}));

jest.mock("~/models/pickup-history", () => ({
  getPickupHistory: jest.fn(),
}));

jest.mock("~/models/recruitment-result", () => ({
  getRecruitmentResult: jest.fn(),
  getRecruitmentResultComment: jest.fn(),
  upsertRecruitmentResult: jest.fn(),
}));

jest.mock("~/domain/recruitment-result", () => ({
  createRecruitmentResultStudentsFromPickupHistory: jest.fn((history: { result: { tier3StudentIds: string[] }[] }) =>
    history.result.flatMap((trial) =>
      trial.tier3StudentIds.map((studentUid) => ({ studentUid, tier: 3, pickup: false })),
    ),
  ),
  getRecruitmentResultTrialFromPickupHistory: jest.fn((history: { result: { trial: number | null }[] }) => {
    const trials = history.result.map((trial) => trial.trial).filter((trial): trial is number => trial !== null);
    return trials.length > 0 ? Math.max(...trials) : null;
  }),
  getRecruitmentResultTier3CountFromPickupHistory: jest.fn((history: { result: { tier3Count: number }[] }) =>
    history.result.reduce((sum, trial) => sum + trial.tier3Count, 0),
  ),
  mergeEditableRecruitmentResultStudents: jest.fn(),
  resolveRecruitmentResultStudents: jest.fn(
    (
      students: { studentUid: string; tier: number; pickup: boolean }[],
      lookup: {
        allStudentsMap?: Record<string, { name: string; initialTier: number }>;
        group?: {
          recruitments: {
            pickup: boolean;
            recruitmentType?: string | null;
            student?: { uid: string; name?: string | null; initialTier?: number | null } | null;
          }[];
        } | null;
      },
    ) =>
      students
        .filter((student) => student.studentUid)
        .map((student) => {
          const groupRecruitment =
            lookup.group?.recruitments.find((recruitment) => recruitment.student?.uid === student.studentUid) ?? null;
          const studentInfo = lookup.allStudentsMap?.[student.studentUid] ?? groupRecruitment?.student;
          return {
            uid: student.studentUid,
            name: studentInfo?.name ?? student.studentUid,
            tier: studentInfo?.initialTier ?? student.tier,
            pickup:
              groupRecruitment?.recruitmentType === "given" ? false : (groupRecruitment?.pickup ?? student.pickup),
          };
        }),
  ),
}));

jest.mock("~/models/student", () => ({
  getAllStudents: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContentsByRecruitmentGroupUids: jest.fn(),
}));

jest.mock("~/models/recruitment", () => ({
  getAllHistoricalRecruitmentGroups: jest.fn(),
  getRecruitmentGroupByUid: jest.fn(),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetPickupHistory = getPickupHistory as jest.MockedFunction<typeof getPickupHistory>;
const mockedGetRecruitmentResult = getRecruitmentResult as jest.MockedFunction<typeof getRecruitmentResult>;
const mockedGetRecruitmentResultComment = getRecruitmentResultComment as jest.MockedFunction<
  typeof getRecruitmentResultComment
>;
const mockedMergeEditableRecruitmentResultStudents = mergeEditableRecruitmentResultStudents as jest.MockedFunction<
  typeof mergeEditableRecruitmentResultStudents
>;
const mockedUpsertRecruitmentResult = upsertRecruitmentResult as jest.MockedFunction<typeof upsertRecruitmentResult>;
const mockedGetAllStudents = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const mockedGetTimelineContentsByRecruitmentGroupUids =
  getTimelineContentsByRecruitmentGroupUids as jest.MockedFunction<typeof getTimelineContentsByRecruitmentGroupUids>;
const mockedGetAllHistoricalRecruitmentGroups = getAllHistoricalRecruitmentGroups as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown[]>
>;
const mockedGetRecruitmentGroupByUid = getRecruitmentGroupByUid as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown | null>
>;

const env = {} as Env;

function createGroup(uid: string, startAt: string) {
  return {
    uid,
    startAt,
    endAt: null,
    contentType: "event",
    contentUid: uid,
    recruitmentType: "usual",
    recruitments: [
      {
        recruitmentType: "usual",
        pickup: true,
        rerun: false,
        since: startAt,
        until: null,
        studentName: "스즈미(매지컬)",
        student: {
          uid: "10129",
          name: "스즈미(매지컬)",
          attackType: "explosive",
          defenseType: "light",
          role: "striker",
          schaleDbId: null,
          initialTier: 3,
          releaseAt: null,
          archiveAt: null,
        },
      },
    ],
  };
}

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("pickup history editor state helpers", () => {
  it("derives visible tier3 students without mutating the preserved selection buffer", () => {
    const selectedStudentUids = ["hina", "aru", "mika"];

    expect(getVisibleTier3StudentUids(selectedStudentUids, 1)).toEqual(["hina"]);
    expect(selectedStudentUids).toEqual(["hina", "aru", "mika"]);
    expect(getVisibleTier3StudentUids(selectedStudentUids, 4)).toEqual(["hina", "aru", "mika"]);
    expect(getVisibleTier3StudentUids(selectedStudentUids, 0)).toEqual([]);
  });

  it("only initializes count-only mode for non-zero counts with no student names", () => {
    expect(shouldSkipTier3StudentListInitially(5, [])).toBe(true);
    expect(shouldSkipTier3StudentListInitially(5, ["hina", "aru", "mika"])).toBe(false);
    expect(shouldSkipTier3StudentListInitially(0, [])).toBe(false);
  });
});

describe("pickup history editor loader", () => {
  it("builds the selectable pickup list from historical recruitment groups", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("magical-heavy-caliber", "2026-03-10T02:00:00Z");
    const recentGroup = createGroup("gojinraigou-rerun", "2026-05-12T02:00:00Z");
    mockedGetAllHistoricalRecruitmentGroups.mockResolvedValue([historicalGroup, recentGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetPickupHistory.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "magical-heavy-caliber",
        name: "마법소녀 이벤트",
        recruitmentGroupUid: "magical-heavy-caliber",
      },
      {
        uid: "gojinraigou-rerun",
        name: "고진뢰황 복각",
        recruitmentGroupUid: "gojinraigou-rerun",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/new"),
      params: { username: "@sensei", id: "new" },
    } as never);
    if (result instanceof Response) {
      throw new Error(`Expected pickup history editor data, got redirect to ${result.headers.get("Location")}`);
    }

    expect(mockedGetAllHistoricalRecruitmentGroups).toHaveBeenCalledWith(env);
    expect(result.events.map((event: { uid: string }) => event.uid)).toEqual([
      "gojinraigou-rerun",
      "magical-heavy-caliber",
    ]);
  });

  it("keeps given students out of exchangeable pickup candidates", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    historicalGroup.recruitments.push({
      ...historicalGroup.recruitments[0],
      recruitmentType: "given",
      studentName: "토키(무장)",
      student: {
        ...historicalGroup.recruitments[0].student,
        uid: "16019",
        name: "토키(무장)",
        initialTier: 1,
      },
    });
    mockedGetAllHistoricalRecruitmentGroups.mockResolvedValue([historicalGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetPickupHistory.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/new"),
      params: { username: "@sensei", id: "new" },
    } as never);
    if (result instanceof Response) {
      throw new Error(`Expected pickup history editor data, got redirect to ${result.headers.get("Location")}`);
    }

    expect(result.events[0].recruitments).toEqual([
      {
        student: { uid: "10129", name: "스즈미(매지컬)" },
        pickup: true,
        recruitmentType: "usual",
      },
      {
        student: { uid: "16019", name: "토키(무장)" },
        pickup: true,
        recruitmentType: "given",
      },
    ]);
  });

  it("keeps an explicitly saved zero-tier3 recruitment result empty when editing", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    mockedGetAllHistoricalRecruitmentGroups.mockResolvedValue([historicalGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue({
      uid: "result-zero-tier3",
      userId: 1,
      recruitmentGroupUid: "decagrammaton-armed",
      contentUid: "content-decagrammaton-armed",
      completedAt: "2026-05-26T02:00:00.000Z",
      recruitedStudents: [],
      exchangedStudents: [],
      trial: 100,
      rawResult: null,
      commentPostUid: null,
      createdAt: "2026-05-26T02:00:00.000Z",
      updatedAt: "2026-05-26T02:00:00.000Z",
    });
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/result-zero-tier3"),
      params: { username: "@sensei", id: "result-zero-tier3" },
    } as never);
    if (result instanceof Response) {
      throw new Error(`Expected pickup history editor data, got redirect to ${result.headers.get("Location")}`);
    }

    expect(result.currentPickupHistory?.result).toEqual([
      {
        trial: 100,
        tier3Count: 0,
        tier3StudentIds: [],
      },
    ]);
  });

  it("does not count stored tier drift for a given student as an editable tier3 result", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    historicalGroup.recruitments.push({
      ...historicalGroup.recruitments[0],
      recruitmentType: "given",
      studentName: "토키(무장)",
      student: {
        ...historicalGroup.recruitments[0].student,
        uid: "16019",
        name: "토키(무장)",
        initialTier: 1,
      },
    });
    mockedGetAllHistoricalRecruitmentGroups.mockResolvedValue([historicalGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue({
      uid: "result-with-given",
      userId: 1,
      recruitmentGroupUid: "decagrammaton-armed",
      contentUid: "content-decagrammaton-armed",
      completedAt: "2026-05-26T02:00:00.000Z",
      recruitedStudents: [
        { studentUid: "10129", tier: 3, pickup: true },
        { studentUid: "10129", tier: 3, pickup: true },
        { studentUid: "16019", tier: 3, pickup: true },
      ],
      exchangedStudents: [],
      trial: 100,
      rawResult: null,
      commentPostUid: null,
      createdAt: "2026-05-26T02:00:00.000Z",
      updatedAt: "2026-05-26T02:00:00.000Z",
    });
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([
      {
        uid: "10129",
        name: "스즈미(매지컬)",
        familyName: null,
        altNames: [],
        school: "trinity",
        initialTier: 3,
        order: 1,
        attackType: Attack.Explosive,
        defenseType: Defense.Light,
        position: "front",
        tacticRole: "attacker",
        birthday: new Date("2026-01-01T00:00:00.000Z"),
        role: "striker",
        equipments: [],
        released: true,
      },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/result-with-given"),
      params: { username: "@sensei", id: "result-with-given" },
    } as never);
    if (result instanceof Response) {
      throw new Error(`Expected pickup history editor data, got redirect to ${result.headers.get("Location")}`);
    }

    expect(result.currentPickupHistory?.result).toEqual([
      {
        trial: 100,
        tier3Count: 2,
        tier3StudentIds: ["10129", "10129"],
      },
    ]);
  });

  it("rejects given students submitted as exchange students", async () => {
    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    historicalGroup.recruitments.push({
      ...historicalGroup.recruitments[0],
      recruitmentType: "given",
      studentName: "토키(무장)",
      student: {
        ...historicalGroup.recruitments[0].student,
        uid: "16019",
        name: "토키(무장)",
        initialTier: 1,
      },
    });
    mockedGetRecruitmentGroupByUid.mockResolvedValue(historicalGroup);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    await expect(
      action({
        context: { cloudflare: { env } },
        request: new Request("https://mollulog.net/@sensei/pickups/edit/new", {
          method: "POST",
          body: JSON.stringify({
            eventUid: "decagrammaton-armed",
            result: [{ trial: 200, tier3Count: 0, tier3StudentIds: [] }],
            exchangedStudentIds: ["16019"],
          }),
        }),
        params: { username: "@sensei", id: "new" },
      } as never),
    ).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.exchange_student_invalid",
          details: {
            recruitmentGroupUid: "decagrammaton-armed",
            studentUid: "16019",
          },
        },
      },
      init: { status: 400 },
    });
    expect(mockedUpsertRecruitmentResult).not.toHaveBeenCalled();
  });

  it("saves explicit tier3 count even when tier3 student names are omitted", async () => {
    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    mockedGetRecruitmentGroupByUid.mockResolvedValue(historicalGroup);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    await action({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/new", {
        method: "POST",
        body: JSON.stringify({
          eventUid: "decagrammaton-armed",
          result: [{ trial: 100, tier3Count: 3, tier3StudentIds: [] }],
          exchangedStudentIds: [],
        }),
      }),
      params: { username: "@sensei", id: "new" },
    } as never);

    expect(mockedUpsertRecruitmentResult).toHaveBeenCalledWith(
      env,
      1,
      expect.objectContaining({
        tier3Count: 3,
        recruitedStudents: [],
      }),
    );
  });

  it("preserves existing non-tier3 recruited students when editing an existing result", async () => {
    const historicalGroup = createGroup("decagrammaton-armed", "2026-05-26T02:00:00Z");
    historicalGroup.recruitments.push({
      ...historicalGroup.recruitments[0],
      recruitmentType: "given",
      studentName: "토키(무장)",
      student: {
        ...historicalGroup.recruitments[0].student,
        uid: "16019",
        name: "토키(무장)",
        initialTier: 1,
      },
    });
    mockedGetRecruitmentGroupByUid.mockResolvedValue(historicalGroup);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    const existingResult: NonNullable<Awaited<ReturnType<typeof getRecruitmentResult>>> = {
      uid: "result-with-given",
      userId: 1,
      recruitmentGroupUid: "decagrammaton-armed",
      contentUid: "content-decagrammaton-armed",
      completedAt: "2026-05-26T02:00:00.000Z",
      recruitedStudents: [{ studentUid: "16019", tier: 3, pickup: true }],
      exchangedStudents: [],
      trial: 100,
      rawResult: null,
      commentPostUid: null,
      createdAt: "2026-05-26T02:00:00.000Z",
      updatedAt: "2026-05-26T02:00:00.000Z",
    };
    mockedGetRecruitmentResult.mockResolvedValue(existingResult);
    mockedMergeEditableRecruitmentResultStudents.mockReturnValue([
      { studentUid: "16019", tier: 1, pickup: false },
      { studentUid: "10129", tier: 3, pickup: true },
      { studentUid: "10129", tier: 3, pickup: true },
    ]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([
      {
        uid: "content-decagrammaton-armed",
        name: "데카그라마톤 무장",
        recruitmentGroupUid: "decagrammaton-armed",
      },
    ] as Awaited<ReturnType<typeof getTimelineContentsByRecruitmentGroupUids>>);

    await action({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.net/@sensei/pickups/edit/result-with-given", {
        method: "POST",
        body: JSON.stringify({
          eventUid: "decagrammaton-armed",
          result: [{ trial: 100, tier3Count: 2, tier3StudentIds: ["10129", "10129"] }],
          exchangedStudentIds: [],
        }),
      }),
      params: { username: "@sensei", id: "result-with-given" },
    } as never);

    const mergeCall = mockedMergeEditableRecruitmentResultStudents.mock.calls[0]?.[0];
    expect(mergeCall).toMatchObject({
      existingStudents: existingResult.recruitedStudents,
      history: { result: [{ trial: 100, tier3Count: 2, tier3StudentIds: ["10129", "10129"] }] },
      lookup: { group: historicalGroup },
      studentInitialTiers: { "10129": 3, "16019": 1 },
    });
    expect(mergeCall?.pickupStudentUids).toEqual(new Set(["10129"]));
    expect(mockedUpsertRecruitmentResult).toHaveBeenCalledWith(
      env,
      1,
      expect.objectContaining({
        recruitedStudents: [
          { studentUid: "16019", tier: 1, pickup: false },
          { studentUid: "10129", tier: 3, pickup: true },
          { studentUid: "10129", tier: 3, pickup: true },
        ],
      }),
    );
  });

  it("fails loudly when a historical recruitment group has no timeline content row", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-27T00:00:00.000Z").getTime());

    const historicalGroup = createGroup("magical-heavy-caliber", "2026-03-10T02:00:00Z");
    mockedGetAllHistoricalRecruitmentGroups.mockResolvedValue([historicalGroup]);
    mockedGetActiveSensei.mockResolvedValue({
      id: 1,
      uid: "sensei-1",
      username: "sensei",
    } as Awaited<ReturnType<typeof getActiveSensei>>);
    mockedGetRecruitmentResult.mockResolvedValue(null);
    mockedGetRecruitmentResultComment.mockResolvedValue(null);
    mockedGetPickupHistory.mockResolvedValue(null);
    mockedGetAllStudents.mockResolvedValue([]);
    mockedGetTimelineContentsByRecruitmentGroupUids.mockResolvedValue([]);

    await expect(
      loader({
        context: { cloudflare: { env } },
        request: new Request("https://mollulog.net/@sensei/pickups/edit/new"),
        params: { username: "@sensei", id: "new" },
      } as never),
    ).rejects.toMatchObject({
      type: "DataWithResponseInit",
      data: {
        error: {
          code: "pickup_history.timeline_content_missing",
          details: {
            recruitmentGroupUids: ["magical-heavy-caliber"],
          },
        },
      },
      init: { status: 500 },
    });
  });
});
