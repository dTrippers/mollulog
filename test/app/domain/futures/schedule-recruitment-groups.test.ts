import { describe, expect, it } from "@jest/globals";
import {
  buildScheduleGroups,
  SCHEDULE_OTHERS_SECTION_TITLE,
  SCHEDULE_PICKUP_SECTION_TITLE,
} from "~/domain/futures/schedule-recruitment-groups";
import type { UtcIsoString } from "~/lib/date-time";

const at = (value: string) => value as UtcIsoString;
const timeZone = "Asia/Seoul";

const row = { since: at("2026-05-12T00:00:00.000Z"), until: at("2026-05-19T00:00:00.000Z") };

function entry(uid: string, since: string, until: string | null, pickup: boolean) {
  return { uid, since: at(since), until: until === null ? null : at(until), pickup };
}

describe("buildScheduleGroups", () => {
  it("shows no name, no period, and no section title for one group of non-pickup students on the row period", () => {
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "메인 스토리",
          entries: [entry("a", row.since, row.until, false)],
        },
      ],
      row,
      timeZone,
    );

    expect(group.showName).toBe(false);
    expect(group.showPeriod).toBe(false);
    expect(group.sections).toEqual([{ key: "all", title: null, entries: [expect.objectContaining({ uid: "a" })] }]);
  });

  it("splits pickup and other students into two titled sections", () => {
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "이벤트",
          entries: [entry("a", row.since, row.until, true), entry("b", row.since, row.until, false)],
        },
      ],
      row,
      timeZone,
    );

    expect(group.sections.map((section) => [section.key, section.title])).toEqual([
      ["pickup", SCHEDULE_PICKUP_SECTION_TITLE],
      ["others", SCHEDULE_OTHERS_SECTION_TITLE],
    ]);
    expect(group.sections[0].entries.map((item) => item.uid)).toEqual(["a"]);
    expect(group.sections[1].entries.map((item) => item.uid)).toEqual(["b"]);
  });

  it("shows the name with more than one group, and the group period only where it differs from the row", () => {
    const groups = buildScheduleGroups(
      [
        { uid: "g1", name: "A", entries: [entry("a", row.since, row.until, false)] },
        {
          uid: "g2",
          name: "B",
          entries: [entry("b", "2026-05-13T00:00:00.000Z", "2026-05-18T00:00:00.000Z", false)],
        },
      ],
      row,
      timeZone,
    );

    expect(groups.map((group) => [group.name, group.showName, group.showPeriod])).toEqual([
      ["A", true, false],
      ["B", true, true],
    ]);
  });

  it("hides a group period whose instants differ by hours but show the same displayed days", () => {
    // Row 10/27 ~ 11/10 in Seoul. The group starts 9 hours later and ends 14 hours earlier, on the same days.
    const rowInSeoul = { since: at("2026-10-26T15:00:00.000Z"), until: at("2026-11-10T14:59:00.000Z") };
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "A",
          entries: [entry("a", "2026-10-27T00:00:00.000Z", "2026-11-10T00:00:00.000Z", false)],
        },
      ],
      rowInSeoul,
      timeZone,
    );

    expect(group.showPeriod).toBe(false);
  });

  it("shows a group period that ends on a different displayed day than the row, such as 리콜렉트 10/27 ~ 11/03", () => {
    const rowInSeoul = { since: at("2026-10-27T00:00:00.000Z"), until: at("2026-11-10T00:00:00.000Z") };
    const groups = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "리콜렉트",
          entries: [entry("a", "2026-10-27T01:00:00.000Z", "2026-11-03T06:00:00.000Z", false)],
        },
        {
          uid: "g2",
          name: "하이랜더",
          entries: [entry("b", "2026-10-27T01:00:00.000Z", "2026-11-10T00:00:00.000Z", false)],
        },
      ],
      rowInSeoul,
      timeZone,
    );

    expect(groups.map((group) => [group.name, group.showPeriod])).toEqual([
      ["리콜렉트", true],
      ["하이랜더", false],
    ]);
  });

  it("uses the earliest start and the latest end across a group's recruitments", () => {
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "A",
          entries: [
            entry("a", "2026-05-14T00:00:00.000Z", "2026-05-17T00:00:00.000Z", false),
            entry("b", "2026-05-13T00:00:00.000Z", "2026-05-18T00:00:00.000Z", true),
          ],
        },
      ],
      row,
      timeZone,
    );

    expect(group.since).toBe("2026-05-13T00:00:00.000Z");
    expect(group.until).toBe("2026-05-18T00:00:00.000Z");
  });

  it("takes a recruitment without its own end from the content's end, so no open-ended label shows in a dated row", () => {
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "A",
          entries: [entry("a", row.since, row.until, false), entry("b", row.since, null, true)],
          contentUntil: at("2026-05-19T00:00:00.000Z"),
        },
      ],
      row,
      timeZone,
    );

    expect(group.until).toBe("2026-05-19T00:00:00.000Z");
    expect(group.showPeriod).toBe(false);
  });

  it("stays open-ended when neither the recruitment nor the content has an end", () => {
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "A",
          entries: [entry("a", row.since, null, false)],
          contentUntil: null,
        },
      ],
      row,
      timeZone,
    );

    expect(group.until).toBeNull();
  });

  it("treats the group as open-ended when any of its recruitments has no end", () => {
    const [group] = buildScheduleGroups(
      [
        {
          uid: "g1",
          name: "A",
          entries: [entry("a", row.since, row.until, false), entry("b", row.since, null, true)],
        },
      ],
      row,
      timeZone,
    );

    expect(group.until).toBeNull();
    expect(group.showPeriod).toBe(true);
  });
});
