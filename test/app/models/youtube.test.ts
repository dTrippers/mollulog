import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getHomeYoutubeSections } from "../../../app/models/youtube";

type YoutubeEnv = Parameters<typeof getHomeYoutubeSections>[0];

function createEnv() {
  const kv = {
    get: jest.fn(async () => null),
    put: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    list: jest.fn(async () => ({ keys: [] })),
  };

  return {
    env: {
      KV_CACHE: kv,
    } as unknown as YoutubeEnv,
    kv,
  };
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

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getHomeYoutubeSections", () => {
  it("throws when all channel fetches fail", async () => {
    const { env, kv } = createEnv();
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      throw new Error("youtube unavailable");
    });

    await expect(getHomeYoutubeSections(env)).rejects.toThrow(
      "All YouTube channel fetches failed or returned no videos",
    );

    expect(kv.put).not.toHaveBeenCalled();
  });

  it("returns the successful channel when one channel fails", async () => {
    const { env, kv } = createEnv();
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

    await expect(getHomeYoutubeSections(env)).resolves.toEqual([
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
            publishedAt: "2026-03-28T00:00:00+00:00",
            isShorts: false,
          },
        ],
      },
    ]);

    expect(kv.put).toHaveBeenCalledTimes(1);
  });
});
