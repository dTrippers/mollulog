import { describe, expect, it } from "@jest/globals";
import { type FutureGroupableContent, groupFutureContents } from "~/domain/futures/content-timeline-grouping";

const timeZone = "Asia/Seoul";

function content(
  uid: string,
  since: string,
  until: string | null,
  contentType: FutureGroupableContent["contentType"],
  runType: FutureGroupableContent["runType"] = "first",
  students: string[] = [],
) {
  return { uid, since, until, contentType, runType, students };
}

describe("groupFutureContents", () => {
  it("puts the contents running now in one leading in-progress group", () => {
    const groups = groupFutureContents(
      [
        content("later", "2026-10-20T00:00:00.000Z", "2026-10-27T00:00:00.000Z", "event"),
        content("running", "2026-10-13T00:00:00.000Z", "2026-10-27T00:00:00.000Z", "event"),
        content("running-live", "2026-10-14T00:00:00.000Z", "2026-10-30T00:00:00.000Z", "live"),
      ],
      timeZone,
      "2026-10-15T03:00:00.000Z",
    );
    expect(groups[0].groupDate).toBeNull();
    // Contents without students follow the type priority, which lists live before events.
    expect(groups[0].contents.map((item) => item.uid)).toEqual(["running-live", "running"]);
    expect(groups[1].groupDate).toBe("2026-10-20T00:00:00.000Z");
  });

  it("groups upcoming contents that start on the same display date", () => {
    const groups = groupFutureContents(
      [
        content("a", "2026-10-20T00:00:00.000Z", null, "event"),
        content("b", "2026-10-20T06:00:00.000Z", null, "main_story"),
        content("c", "2026-10-21T00:00:00.000Z", null, "event"),
      ],
      timeZone,
      "2026-10-15T03:00:00.000Z",
    );
    expect(groups.map((group) => group.contents.map((item) => item.uid))).toEqual([["a", "b"], ["c"]]);
  });

  it("places contents with recruitable students first, then new events before reruns", () => {
    const since = "2026-10-20T00:00:00.000Z";
    const groups = groupFutureContents(
      [
        content("rerun", since, null, "event", "rerun", ["student"]),
        content("live", since, null, "live"),
        content("new", since, null, "event", "first", ["student"]),
      ],
      timeZone,
      "2026-10-15T03:00:00.000Z",
    );
    expect(groups[0].contents.map((item) => item.uid)).toEqual(["new", "rerun", "live"]);
  });
});
