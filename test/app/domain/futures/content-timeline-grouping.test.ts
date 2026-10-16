import { describe, expect, it } from "@jest/globals";
import { groupFutureContents } from "~/domain/futures/content-timeline-grouping";

const timeZone = "Asia/Seoul";

function content(uid: string, since: string, until: string | null, contentType: "event" | "live" | "main_story") {
  return { uid, since, until, contentType };
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
    // Contents inside a group follow CONTENT_ORDER, which lists live before events.
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
});
