import { describe, expect, it } from "@jest/globals";
import {
  getHomeBirthdayMonthDays,
  getHomeEntryPoints,
  getHomeOngoingChip,
  getHomePublishChip,
  getHomeRecruitmentKindLabel,
  getHomeUpcomingChip,
  isHomeShopAvailable,
  selectHomeBirthdays,
  selectHomeEventSlot,
  selectHomeScheduleSlot,
  toBirthdayMonthDay,
} from "~/domain/home-portal";
import type { TimelineContent } from "~/domain/timeline-content";

const now = "2026-10-16T03:00:00.000Z"; // 12:00 KST on 2026-10-16
const KST = "Asia/Seoul";

function content(overrides: Partial<TimelineContent> & Pick<TimelineContent, "uid">): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-10-13T02:00:00.000Z",
    endAt: "2026-10-27T02:00:00.000Z",
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event",
    runType: "first",
    occurrence: null,
    contentUid: "event-content",
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

describe("home time chips", () => {
  it("counts whole calendar days for a running item, and hours under one day", () => {
    expect(getHomeOngoingChip("2026-10-27T02:00:00.000Z", now, KST)).toEqual({ kind: "ongoing-days", days: 11 });
    expect(getHomeOngoingChip("2026-10-16T12:00:00.000Z", now, KST)).toEqual({ kind: "ongoing-hours", hours: 9 });
  });

  it("counts days until an upcoming start, and reads a same-day start without a day count", () => {
    expect(getHomeUpcomingChip("2026-10-20T02:00:00.000Z", now, KST)).toEqual({ kind: "upcoming-days", days: 4 });
    expect(getHomeUpcomingChip("2026-10-16T08:00:00.000Z", now, KST)).toEqual({ kind: "upcoming-today" });
  });

  it("shows a main story release as MM/DD in the display timezone", () => {
    expect(getHomePublishChip("2026-09-14T15:00:00.000Z", KST)).toEqual({ kind: "publish", monthDay: "09/15" });
    expect(getHomePublishChip("2026-09-14T15:00:00.000Z", "UTC")).toEqual({ kind: "publish", monthDay: "09/14" });
  });
});

describe("selectHomeEventSlot", () => {
  it("picks the first and rerun ongoing event before permanent and mini events, then the earlier start", () => {
    const slot = selectHomeEventSlot(
      [
        content({ uid: "permanent-early", runType: "permanent", startAt: "2026-10-01T00:00:00.000Z" }),
        content({ uid: "mini", contentType: "mini_event", startAt: "2026-10-01T00:00:00.000Z" }),
        content({ uid: "rerun-late", runType: "rerun", startAt: "2026-10-14T00:00:00.000Z" }),
        content({ uid: "first-early", runType: "first", startAt: "2026-10-13T00:00:00.000Z" }),
      ],
      now,
    );

    expect(slot.main?.uid).toBe("first-early");
    expect(slot.together.map((item) => item.uid)).toEqual(["rerun-late", "mini", "permanent-early"]);
    expect(slot.upcoming).toBeNull();
  });

  it("leaves out endless permanent events from the current status", () => {
    const slot = selectHomeEventSlot([content({ uid: "endless", runType: "permanent", endAt: null })], now);
    expect(slot).toEqual({ main: null, together: [], upcoming: null });
  });

  it("shows the next single event only when nothing is ongoing", () => {
    const slot = selectHomeEventSlot(
      [
        content({ uid: "later", startAt: "2026-10-30T00:00:00.000Z", endAt: "2026-11-10T00:00:00.000Z" }),
        content({ uid: "sooner", startAt: "2026-10-20T00:00:00.000Z", endAt: "2026-11-01T00:00:00.000Z" }),
      ],
      now,
    );
    expect(slot.main).toBeNull();
    expect(slot.together).toEqual([]);
    expect(slot.upcoming?.uid).toBe("sooner");
  });
});

