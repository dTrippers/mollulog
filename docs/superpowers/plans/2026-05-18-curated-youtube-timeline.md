# Curated YouTube Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist official YouTube videos as non-user-authored `community_posts` and show them in the evaluation/opinion timeline with comments and likes.

**Architecture:** Keep `community_posts` as the canonical feed item model. Add curated-origin fields and a `youtube_video` post type, sync YouTube RSS entries into `community_posts` by `(sourceType, sourceUid)`, and reuse existing `community_comments` and `community_post_likes` APIs. The home YouTube rail reads from persisted posts instead of live RSS.

**Tech Stack:** React Router v7, TypeScript, Cloudflare D1, Drizzle ORM, Jest, Biome, YouTube RSS via `fast-xml-parser`.

---

### Task 1: Extend Community Post Model for Curated Feed Items

**Files:**
- Create: `db/migrations/20260518000000_add_curated_fields_to_community_posts.sql`
- Modify: `app/models/community.ts`
- Test: `test/app/models/youtube.test.ts`, `test/app/routes/__manage.test.ts`

- [ ] **Step 1: Add migration**

Create `db/migrations/20260518000000_add_curated_fields_to_community_posts.sql`:

```sql
alter table community_posts add column origin text not null default 'user';
alter table community_posts add column display_at text;
alter table community_posts add column source_name text;
alter table community_posts add column source_url text;
alter table community_posts add column source_metadata text not null default '{}';

create index if not exists community_posts_displayAt on community_posts (display_at desc, id desc);
```

- [ ] **Step 2: Update TypeScript schema and types**

In `app/models/community.ts`:

```ts
export type CommunityPostType =
  | "student_review"
  | "event_opinion"
  | "guide"
  | "youtube_video";
export type CommunityPostOrigin = "user" | "curated";
```

Add `origin` and `displayAt` to `communityPostsTable`, `CommunityFeedPost`, `CommunityPostRow`, and returned objects. Existing rows use `origin: "user"` and `displayAt: updatedAt`.

- [ ] **Step 3: Verify ordering by displayAt through typecheck and focused tests**

