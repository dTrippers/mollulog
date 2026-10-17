import { getLogger } from "~/lib/observability.server";
import { getPostByUid, getRecentNewsPosts, type Post } from "~/models/post";

export const RECENT_NEWS_LIMIT = 3;

export type PostDetailBack = { kind: "news" } | { kind: "event"; timelineContentUid: string } | { kind: "none" };

export type PostSummary = Pick<Post, "uid" | "title" | "createdAt">;

// Same shape as the home section result. A failed recent-news lookup is isolated to its own block.
export type RecentNewsSource = { status: "success"; data: PostSummary[] } | { status: "error" };

export type PostDetailView = {
  post: Pick<Post, "uid" | "title" | "content" | "createdAt">;
  back: PostDetailBack;
  // Null for a post outside the news board, which has no recent-news block.
  recent: RecentNewsSource | null;
};

function getBackLink(post: Pick<Post, "board" | "timelineContentUid">): PostDetailBack {
  if (post.board === "news") {
    return { kind: "news" };
  }
  if (post.timelineContentUid) {
    return { kind: "event", timelineContentUid: post.timelineContentUid };
  }
  return { kind: "none" };
}

async function loadRecentNews(
  env: Env,
  excludeUid: string,
  options: { ctx?: ExecutionContext },
): Promise<RecentNewsSource> {
  try {
    const posts = await getRecentNewsPosts(env, excludeUid, RECENT_NEWS_LIMIT, options);
    return {
      status: "success",
      data: posts.map((post) => ({ uid: post.uid, title: post.title, createdAt: post.createdAt })),
    };
  } catch (error) {
    getLogger(env, options.ctx, { route: "post.detail.recent_news" }).error("Failed to load recent news posts", error);
    return { status: "error" };
  }
}

// Returns null when the post does not exist. A failed post lookup throws, so the route boundary shows the failure state.
export async function getPostDetailView(
  env: Env,
  uid: string,
  options: { ctx?: ExecutionContext } = {},
): Promise<PostDetailView | null> {
  const post = await getPostByUid(env, uid, options);
  if (!post) {
    return null;
  }

  const view = {
    post: { uid: post.uid, title: post.title, content: post.content, createdAt: post.createdAt },
    back: getBackLink(post),
  };
  if (post.board !== "news") {
    return { ...view, recent: null };
  }
  return { ...view, recent: await loadRecentNews(env, post.uid, options) };
}
