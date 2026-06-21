import { describe, expect, it } from "@jest/globals";
import dayjs from "~/lib/dayjs";
import { relativeTime, remainingTime } from "./ko";

describe("Korean relative time labels", () => {
  it("uses the display timezone calendar date for remaining content labels", () => {
    const now = dayjs.utc("2026-06-21T07:39:37.000Z");
    const target = dayjs.utc("2026-06-22T19:00:00.000Z");

    expect(remainingTime(target, { now, timeZone: "UTC" })).toEqual({
      text: "내일 종료",
      finishSoon: false,
    });
    expect(remainingTime(target, { now, timeZone: "Asia/Seoul" })).toEqual({
      text: "2일",
      finishSoon: false,
    });
  });

  it("keeps tomorrow based on the display timezone calendar date even with more than 24 hours remaining", () => {
    const now = dayjs.utc("2026-06-21T15:30:00.000Z");
    const target = dayjs.utc("2026-06-22T19:00:00.000Z");

    expect(remainingTime(target, { now, timeZone: "Asia/Seoul" })).toEqual({
      text: "내일 종료",
      finishSoon: false,
    });
    expect(relativeTime(target, { now, timeZone: "Asia/Seoul" })).toBe("내일");
  });

  it("switches to an hour label on the display timezone end date", () => {
    const now = dayjs.utc("2026-06-22T16:00:00.000Z");
    const target = dayjs.utc("2026-06-22T19:00:00.000Z");

    expect(remainingTime(target, { now, timeZone: "Asia/Seoul" })).toEqual({
      text: "3시간 남음",
      finishSoon: true,
    });
    expect(relativeTime(target, { now, timeZone: "Asia/Seoul" })).toBe("3시간 후");
  });
});
