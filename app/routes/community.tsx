import {
  ChatBubbleLeftRightIcon,
  UsersIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useNavigate, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { CommunityFeed } from "~/components/features/community";
import { Page } from "~/components/features/layout";
import { EmptyView, Pagination } from "~/components/primitives";
import { type CommunityPostType, getCommunityFeedPage } from "~/models/community";
import { getAllStudentsMap } from "~/models/student";
import { getGradingTagsByGradingUids } from "~/models/student-grading-tag";
import { getTimelineContentsByUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";

const PAGE_SIZE = 20;
const COMMUNITY_VISIBLE_POST_TYPES = ["student_review", "event_opinion"] as const;

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
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const postType = parseCommunityPostType(request);
  const page = parsePage(request);

  const [feedPage, allStudentsMap] = await Promise.all([
    getCommunityFeedPage(env, {
      currentUserId: currentUser?.id,
      postType,
      postTypes: postType ? [postType] : [...COMMUNITY_VISIBLE_POST_TYPES],
      page,
      pageSize: PAGE_SIZE,
    }),
    getAllStudentsMap(env, true),
  ]);

  const contentUids = feedPage.items
    .map((post) => post.subjectContentUid)
    .filter((uid): uid is string => uid !== null);
  const [timelineContents, gradingTags] = await Promise.all([
    contentUids.length > 0 ? getTimelineContentsByUids(env, contentUids) : [],
    getGradingTagsByGradingUids(
      env,
      feedPage.items.filter((post) => post.postType === "student_review").map((post) => post.uid),
    ),
  ]);

  const timelineContentMap = new Map(timelineContents.map((content) => [content.uid, content]));
  const recruitmentGroupUids = timelineContents
    .map((content) => content.recruitmentGroupUid)
    .filter((uid): uid is string => uid !== null);
  const recruitmentGroups = recruitmentGroupUids.length > 0
    ? await new RecruitmentRepository(env).getByUids(recruitmentGroupUids)
    : [];
  const recruitmentGroupMap = new Map(recruitmentGroups.map((group) => [group.uid, group]));

  return {
    postType,
    page: feedPage.page,
    totalPages: feedPage.totalPages,
    signedIn: currentUser !== null,
    studentsByUid: Object.fromEntries(
      Object.entries(allStudentsMap).map(([uid, student]) => [
        uid,
        {
          name: student.name,
        },
      ]),
    ),
    posts: feedPage.items.map((post) => ({
      ...post,
      tags: gradingTags[post.uid]?.map((tag) => tag.tagValue) ?? [],
      subjectStudentName: post.subjectStudentUid ? allStudentsMap[post.subjectStudentUid]?.name ?? null : null,
      subjectContentName: post.subjectContentUid ? timelineContentMap.get(post.subjectContentUid)?.name ?? null : null,
      pickupStudents: post.subjectContentUid
        ? (
            recruitmentGroupMap
              .get(timelineContentMap.get(post.subjectContentUid)?.recruitmentGroupUid ?? "")
              ?.recruitments.filter((recruitment) => recruitment.pickup && recruitment.student)
              .map((recruitment) => ({
                uid: recruitment.student?.uid ?? "",
                name: recruitment.student?.name ?? recruitment.studentName,
              })) ?? []
          )
        : [],
    })),
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const onPageChange = (nextPage: number) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      nextSearchParams.delete("page");
    } else {
      nextSearchParams.set("page", String(nextPage));
    }

    const query = nextSearchParams.toString();
    navigate(query ? `/community?${query}` : "/community");
  };

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
      <div className="space-y-6">
        {posts.length === 0 ? (
          <EmptyView text="아직 표시할 커뮤니티 게시물이 없어요" />
        ) : (
          <CommunityFeed posts={posts} signedIn={signedIn} studentsByUid={studentsByUid} />
        )}
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </Page>
  );
}
