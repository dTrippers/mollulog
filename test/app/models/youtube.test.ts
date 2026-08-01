import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getCommunityFeedPage, upsertYoutubeVideoCommunityPost } from "~/models/community";
import { fetchYoutubeFeedVideos, getHomeYoutubeSections, syncYoutubeCommunityPosts } from "~/models/youtube";

jest.mock("~/models/community", () => ({
  getCommunityFeedPage: jest.fn(),
  upsertYoutubeVideoCommunityPost: jest.fn(),
}));

const mockedUpsertYoutubeVideoCommunityPost = upsertYoutubeVideoCommunityPost as jest.MockedFunction<
  typeof upsertYoutubeVideoCommunityPost
>;
const mockedGetCommunityFeedPage = getCommunityFeedPage as jest.MockedFunction<typeof getCommunityFeedPage>;

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function createEnv(freezeValue: string | null = null) {
  return {
    KV_CACHE: {
      get: jest.fn(async () => freezeValue),
    },
  } as unknown as Env;
}

function createFeedXml(videoId: string, title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>${videoId}</yt:videoId>
    <title>${title}</title>
    <link href="https://www.youtube.com/watch?v=${videoId}" />
    <published>2026-03-28T00:00:00+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" />
    </media:group>
  </entry>
</feed>`;
}

function createFeedXmlWithVideos(videoIds: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  ${videoIds
    .map(
      (videoId) => `<entry>
    <yt:videoId>${videoId}</yt:videoId>
    <title>${videoId}</title>
    <link href="https://www.youtube.com/watch?v=${videoId}" />
    <published>2026-03-28T00:00:00+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" />
    </media:group>
  </entry>`,
    )
    .join("\n")}
</feed>`;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("fetchYoutubeFeedVideos", () => {
  it("throws when all channel fetches fail", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      throw new Error("youtube unavailable");
    });

    await expect(fetchYoutubeFeedVideos()).rejects.toThrow("All YouTube channel fetches failed or returned no videos");
  });

  it("returns successful channel videos with channel metadata when one channel fails", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("UCmgf8DJrAXFnU7j3u0kklUQ")) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "",
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => createFeedXml("kr-video-1", "KR Video"),
      } as Response;
    });

    await expect(fetchYoutubeFeedVideos()).resolves.toEqual([
      {
        id: "kr-video-1",
        title: "KR Video",
        url: "https://www.youtube.com/watch?v=kr-video-1",
        thumbnailUrl: "https://i.ytimg.com/vi/kr-video-1/hqdefault.jpg",
        publishedAt: "2026-03-28T00:00:00+00:00",
        isShorts: false,
        channelKey: "kr",
        channelName: "한국 서버",
        channelUrl: "https://www.youtube.com/@bluearchive_kr",
      },
    ]);
  });
});

describe("syncYoutubeCommunityPosts", () => {
  it("upserts every fetched video into community posts", async () => {
    jest.spyOn(global, "fetch").mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => createFeedXml("video-1", "Video 1"),
        }) as Response,
    );
    mockedUpsertYoutubeVideoCommunityPost.mockResolvedValue(undefined);

    await expect(syncYoutubeCommunityPosts(createEnv())).resolves.toEqual({ synced: 2 });

    expect(mockedUpsertYoutubeVideoCommunityPost).toHaveBeenCalledTimes(2);
    expect(mockedUpsertYoutubeVideoCommunityPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "video-1",
        channelKey: "jp",
      }),
    );
    expect(mockedUpsertYoutubeVideoCommunityPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "video-1",
        channelKey: "kr",
      }),
    );
  });

  it("limits concurrent D1-backed upserts to four videos", async () => {
    jest.spyOn(global, "fetch").mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => createFeedXmlWithVideos(["video-1", "video-2", "video-3", "video-4", "video-5"]),
        }) as Response,
    );
    let activeUpserts = 0;
    let maxActiveUpserts = 0;
    const pendingUpserts: Array<() => void> = [];
    mockedUpsertYoutubeVideoCommunityPost.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          activeUpserts += 1;
          maxActiveUpserts = Math.max(maxActiveUpserts, activeUpserts);
          pendingUpserts.push(() => {
            activeUpserts -= 1;
            resolve();
          });
        }),
    );

    const result = syncYoutubeCommunityPosts(createEnv());
    await flushPromises();

    expect(maxActiveUpserts).toBe(4);
    while (pendingUpserts.length > 0) {
      pendingUpserts.splice(0).forEach((resolve) => {
        resolve();
      });
      await Promise.resolve();
    }

    await expect(result).resolves.toEqual({ synced: 10 });
  });

  it("skips community upserts while the operational freeze key is present", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    await expect(syncYoutubeCommunityPosts(createEnv("enabled"))).resolves.toEqual({ synced: 0, skipped: true });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedUpsertYoutubeVideoCommunityPost).not.toHaveBeenCalled();
  });
});

describe("getHomeYoutubeSections", () => {
  it("builds home sections from persisted youtube community posts", async () => {
    mockedGetCommunityFeedPage.mockResolvedValue({
      items: [
        {
          uid: "youtube-kr-video-1",
          postType: "youtube_video",
          origin: "curated",
          title: "KR Video",
          visibility: "public",
          pinned: false,
          subjectStudentUid: null,
          subjectContentUid: null,
          subjectRaidType: null,
          subjectSeasonIndex: null,
          blocks: [{ type: "youtube", youtubeId: "kr-video-1" }],
          sourceName: "한국 서버",
          sourceUrl: "https://www.youtube.com/watch?v=kr-video-1",
          sourceMetadata: {
            channelKey: "kr",
            thumbnailUrl: "https://i.ytimg.com/vi/kr-video-1/hqdefault.jpg",
            isShorts: false,
          },
          displayAt: "2026-03-28T00:00:00.000Z",
          createdAt: "2026-03-28T00:00:00.000Z",
          updatedAt: "2026-03-28T00:00:00.000Z",
          author: null,
          liked: false,
          likeCount: 0,
          comments: [],
        },
      ],
      page: 1,
      pageSize: 8,
      totalCount: 1,
      totalPages: 1,
    });

    await expect(getHomeYoutubeSections({} as Env)).resolves.toEqual([
      {
        channelKey: "kr",
        channelName: "한국 서버",
        channelUrl: "https://www.youtube.com/@bluearchive_kr",
        videos: [
          {
            id: "kr-video-1",
            title: "KR Video",
            url: "https://www.youtube.com/watch?v=kr-video-1",
            thumbnailUrl: "https://i.ytimg.com/vi/kr-video-1/hqdefault.jpg",
            publishedAt: "2026-03-28T00:00:00.000Z",
            isShorts: false,
            channelKey: "kr",
          },
        ],
      },
    ]);
  });
});
