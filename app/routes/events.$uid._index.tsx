import { SparklesIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventHeader, EventInfoCard, Recruitments } from "~/components/features/events";
import { MarkdownText, SectionCard } from "~/components/primitives";
import { filterRecruitmentsByStudentUids, getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import { toUtcIso } from "~/lib/date-time";
import { canonicalLink } from "~/lib/seo";
import { getNestedContentComments } from "~/models/content.server";
import {
  favoriteStudent,
  getFavoritedCounts,
  getUserFavoritedStudents,
  unfavoriteStudent,
} from "~/models/favorite-students";
import { getPostByTimelineContentUid } from "~/models/post";
import { getRecruitmentGroupByUid } from "~/models/recruitment";
import { getTimelineContent, getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import EventComment from "./events.$uid._components/EventComment";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const content = await getTimelineContent(publicReadEnv, timelineUid, { ctx });
  if (!content) {
    throw new Response("Not Found", { status: 404 });
  }

  const recruitmentGroup = content.recruitmentGroupUid
    ? await getRecruitmentGroupByUid(env, content.recruitmentGroupUid)
    : null;
  const recruitments = filterRecruitmentsByStudentUids(
    recruitmentGroup?.recruitments ?? [],
    content.recruitmentStudentUids,
  );
  const siblingEvents = content.recruitmentGroupUid
    ? (await getTimelineContentsByRecruitmentGroupUids(publicReadEnv, [content.recruitmentGroupUid], { ctx })).filter(
        (sibling) => sibling.uid !== content.uid,
      )
    : [];
  const eventContent = {
    name: content.name,
    since: content.startAt,
    until: content.endAt,
    imageUrl: content.imageUrl,
    type: content.contentType,
    runType: content.runType,
    endless: content.endless,
    videos: content.videos,
    recruitments,
  };

  const currentUser = await getActiveSensei(env, request);

  const studentUids = eventContent.recruitments.map(getRecruitmentFavoriteKey);

  const [favoritedStudents, favoritedCounts, allComments, livePost] = await Promise.all([
    currentUser ? getUserFavoritedStudents(env, currentUser.id, timelineUid, { ctx }) : [],
    getFavoritedCounts(env, studentUids, { ctx }),
    getNestedContentComments(currentUser ? env : publicReadEnv, timelineUid, currentUser),
    content.contentType === "live" ? getPostByTimelineContentUid(env, timelineUid, { ctx }) : null,
  ]);

  const recruitmentsWithFavorites = eventContent.recruitments.map((recruitment) => ({
    ...recruitment,
    since: toUtcIso(recruitment.since),
    until: recruitment.until ? toUtcIso(recruitment.until) : null,
    favoriteKey: getRecruitmentFavoriteKey(recruitment),
    favorited: favoritedStudents.some((f) => f.studentId === getRecruitmentFavoriteKey(recruitment)),
    favoritedCount:
      favoritedCounts.find((f) => f.studentId === getRecruitmentFavoriteKey(recruitment) && f.contentId === timelineUid)
        ?.count ?? 0,
  }));

  return {
    eventContent: { ...eventContent, recruitments: recruitmentsWithFavorites },
    signedIn: currentUser !== null,
    allComments,
    me: currentUser ? { username: currentUser.username } : null,
    eventUid: timelineUid,
    siblingEvents: siblingEvents.map((sibling) => ({ uid: sibling.uid, name: sibling.name })),
    livePost,
  };
};

type ActionData = {
  favorite?: {
    studentUid: string;
    favorited: boolean;
  };
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const eventUid = params.uid;
  if (!eventUid) {
    throw new Response("Not Found", { status: 404 });
  }
  const actionData = (await request.json()) as ActionData;
  if (actionData.favorite) {
    const { studentUid, favorited } = actionData.favorite;
    const run = favorited ? favoriteStudent : unfavoriteStudent;
    await run(env, currentUser.id, studentUid, eventUid, { ctx });
  }

  return {};
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, params, location }) => {
  if (!loaderData) {
    return [{ title: "이벤트 정보 | 몰루로그" }];
  }

  const { uid: timelineUid } = params;
  const { eventContent } = loaderData;
  const isLive = eventContent.type === "live";
  const title = `${eventContent.name} - ${isLive ? "공식 방송" : "이벤트 정보"}`;
  const description = isLive
    ? `블루 아카이브 "${eventContent.name}" 공식 방송 정보와 선생님들의 의견을 확인해보세요.`
    : `블루 아카이브 "${eventContent.name}" 이벤트의 픽업, 보상 정보 등을 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:image", content: eventContent.imageUrl },
    { property: "og:description", content: description },
    { property: "og:url", content: `https://mollulog.net/events/${timelineUid}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
    canonicalLink(location.pathname),
  ];
};

export default function EventIndex() {
  const { eventContent, signedIn, allComments, me, eventUid, siblingEvents, livePost } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const isLive = eventContent.type === "live";

  return (
    <div className="w-full">
      <div className="my-2 lg:my-8">
        <EventHeader
          imageUrl={eventContent.imageUrl}
          name={eventContent.name}
          type={eventContent.type}
          runType={eventContent.runType}
          since={eventContent.since}
          until={eventContent.until}
          endless={eventContent.endless}
          videos={eventContent.videos}
        />
      </div>

      {siblingEvents.map((sibling) => (
        <EventInfoCard
          key={sibling.uid}
          Icon={SparklesIcon}
          title="모집 동시 개최"
          description={`"${sibling.name}" 이벤트 모집과 동시에 개최되어 모집 포인트(천장)을 공유해요.`}
          onClick={() => navigate(`/events/${sibling.uid}`)}
          showArrow
        />
      ))}

      {eventContent.recruitments.length > 0 && (
        <Recruitments recruitments={eventContent.recruitments} signedIn={signedIn} />
      )}

      {isLive && (
        <SectionCard className="my-4 md:my-6">
          {livePost ? (
            <>
              <h2 className="text-lg font-black md:text-xl">{livePost.title}</h2>
              <MarkdownText text={livePost.content} />
            </>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              라이브 방송에서 공개된 정보가 업데이트 될 예정이에요
            </p>
          )}
        </SectionCard>
      )}

      <EventComment
        allComments={allComments}
        me={me}
        eventUid={eventUid}
        title={isLive ? "공식 방송 의견" : "이벤트 의견"}
      />
    </div>
  );
}
