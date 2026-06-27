import { describe, expect, it, jest } from "@jest/globals";
import { type FutureContent, normalizeFutureContentDates } from "../../../app/views/futures";

jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUid: jest.fn(),
  getRecruitmentGroupsByUids: jest.fn(),
}));

jest.mock("~/models/recruitment-identity", () => ({
  getRecruitmentFavoriteKey: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContents: jest.fn(),
}));

jest.mock("~/views/raid-content", () => ({
  getUpcomingRaidContents: jest.fn(),
}));

describe("normalizeFutureContentDates", () => {
  it("keeps cached ISO date strings as normalized UTC ISO strings", () => {
    const cachedContent = {
      uid: "raid-202604-hieronymus",
      name: "히에로니무스",
      startAt: "2026-03-31T02:00:00.000Z",
      endAt: "2026-04-06T19:00:00.000Z",
      endless: false,
      imageUrl: null,
      videos: [],
      contentType: "raid",
      runType: "first",
      occurrence: null,
      contentUid: "202604-hieronymus",
      recruitmentGroupUid: null,
      confirmed: true,
      isSpoiler: false,
      tags: [],
      earnablePyroxene: null,
      syncedAt: "2026-03-29T09:20:22.385Z",
      recruitments: [
        {
          recruitmentType: "usual",
          pickup: true,
          rerun: false,
          since: "2026-03-31T02:00:00.000Z",
          until: "2026-04-07T02:00:00.000Z",
          studentName: "테스트 학생",
          student: null,
        },
      ],
      raidInfo: {
        raidType: "total_assault",
        boss: "hieronymus",
        name: "히에로니무스",
        seasonIndex: 1,
        terrain: "indoor",
        attackType: "mystic",
        defenseTypes: [{ defenseType: "heavy", difficulty: null }],
      },
    } as unknown as FutureContent;

    const normalized = normalizeFutureContentDates(cachedContent);

    expect(normalized.startAt).toBe("2026-03-31T02:00:00.000Z");
    expect(normalized.endAt).toBe("2026-04-06T19:00:00.000Z");
    expect(normalized.syncedAt).toBe("2026-03-29T09:20:22.385Z");
    expect(normalized.recruitments[0].since).toBe("2026-03-31T02:00:00.000Z");
    expect(normalized.recruitments[0].until).toBe("2026-04-07T02:00:00.000Z");
  });

  it("keeps cached future contents visible after normalization", () => {
    const now = "2026-04-05T00:00:00.000Z";
    const normalized = normalizeFutureContentDates({
      uid: "future-event",
      name: "미래 이벤트",
      startAt: "2026-04-07T02:00:00.000Z",
      endAt: "2026-04-21T02:00:00.000Z",
      endless: false,
      imageUrl: null,
      videos: [],
      contentType: "event",
      runType: "first",
      occurrence: null,
      contentUid: "event-1",
      recruitmentGroupUid: null,
      confirmed: true,
      isSpoiler: false,
      tags: [],
      earnablePyroxene: null,
      syncedAt: "2026-03-29T09:20:22.385Z",
      recruitments: [],
    } as unknown as FutureContent);

    expect(normalized.endAt ? normalized.endAt > now : normalized.startAt > now).toBe(true);
  });
});