describe("selectHomeScheduleSlot", () => {
  it("keeps every ongoing item, and falls back to the earliest upcoming one", () => {
    const ongoing = selectHomeScheduleSlot(
      [
        { startAt: "2026-10-10T00:00:00.000Z", endAt: "2026-10-20T00:00:00.000Z", id: "a" },
        { startAt: "2026-10-12T00:00:00.000Z", endAt: "2026-10-30T00:00:00.000Z", id: "b" },
        { startAt: "2026-10-30T00:00:00.000Z", endAt: "2026-11-05T00:00:00.000Z", id: "c" },
      ],
      now,
    );
    expect(ongoing.ongoing.map((item) => item.id)).toEqual(["a", "b"]);
    expect(ongoing.upcoming).toBeNull();

    const upcoming = selectHomeScheduleSlot(
      [
        { startAt: "2026-10-30T00:00:00.000Z", endAt: "2026-11-05T00:00:00.000Z", id: "late" },
        { startAt: "2026-10-20T00:00:00.000Z", endAt: "2026-10-27T00:00:00.000Z", id: "next" },
      ],
      now,
    );
    expect(upcoming.ongoing).toEqual([]);
    expect(upcoming.upcoming?.id).toBe("next");
  });
});

describe("getHomeEntryPoints", () => {
  it("shows only the entry points an event can use", () => {
    const shopEvent = content({
      uid: "shop",
      contentUid: "content-1",
      runType: "first",
      recruitmentGroupUid: "group-1",
    });
    expect(getHomeEntryPoints(shopEvent, "card_flip").map((point) => point.key)).toEqual([
      "shop",
      "simulator",
      "card-flip",
    ]);
    expect(getHomeEntryPoints(shopEvent, "treasure_hunt").map((point) => point.key)).toEqual([
      "shop",
      "simulator",
      "treasure-hunt",
    ]);

    const permanent = content({ uid: "permanent", runType: "permanent", contentUid: "content-2" });
    expect(getHomeEntryPoints(permanent, "card_flip")).toEqual([]);
  });

  it("keeps the card flip entry out when the event has no shop", () => {
    const noShop = content({ uid: "no-shop", contentUid: null, shopContentUid: null });
    expect(getHomeEntryPoints(noShop, "card_flip")).toEqual([]);
  });

  it("follows the shop rule of the event metadata", () => {
    expect(isHomeShopAvailable(content({ uid: "a", shopContentUid: "shop" }))).toBe(true);
    expect(isHomeShopAvailable(content({ uid: "b", runType: "rerun" }))).toBe(true);
    expect(isHomeShopAvailable(content({ uid: "c", runType: "permanent", shopContentUid: null }))).toBe(false);
  });
});

