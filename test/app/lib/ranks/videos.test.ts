import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fetchRaidVideos } from "../../../../app/lib/ranks/videos";

jest.mock("../../../../app/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "https://ranks.baql.net",
}));

jest.mock("~/models/raid-videos", () => ({
  DEFAULT_VIDEO_SORT: "published_at_desc",
  RAID_VIDEOS_PAGE_SIZE: 20,
}));

afterEach(() => {
  jest.restoreAllMocks();
});

describe("fetchRaidVideos", () => {
  it("loads raid videos through the ranks API and normalizes the response", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          videos: [
            {
              title: "시로쿠로 토먼트",
              channelTitle: "몰루로그",
              score: 27500000,
              youtubeId: "abc123",
              thumbnailUrl: "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
              publishedAt: "2026-04-01T03:00:00Z",
            },
            {
              title: "시로쿠로 인세인",
              channelTitle: "다른 채널",
              youtubeId: "def456",
              thumbnailUrl: "https://img.youtube.com/vi/def456/maxresdefault.jpg",
              publishedAt: "2026-04-02T03:00:00Z",
            },
          ],
          total: 142,
          hasMore: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      fetchRaidVideos({
        raidType: "elimination",
        boss: "hovercraft",
        from: "2026-04-01T03:00:00.000Z",
        to: "2026-04-29T03:00:00.000Z",
        limit: 12,
        offset: 24,
        sort: "published_at_desc",
      }),
    ).resolves.toEqual({
      videos: [
        {
          title: "시로쿠로 토먼트",
          channelTitle: "몰루로그",
          score: 27500000,
          youtubeId: "abc123",
          thumbnailUrl: "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
          publishedAt: "2026-04-01T03:00:00Z",
        },
        {
          title: "시로쿠로 인세인",
          channelTitle: "다른 채널",
          score: undefined,
          youtubeId: "def456",
          thumbnailUrl: "https://img.youtube.com/vi/def456/maxresdefault.jpg",
          publishedAt: "2026-04-02T03:00:00Z",
        },
      ],
      total: 142,
      hasMore: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toBeInstanceOf(URL);
    const url = calledUrl as URL;
    expect(url.origin).toBe("https://ranks.baql.net");
    expect(url.pathname).toBe("/v1/videos");
    expect(url.searchParams.get("raidType")).toBe("elimination");
    expect(url.searchParams.get("boss")).toBe("hovercraft");
    expect(url.searchParams.get("from")).toBe("2026-04-01T03:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-04-29T03:00:00.000Z");
    expect(url.searchParams.get("sort")).toBe("published_at_desc");
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("offset")).toBe("24");
  });
});
