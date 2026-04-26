import {
  ChatBubbleLeftRightIcon,
  UsersIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { CommunityInfiniteFeed } from "~/components/features/community";
import { Page } from "~/components/features/layout";
import { type CommunityPostType, getCommunityFeedPage } from "~/models/community";
import {
  COMMUNITY_FEED_PAGE_SIZE,
  COMMUNITY_VISIBLE_POST_TYPES,
  enrichCommunityFeedPosts,
} from "~/models/community-feed";

function parseCommunityPostType(request: Request): CommunityPostType | undefined {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type === "student_review" || type === "event_opinion") {
    return type;
  }

  return undefined;
}

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  const postType = parseCommunityPostType(request);
  const page = parsePage(request);

  const feedPage = await getCommunityFeedPage(env, {
    currentUserId: currentUser?.id,
    postType,
    postTypes: postType ? [postType] : [...COMMUNITY_VISIBLE_POST_TYPES],
    page,
    pageSize: COMMUNITY_FEED_PAGE_SIZE,
  });
  const enrichedFeed = await enrichCommunityFeedPosts(env, feedPage.items);

  return {
    postType,
    page: feedPage.page,
    totalPages: feedPage.totalPages,
    signedIn: currentUser !== null,
    studentsByUid: enrichedFeed.studentsByUid,
    posts: enrichedFeed.posts,
  };
};

export const meta: MetaFunction = () => {
  const title = "평가/의견 | 몰루로그";
  const description = "블루 아카이브의 학생 평가와 이벤트 의견을 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export default function CommunityPage() {
  const { posts, signedIn, studentsByUid, postType, page, totalPages } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const getPageUrl = useCallback((nextPage: number) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("page", String(nextPage));

    const query = nextSearchParams.toString();
    return query ? `/community?${query}` : "/community";
  }, [searchParams]);

  return (
    <Page
      title="평가/의견"
      description="선생님들의 학생 평가와 이벤트 의견을 한곳에서 확인해보세요"
      layout="vertical"
      screens={[
        {
          text: "전체",
          description: "모든 게시물",
          Icon: Squares2X2Icon,
          link: "/community",
          active: postType === undefined,
        },
        {
          text: "학생 평가",
          description: "학생별 평가 게시물",
          Icon: UsersIcon,
          link: "/community?type=student_review",
          active: postType === "student_review",
        },
        {
          text: "이벤트 의견",
          description: "컨텐츠 관련 의견과 질문",
          Icon: ChatBubbleLeftRightIcon,
          link: "/community?type=event_opinion",
          active: postType === "event_opinion",
        },
      ]}
    >
      <CommunityInfiniteFeed
        posts={posts}
        signedIn={signedIn}
        studentsByUid={studentsByUid}
        page={page}
        totalPages={totalPages}
        emptyText="아직 표시할 커뮤니티 게시물이 없어요"
        resetKey={postType ?? "all"}
        getPageUrl={getPageUrl}
      />
    </Page>
  );
}