describe("selectHomeBirthdays", () => {
  const candidate = (uid: string, name: string, birthday: string, characterUid: string | null) => ({
    uid,
    name,
    birthday,
    characterUid,
  });

  it("covers thirty calendar days from today, today included, and sorts by the nearest day", () => {
    const monthDays = getHomeBirthdayMonthDays("2026-10-16");
    expect(monthDays).toHaveLength(30);
    expect(monthDays[0]).toBe("10-16");
    expect(monthDays[15]).toBe("10-31");
    expect(monthDays[16]).toBe("11-01");
    expect(monthDays[29]).toBe("11-14");

    const birthdays = selectHomeBirthdays(
      [
        candidate("late", "늦은 생일", "11-01", "late"),
        candidate("soon", "가까운 생일", "10-20", "soon"),
        candidate("today", "오늘 생일", "10-16", "today"),
        candidate("last", "마지막 날", "11-14", "last"),
        candidate("outside", "범위 밖", "11-15", "outside"),
      ],
      "2026-10-16",
    );
    expect(birthdays.map((birthday) => [birthday.uid, birthday.daysUntil])).toEqual([
      ["today", 0],
      ["soon", 4],
      ["late", 16],
      ["last", 29],
    ]);
  });

  it("keeps the nearest five entries, ordered by days until the birthday and then by UID", () => {
    const birthdays = selectHomeBirthdays(
      [
        candidate("f", "여섯째", "10-28", "f"),
        candidate("e", "다섯째", "10-25", "e"),
        candidate("d", "넷째", "10-21", "d"),
        candidate("c", "셋째", "10-18", "c"),
        candidate("b", "둘째", "10-16", "b"),
        candidate("a", "첫째", "10-16", "a"),
      ],
      "2026-10-16",
    );
    expect(birthdays.map((birthday) => [birthday.uid, birthday.daysUntil])).toEqual([
      ["a", 0],
      ["b", 0],
      ["c", 2],
      ["d", 5],
      ["e", 9],
    ]);
  });

  it("applies the character merge before the cut, so a skin takes no extra place among the five", () => {
    const birthdays = selectHomeBirthdays(
      [
        candidate("10114", "주리(아르바이트)", "10-16", "26002"),
        candidate("26002", "주리", "10-16", "26002"),
        candidate("p1", "가", "10-17", "p1"),
        candidate("p2", "나", "10-18", "p2"),
        candidate("p3", "다", "10-19", "p3"),
        candidate("p4", "라", "10-20", "p4"),
        candidate("p5", "마", "10-21", "p5"),
      ],
      "2026-10-16",
    );
    expect(birthdays.map((birthday) => birthday.uid)).toEqual(["26002", "p1", "p2", "p3", "p4"]);
  });

  // The live shape: each skin is its own BAQL variant group, but every skin shares the character UID of its base student.
  it("merges skins into one entry by character UID, led by the base student", () => {
    const birthdays = selectHomeBirthdays(
      [
        candidate("10114", "주리(아르바이트)", "10-20", "26002"),
        candidate("26002", "주리", "10-20", "26002"),
        candidate("20037", "후부키(수영복)", "10-21", "16008"),
        candidate("16008", "후부키", "10-21", "16008"),
      ],
      "2026-10-16",
    );
    expect(birthdays).toEqual([
      { uid: "26002", name: "주리", monthDay: "10-20", daysUntil: 4 },
      { uid: "16008", name: "후부키", monthDay: "10-21", daysUntil: 5 },
    ]);
  });

  it("lets a skin stand for its character when the base student is not in the window", () => {
    const birthdays = selectHomeBirthdays(
      [candidate("26012", "키리노(수영복)", "10-20", "13012"), candidate("10055", "시구레", "10-20", "10055")],
      "2026-10-16",
    );
    expect(birthdays).toEqual([
      { uid: "10055", name: "시구레", monthDay: "10-20", daysUntil: 4 },
      { uid: "26012", name: "키리노(수영복)", monthDay: "10-20", daysUntil: 4 },
    ]);
  });

  it("keeps a student with no character UID as its own entry", () => {
    const birthdays = selectHomeBirthdays(
      [candidate("unknown-a", "알 수 없음", "10-20", null), candidate("unknown-b", "다른 학생", "10-20", null)],
      "2026-10-16",
    );
    expect(birthdays.map((birthday) => birthday.uid)).toEqual(["unknown-a", "unknown-b"]);
  });
});

describe("getHomeRecruitmentKindLabel", () => {
  it("names the recruitment kind of a group", () => {
    expect(getHomeRecruitmentKindLabel([{ recruitmentType: "usual", pickup: true, rerun: false }])).toBe("픽업 모집");
    expect(getHomeRecruitmentKindLabel([{ recruitmentType: "usual", pickup: true, rerun: true }])).toBe(
      "복각 픽업 모집",
    );
    expect(getHomeRecruitmentKindLabel([{ recruitmentType: "recollect", pickup: false, rerun: false }])).toBe(
      "리콜렉트 모집",
    );
    expect(getHomeRecruitmentKindLabel([{ recruitmentType: "encore", pickup: false, rerun: false }])).toBe(
      "앙코르 모집",
    );
  });
});

describe("toBirthdayMonthDay", () => {
  it("reads the month and day from a string birthday with any year, and from a Date", () => {
    expect(toBirthdayMonthDay("0000-10-20")).toBe("10-20");
    expect(toBirthdayMonthDay("2000-03-07")).toBe("03-07");
    expect(toBirthdayMonthDay(new Date("0000-10-21T00:00:00.000Z"))).toBe("10-21");
  });

  it("returns null for a released student without a birthday", () => {
    expect(toBirthdayMonthDay(null)).toBeNull();
    expect(toBirthdayMonthDay(undefined as unknown as null)).toBeNull();
  });

  it("throws on a value without a date, so the source reports the failure", () => {
    expect(() => toBirthdayMonthDay("not-a-date")).toThrow("student birthday is not a date");
  });
});