Update `getCommunityFeedPage()` to sort by `coalesce(displayAt, updatedAt)` so existing user posts keep their current updated-at ordering and YouTube posts sort by published date.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm test test/app/models/youtube.test.ts test/app/routes/__manage.test.ts
pnpm run typecheck
```

Expected: PASS.

### Task 2: Sync YouTube RSS into Community Posts

**Files:**
- Modify: `app/models/youtube.ts`
- Modify: `app/models/community.ts`
- Create or modify: `test/app/models/youtube.test.ts`

- [ ] **Step 1: Export normalized YouTube feed helpers**

In `app/models/youtube.ts`, keep RSS parsing but expose a normalized video type that includes channel metadata:

```ts
export type YoutubeChannelKey = "jp" | "kr";
export type YoutubeFeedVideo = HomeYoutubeVideo & {
  channelKey: YoutubeChannelKey;
  channelName: string;
  channelUrl: string;
};
```

Add `fetchYoutubeFeedVideos(): Promise<YoutubeFeedVideo[]>` that fetches all configured channels and returns flattened videos.

- [ ] **Step 2: Add upsert function for curated YouTube posts**

In `app/models/community.ts`, add:

```ts
export async function upsertYoutubeVideoCommunityPost(
  env: Env,
  video: {
    id: string;
    title: string;
    url: string;
    thumbnailUrl: string;
    publishedAt: string;
    isShorts: boolean;
    channelKey: "jp" | "kr";
    channelName: string;
    channelUrl: string;
  },
): Promise<void>
```

It must insert or update `community_posts` with:

```ts
postType: "youtube_video"
origin: "curated"
userId: 0
title: video.title
visibility: "public"
blocks: [
  { type: "youtube", youtubeId: video.id },
]
sourceType: "youtube"
sourceUid: video.id
sourceName: video.channelName
sourceUrl: video.url
sourceMetadata: { channelKey, thumbnailUrl, isShorts }
displayAt: video.publishedAt
createdAt: video.publishedAt
updatedAt: nowUtcIso()
```

Use existing unique index `community_posts_source` for idempotency. If D1/Drizzle upsert support is awkward, select existing by `sourceType/sourceUid`, then update or insert.

- [ ] **Step 3: Add sync function**

In `app/models/youtube.ts`, add:

```ts
export async function syncYoutubeCommunityPosts(env: Env): Promise<{ synced: number }>;
```

It calls `fetchYoutubeFeedVideos()` and upserts every video via `upsertYoutubeVideoCommunityPost`.

- [ ] **Step 4: Test idempotent sync**

Extend `test/app/models/youtube.test.ts` to verify RSS entries are normalized with channel metadata and that sync calls the upsert path once per video without duplicating source UIDs. Mock DB if the existing test style makes full Drizzle setup too heavy.

- [ ] **Step 5: Run focused YouTube tests**

Run:

```bash
pnpm test test/app/models/youtube.test.ts
```

Expected: PASS.

### Task 3: Render YouTube Posts in Community Feed

**Files:**
- Modify: `app/models/community-feed.ts`
- Modify: `app/routes/community.tsx`
- Modify: `app/components/features/community/CommunityFeed.tsx`
- Modify: `app/components/features/community/community-feed-presentation.ts`

- [ ] **Step 1: Include YouTube posts in visible community feed**

Change:

```ts
export const COMMUNITY_VISIBLE_POST_TYPES = ["student_review", "event_opinion", "youtube_video"] as const;
```

Update `parseCommunityPostType()` and tabs in `app/routes/community.tsx` to include `youtube_video` under a user-facing "영상" tab.

- [ ] **Step 2: Render curated author metadata**

In `CommunityFeed.tsx`, when `post.origin === "curated"`, do not link to `/@...`. Show source-oriented header text such as `공식 유튜브` and the timestamp.

- [ ] **Step 3: Allow comments and likes for YouTube posts**

Change:

```ts
const canComment = post.postType === "event_opinion" || post.postType === "youtube_video";
const canLike = post.postType === "guide" || post.postType === "youtube_video";
```

Keep the existing `/api/community/posts/:uid/comments` and `/api/community/posts/:uid/likes` endpoints.

- [ ] **Step 4: Add YouTube post presentation**

Use existing `youtube` block rendering for the embed. Keep the source URL on `community_posts.sourceUrl` instead of adding a new block type.

- [ ] **Step 5: Run focused community component/type checks**

Run:

```bash
pnpm test test/app/models/youtube.test.ts test/app/routes/__manage.test.ts
pnpm run typecheck
```

Expected: PASS.

### Task 4: Replace Home YouTube Rail Data Source

**Files:**
- Modify: `app/models/youtube.ts`
- Modify: `app/routes/_index.tsx`
- Modify: `app/routes/_index._components/HomeRightRail.tsx`
- Test: `test/app/models/youtube.test.ts`

- [ ] **Step 1: Add persisted home query**

In `app/models/youtube.ts`, add:

```ts
export async function getHomeYoutubeSections(env: Env): Promise<HomeYoutubeChannelSection[]>
```

Refactor it to read latest `youtube_video` community posts grouped by channel metadata in block/source metadata, instead of fetching RSS on every home load. Keep an internal fallback helper available only for sync tests if needed.

- [ ] **Step 2: Preserve home UI contract**

Keep `HomeRightRail` props unchanged if possible. It should still receive `HomeYoutubeChannelSection[]`, so the route and component diff stays small.

- [ ] **Step 3: Update tests**

Update `test/app/models/youtube.test.ts` to reflect DB-backed home reads and RSS-backed sync separately.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm test test/app/models/youtube.test.ts
```

Expected: PASS.

### Task 5: Wire Sync into Admin Refresh

**Files:**
- Modify: `app/routes/[__manage].tsx`
- Test: `test/app/routes/__manage.test.ts`

- [ ] **Step 1: Add refresh task**

Import `syncYoutubeCommunityPosts` and add it to `RefreshTaskName` and `leafTasks`.

- [ ] **Step 2: Update manage route tests**

Update `test/app/routes/__manage.test.ts` mocks and expectations so cache refresh includes the YouTube community sync task.

- [ ] **Step 3: Run manage route tests**

Run:

```bash
pnpm test test/app/routes/__manage.test.ts
```

Expected: PASS.

### Task 6: Final Verification

**Files:**
- All touched files

- [ ] **Step 1: Run model and route tests**

Run:

```bash
pnpm test test/app/models/youtube.test.ts test/app/routes/__manage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Review diff**

Run:

```bash
git diff --stat
git diff
```

Expected: only scoped migration, model, route, component, and test changes.
