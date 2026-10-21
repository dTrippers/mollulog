import { describe, expect, it } from "@jest/globals";
import { getRoutePageMetadata, routeIdToPattern } from "~/lib/route-pattern";

describe("route patterns", () => {
  it.each([
    ["routes/$username.students", "/:username/students"],
    ["routes/students.$id._index", "/students/:id"],
    ["routes/students.$id.edit", "/students/:id/edit"],
    ["routes/events.$uid.recruitment-simulator", "/events/:uid/recruitment-simulator"],
    ["routes/raids.$raidType.$seasonIndex.ranks", "/raids/:raidType/:seasonIndex/ranks"],
    ["routes/timelines.$uid_", "/timelines/:uid"],
    ["routes/$username._index", "/:username"],
    ["routes/security-campaign[.]share", "/security-campaign.share"],
  ])("maps %s to %s", (routeId, expected) => {
    expect(routeIdToPattern(routeId)).toBe(expected);
  });

  it("uses a generic profile route and group", () => {
    expect(
      getRoutePageMetadata([
        { id: "root", params: {} },
        { id: "routes/$username.students", params: { username: "alice" } },
      ]),
    ).toEqual({ routePattern: "/:username/students", contentGroup: "profile" });
  });

  it("exposes content IDs only for the approved game content routes", () => {
    expect(
      getRoutePageMetadata([
        { id: "root", params: {} },
        { id: "routes/students.$id._index", params: { id: "STU_001" } },
      ]),
    ).toEqual({ routePattern: "/students/:id", contentGroup: "students", contentId: "STU_001" });

    expect(
      getRoutePageMetadata([
        { id: "root", params: {} },
        { id: "routes/events.$uid.recruitment-simulator", params: { uid: "event-uid" } },
      ]),
    ).toEqual({
      routePattern: "/events/:uid/recruitment-simulator",
      contentGroup: "events",
      contentId: "event-uid",
    });

    expect(
      getRoutePageMetadata([
        { id: "root", params: {} },
        { id: "routes/contact.$uid", params: { uid: "private-ticket-uid" } },
      ]),
    ).toEqual({ routePattern: "/contact/:uid", contentGroup: "contact" });

    expect(
      getRoutePageMetadata([
        { id: "root", params: {} },
        { id: "routes/students.$id._index", params: { id: "invalid id with spaces" } },
      ]),
    ).toEqual({ routePattern: "/students/:id", contentGroup: "students" });
  });
});
