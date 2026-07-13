import { SparklesIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventHeader, EventInfoCard, Recruitments } from "~/components/features/events";
import { filterRecruitmentsByStudentUids, getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import { withD1Session } from "~/lib/d1-session";
import { toUtcIso } from "~/lib/date-time";
import { canonicalLink } from "~/lib/seo";
import { getNestedContentComments } from "~/models/content";
import {
  favoriteStudent,
  getFavoritedCounts,
  getUserFavoritedStudents,
  unfavoriteStudent,
} from "~/models/favorite-students";
import { getRecruitmentGroupByUid } from "~/models/recruitment";
import { getTimelineContent, getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import EventComment from "./events.$uid._components/EventComment";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = withD1Session(env, "first-unconstrained");
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

  const [favoritedStudents, favoritedCounts, allComments] = await Promise.all([
    currentUser ? getUserFavoritedStudents(env, currentUser.id, timelineUid) : [],
    getFavoritedCounts(currentUser ? env : publicReadEnv, studentUids),
    getNestedContentComments(currentUser ? env : publicReadEnv, timelineUid, currentUser),
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
  };
};

type ActionData = {
  favorite?: {
    studentUid: string;
    favorited: boolean;
  };
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env } = context.cloudflare;
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
    await run(env, currentUser.id, studentUid, eventUid);
  }

  return {};
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, params, location }) => {
  if (!loaderData) {
    return [{ title: "이벤트 정보 | 몰루로그" }];
  }

  const { uid: timelineUid } = params;
  const { eventContent } = loaderData;
  const title = `${eventContent.name} - 이벤트 정보`;

  const description = `블루 아카이브 "${eventContent.name}" 이벤트의 픽업, 보상 정보 등을 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:image", content: eventContent.imageUrl },
    { name: "og:description", content: description },
    { name: "og:url", content: `https://mollulog.net/events/${timelineUid}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
    canonicalLink(location.pathname),
  ];
};

export default function EventIndex() {
  const { eventContent, signedIn, allComments, me, eventUid, siblingEvents } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

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

      <EventComment allComments={allComments} me={me} eventUid={eventUid} />
    </div>
  );
}
