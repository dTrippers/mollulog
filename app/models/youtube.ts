import { XMLParser } from "fast-xml-parser";
import { fetchCached } from "./base";

const YOUTUBE_CHANNELS = [
  {
    key: "jp",
    name: "일본 서버",
    url: "https://www.youtube.com/@BlueArchive_JP",
    channelId: "UCmgf8DJrAXFnU7j3u0kklUQ",
  },
  {
    key: "kr",
    name: "한국 서버",
    url: "https://www.youtube.com/@bluearchive_kr",
    channelId: "UCj0iColXMAjPA92rH-AXVGQ",
  },
] as const;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

export type HomeYoutubeVideo = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  isShorts: boolean;
};

export type HomeYoutubeChannelSection = {
  channelKey: (typeof YOUTUBE_CHANNELS)[number]["key"];
  channelName: string;
  channelUrl: string;
  videos: HomeYoutubeVideo[];
};

export async function getHomeYoutubeSections(env: Env, forceRefresh = false): Promise<HomeYoutubeChannelSection[]> {
  return fetchCached(
    env,
    "home-youtube-sections::v1",
    async () => {
      const sectionResults = await Promise.allSettled(
        YOUTUBE_CHANNELS.map(async (channel) => {
          const videos = await getChannelVideos(channel.channelId);
          return {
            channelKey: channel.key,
            channelName: channel.name,
            channelUrl: channel.url,
            videos,
          } satisfies HomeYoutubeChannelSection;
        }),
      );

      return sectionResults
        .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
        .filter((section) => section.videos.length > 0);
    },
    60 * 30,
    true,
  );
}

async function getChannelVideos(channelId: string): Promise<HomeYoutubeVideo[]> {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!response.ok) {
    throw new Error(`failed to fetch youtube feed: ${channelId} (${response.status} ${response.statusText})`);
  }

  const xml = await response.text();
  const parsed = parseYoutubeFeed(xml, channelId);
  const entries = normalizeEntries(parsed.feed?.entry);

  return entries
    .slice(0, 4)
    .map((entry) => parseEntry(entry))
    .filter((entry): entry is HomeYoutubeVideo => entry !== null);
}

function parseYoutubeFeed(xml: string, channelId: string): YoutubeFeed {
  try {
    return xmlParser.parse(xml) as YoutubeFeed;
  } catch (_error) {
    throw new Error(`failed to parse youtube feed XML: ${channelId}`);
  }
}

function normalizeEntries(entry: YoutubeFeed["feed"]["entry"]): YoutubeFeedEntry[] {
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

function parseEntry(entry: YoutubeFeedEntry): HomeYoutubeVideo | null {
  const id = entry.videoId;
  const title = entry.title;
  const url = typeof entry.link === "string" ? entry.link : entry.link?.href;
  const publishedAt = entry.published;
  const thumbnailUrl = entry.group?.thumbnail?.url;

  if (!id || !title || !url || !publishedAt || !thumbnailUrl) {
    return null;
  }

  return {
    id,
    title,
    url,
    thumbnailUrl,
    publishedAt,
    isShorts: url.includes("/shorts/"),
  };
}

type YoutubeFeedEntry = {
  videoId?: string;
  title?: string;
  link?: { href?: string } | string;
  published?: string;
  group?: {
    thumbnail?: { url?: string };
  };
};

type YoutubeFeed = {
  feed: {
    entry?: YoutubeFeedEntry | YoutubeFeedEntry[];
  };
};
