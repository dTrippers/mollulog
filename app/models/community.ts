import type {
  WalkthroughTimelineDefenseType,
  WalkthroughTimelineDifficulty,
  WalkthroughTimelineDocument,
  WalkthroughTimelineRecord,
  WalkthroughTimelineTerrain,
} from "~/domain/walkthrough-timeline";
import { cacheKey, cacheQuery, fetchCached } from "~/lib/cache";
import { normalizeUtcTimestamp, type UtcIsoString } from "~/lib/date-time";

export type CommunityPostType =
  | "student_review"
  | "event_opinion"
  | "guide"
  | "youtube_video"
  | "recruitment_result"
  | "walkthrough_timeline";
export type CommunityPostOrigin = "user" | "curated";
export type CommunityVisibility = "public" | "unlisted" | "private";
export type CommunityCommentVisibility = "public" | "private";

export type PlaintextCommunityPostBlock = {
  type: "plaintext";
  text: string;
};

export type MarkdownCommunityPostBlock = {
  type: "markdown";
  text: string;
};

export type YoutubeCommunityPostBlock = {
  type: "youtube";
  youtubeId: string;
  startAt?: number | null;
};

export type PartyInfoCommunityPostBlock = {
  type: "party_info";
  title?: string | null;
  memo?: string | null;
  raidType?: string | null;
  seasonIndex?: number | null;
  units: (string | null)[][];
};

export type WalkthroughTimelineCommunityPostBlock = {
  type: "walkthrough_timeline";
  timelineUid: string;
  bossUid: string;
  terrain: WalkthroughTimelineTerrain;
  defenseType: WalkthroughTimelineDefenseType;
  maxDifficulty: WalkthroughTimelineDifficulty;
  partySize?: WalkthroughTimelineDocument["partySize"];
  partyCount: number;
  usedStudentUids: string[];
};

export type CommunityPostBlock =
  | PlaintextCommunityPostBlock
  | MarkdownCommunityPostBlock
  | YoutubeCommunityPostBlock
  | PartyInfoCommunityPostBlock
  | WalkthroughTimelineCommunityPostBlock;

export type NestedCommunityComment = {
  uid: string;
  body: string;
  visibility: CommunityCommentVisibility;
  createdAt: UtcIsoString;
  sensei: {
    me: boolean;
    username: string;
    profileStudentId: string | null;
  };
  subcomments?: NestedCommunityComment[];
};

export type CommunityFeedPost = {
  uid: string;
  postType: CommunityPostType;
  origin: CommunityPostOrigin;
  title: string | null;
  visibility: CommunityVisibility;
  pinned: boolean;
  subjectStudentUid: string | null;
  subjectContentUid: string | null;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  blocks: CommunityPostBlock[];
  sourceName: string | null;
  sourceUrl: string | null;
  sourceMetadata: Record<string, unknown>;
  displayAt: UtcIsoString;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
  author: {
    id: number;
    username: string;
    profileStudentId: string | null;
  } | null;
  liked: boolean;
  likeCount: number;
  comments: NestedCommunityComment[];
};

export function serializeCommunityPostBlocks(blocks: CommunityPostBlock[]): string {
  return JSON.stringify(blocks);
}

export function parseCommunityPostBlocks(value: string | unknown): CommunityPostBlock[] {
  if (Array.isArray(value)) {
    return value as CommunityPostBlock[];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? (parsed as CommunityPostBlock[]) : [];
  } catch {
    return [];
  }
}

export function createPlaintextCommunityPostBlocks(textValue: string | null | undefined): CommunityPostBlock[] {
  if (!textValue || textValue.trim().length === 0) {
    return [];
  }

  return [{ type: "plaintext", text: textValue.trim() }];
}

export function getPrimaryPlaintextBlockText(blocks: CommunityPostBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === "plaintext" || block.type === "markdown") {
      return block.text;
    }
  }

  return null;
}

