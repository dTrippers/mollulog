import { XMLParser } from "fast-xml-parser";
import { fetchWithTimeout, readBodyWithTimeout } from "~/lib/fetch-timeout";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import {
  getCommunityFeedPage,
  type CommunityFeedPost,
  upsertYoutubeVideoCommunityPost,
} from "~/models/community";

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

const YOUTUBE_FEED_FETCH_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.youtubeFeedFetch;
const YOUTUBE_FEED_BODY_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.youtubeFeedBody;

export type HomeYoutubeVideo = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  isShorts: boolean;
};

export type YoutubeChannelKey = (typeof YOUTUBE_CHANNELS)[number]["key"];

export type YoutubeFeedVideo = HomeYoutubeVideo & {
  channelKey: YoutubeChannelKey;
  channelName: string;
  channelUrl: string;
};

export type HomeYoutubeChannelSection = {
  channelKey: YoutubeChannelKey;
  channelName: string;
  channelUrl: string;
  videos: HomeYoutubeVideo[];
};

export async function getHomeYoutubeSections(env: Env): Promise<HomeYoutubeChannelSection[]> {
  const page = await getCommunityFeedPage(env, {
    postTypes: ["youtube_video"],
    pageSize: 8,
    includeEngagement: false,
  });

  const sectionsByKey = new Map<YoutubeChannelKey, HomeYoutubeChannelSection>();
  for (const post of page.items) {
    const video = toHomeYoutubeVideo(post);
    if (!video) continue;

    const channelKey = video.channelKey;
    const channel = YOUTUBE_CHANNELS.find((candidate) => candidate.key === channelKey);
    const section = sectionsByKey.get(channelKey) ?? {
      channelKey,
      channelName: post.sourceName ?? channel?.name ?? channelKey,
      channelUrl: channel?.url ?? "",
      videos: [],
    };
    section.videos.push(video);
    sectionsByKey.set(channelKey, section);
  }

  return [...sectionsByKey.values()].filter((section) => section.videos.length > 0);
}

export async function fetchYoutubeFeedVideos(): Promise<YoutubeFeedVideo[]> {
  const sectionResults = await Promise.allSettled(
    YOUTUBE_CHANNELS.map(async (channel) => {
      const videos = await getChannelVideos(channel.channelId);
      return videos.map((video) => ({
        ...video,
        channelKey: channel.key,
        channelName: channel.name,
        channelUrl: channel.url,
      }));
    }),
  );

  const videos = sectionResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (videos.length === 0) {
    throw new Error("All YouTube channel fetches failed or returned no videos");
  }

  return videos;
}

export async function syncYoutubeCommunityPosts(env: Env): Promise<{ synced: number }> {
  const videos = await fetchYoutubeFeedVideos();
  await Promise.all(videos.map((video) => upsertYoutubeVideoCommunityPost(env, video)));
  return { synced: videos.length };
}

async function getChannelVideos(channelId: string): Promise<HomeYoutubeVideo[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const response = await fetchWithTimeout(url, {}, YOUTUBE_FEED_FETCH_TIMEOUT_MS, "youtube.feed.fetch", {
    channelId,
  });
  if (!response.ok) {
    throw new Error(`failed to fetch youtube feed: ${channelId} (${response.status} ${response.statusText})`);
  }

  const xml = await readBodyWithTimeout(
    () => response.text(),
    YOUTUBE_FEED_BODY_TIMEOUT_MS,
    "youtube.feed.body",
    { channelId },
  );
  const parsed = parseYoutubeFeed(xml, channelId);
  const entries = normalizeEntries(parsed.feed?.entry);

  return entries
    .map((entry) => parseEntry(entry))
    .filter((entry): entry is HomeYoutubeVideo => entry !== null);
}

function toHomeYoutubeVideo(post: CommunityFeedPost): (HomeYoutubeVideo & { channelKey: YoutubeChannelKey }) | null {
  const youtubeBlock = post.blocks.find((block) => block.type === "youtube");
  const channelKey = post.sourceMetadata.channelKey;
  const thumbnailUrl = post.sourceMetadata.thumbnailUrl;
  const isShorts = post.sourceMetadata.isShorts;

  if (
    !youtubeBlock ||
    (channelKey !== "jp" && channelKey !== "kr") ||
    typeof thumbnailUrl !== "string"
  ) {
    return null;
  }

  return {
    id: youtubeBlock.youtubeId,
    title: post.title ?? "",
    url: post.sourceUrl ?? `https://www.youtube.com/watch?v=${youtubeBlock.youtubeId}`,
    thumbnailUrl,
    publishedAt: post.displayAt,
    isShorts: typeof isShorts === "boolean" ? isShorts : false,
    channelKey,
  };
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
