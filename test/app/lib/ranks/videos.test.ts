import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fetchRaidVideos } from "../../../../app/lib/ranks/videos";

jest.mock("../../../../app/lib/ranks/base", () => ({
  createProtobufRootCache: jest.fn(() => jest.fn()),
  fetchProtobuf: jest.fn(),
  RANK_API_BASE_URL: "https://ranks.baql.net",
}));

jest.mock("~/models/raid-videos", () => ({
  DEFAULT_VIDEO_SORT: "score_desc",
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
              defenseType: "special",
              sourceParties: [
                {
                  source: "tl_search",
                  parties: [{ students: [{ uid: "10085" }, { uid: "10123" }] }],
                },
              ],
              rankMatch: {
                rank: 123,
                finalRank: 120,
                parties: [
                  {
                    students: [{ uid: "10085", level: 90, tier: 5, weaponTier: 4, isAssist: false }, null],
                  },
                ],
              },
            },
            {
              title: "시로쿠로 인세인",
              channelTitle: "다른 채널",
              youtubeId: "def456",
              thumbnailUrl: "https://img.youtube.com/vi/def456/maxresdefault.jpg",
              publishedAt: "2026-04-02T03:00:00Z",
              sourceParties: [
                {
                  source: "tl_search",
                  parties: [{ students: [{ uid: "10123" }, { uid: "10085" }] }],
                },
              ],
              rankHint: { rank: 456 },
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
        limit: 12,
        offset: 24,
        sort: "published_at_desc",
        defenseType: "special",
        scoreGte: 31076000,
        scoreLt: 44025000,
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
          defenseType: "special",
          sourceParties: [
            {
              source: "tl_search",
              parties: [
                {
                  partyIndex: 0,
                  slots: [
                    {
                      slotIndex: 0,
                      tier: null,
                      level: null,
                      isAssist: null,
                      studentUid: "10085",
                    },
                    {
                      slotIndex: 1,
                      tier: null,
                      level: null,
                      isAssist: null,
                      studentUid: "10123",
                    },
                  ],
                },
              ],
            },
          ],
          rankMatch: {
            rank: 123,
            finalRank: 120,
            parties: [
              {
                partyIndex: 0,
                slots: [
                  {
                    slotIndex: 0,
                    tier: 9,
                    level: 90,
                    isAssist: false,
                    studentUid: "10085",
                  },
                  {
                    slotIndex: 1,
                    tier: null,
                    level: null,
                    isAssist: null,
                    studentUid: null,
                  },
                ],
              },
            ],
          },
          rankHint: undefined,
        },
        {
          title: "시로쿠로 인세인",
          channelTitle: "다른 채널",
          score: undefined,
          youtubeId: "def456",
          thumbnailUrl: "https://img.youtube.com/vi/def456/maxresdefault.jpg",
          publishedAt: "2026-04-02T03:00:00Z",
          sourceParties: [
            {
              source: "tl_search",
              parties: [
                {
                  partyIndex: 0,
                  slots: [
                    {
                      slotIndex: 0,
                      tier: null,
                      level: null,
                      isAssist: null,
                      studentUid: "10123",
                    },
                    {
                      slotIndex: 1,
                      tier: null,
                      level: null,
                      isAssist: null,
                      studentUid: "10085",
                    },
                  ],
                },
              ],
            },
          ],
          rankMatch: undefined,
          rankHint: { rank: 456 },
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
    expect(url.searchParams.get("defenseType")).toBe("special");
    expect(url.searchParams.has("from")).toBe(false);
    expect(url.searchParams.has("to")).toBe(false);
    expect(url.searchParams.get("sort")).toBe("published_at_desc");
    expect(url.searchParams.get("scoreGte")).toBe("31076000");
    expect(url.searchParams.get("scoreLt")).toBe("44025000");
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("offset")).toBe("24");
  });
});