export function normalizeCommunityTimestamp(value: string): UtcIsoString {
  return normalizeUtcTimestamp(value);
}

export type CommunityFeedPageOptions = {
  currentUserId?: number | null;
  page?: number;
  pageSize?: number;
  postType?: CommunityPostType;
  postTypes?: CommunityPostType[];
  authorUserId?: number;
  youtubeChannelKey?: "jp" | "kr";
  includeEngagement?: boolean;
  /** Lets the cached-feed path background-refresh via `ctx.waitUntil` instead of firing-and-forgetting past the response. */
  ctx?: ExecutionContext;
};

export type CommunityFeedPageResult = {
  items: CommunityFeedPost[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/** Cache version for the anonymous community feed; bump to invalidate stored entries. */
const COMMUNITY_FEED_CACHE_VERSION = "v1";
const COMMUNITY_FEED_CACHE_FRESH_TTL = 12;
const COMMUNITY_FEED_CACHE_MAX_STALE_TTL = 3 * 60;

/**
 * Applies the shared anonymous first-page KV cache to the PostgreSQL community feed.
 * Signed-in and deeper-page requests bypass this cache, preserving the existing
 * personalized and pagination behavior.
 */
export async function getCommunityFeedPageWithCache(
  env: Env,
  options: CommunityFeedPageOptions = {},
  loader: (env: Env, options: CommunityFeedPageOptions) => Promise<CommunityFeedPageResult>,
): Promise<CommunityFeedPageResult> {
  const page = Math.max(1, options.page ?? 1);
  if (options.currentUserId || page > 1) {
    return loader(env, options);
  }

  const { postType, postTypes, authorUserId, youtubeChannelKey, includeEngagement = true } = options;
  const types = postTypes && postTypes.length > 0 ? [...postTypes].sort() : postType ? [postType] : [];
  const feedCacheKey = cacheKey(
    "cache",
    "community-feed",
    Number(COMMUNITY_FEED_CACHE_VERSION.replace("v", "")),
    cacheQuery({
      author: authorUserId ?? "",
      eng: includeEngagement ? 1 : 0,
      size: Math.max(1, options.pageSize ?? 20),
      types: types.join(","),
      yt: youtubeChannelKey ?? "",
    }),
  );

  return fetchCached(env, feedCacheKey, () => loader(env, options), COMMUNITY_FEED_CACHE_FRESH_TTL, false, {
    ctx: options.ctx,
    maxStaleTtl: COMMUNITY_FEED_CACHE_MAX_STALE_TTL,
    mode: "route",
    swr: true,
  });
}

export type YoutubeVideoCommunityPostInput = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  isShorts: boolean;
  channelKey: "jp" | "kr";
  channelName: string;
  channelUrl: string;
};

export function createWalkthroughTimelineCommunityPostBlocks({
  uid,
  description,
  bossUid,
  terrain,
  defenseType,
  maxDifficulty,
  document,
}: {
  uid: string;
  description: string;
  bossUid: string;
  terrain: WalkthroughTimelineTerrain;
  defenseType: WalkthroughTimelineDefenseType;
  maxDifficulty: WalkthroughTimelineDifficulty;
  document: WalkthroughTimelineDocument;
}): CommunityPostBlock[] {
  const usedStudentUids = [
    ...new Set(document.parties[0]?.units.flatMap((unit) => (unit.studentUid ? [unit.studentUid] : [])) ?? []),
  ];

  return [
    ...createPlaintextCommunityPostBlocks(description),
    {
      type: "walkthrough_timeline",
      timelineUid: uid,
      bossUid,
      terrain,
      defenseType,
      maxDifficulty,
      partySize: document.partySize,
      partyCount: document.parties.length,
      usedStudentUids,
    },
  ];
}

// Keep this type import reachable for consumers that used to infer timeline
// projections from this module without introducing a storage dependency.
export type { WalkthroughTimelineRecord };
