import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { runQuery } from "~/lib/baql";
import { Link, useLoaderData } from "react-router";
import { graphql } from "~/graphql";
import { SubTitle } from "~/components/atoms/typography";
import { getContentsComments, nestComments } from "~/models/content";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getRouteSensei } from "./$username";
import { FuturePlan } from "~/components/organisms/future";
import { getAuthenticator } from "~/auth/authenticator.server";
import type { NestedComment } from "~/models/content";

const userFuturesQuery = graphql(`
  query UserFutures($now: ISO8601DateTime!) {
    events(first: 999, untilAfter: $now) {
      nodes {
        uid name since until
        pickups {
          type rerun
          student {
            uid attackType defenseType role schaleDbId name school equipments
            skillItems(skillType: ex, skillLevel: 5) {
              item { uid subCategory rarity }
            }
          }
        }
      }
    }
  }
`);

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 관심 학생 목록 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님의 관심 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 관심 학생 목록 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님의 관심 학생 목록을 확인해보세요` },
  ];
};

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const truncatedNow = new Date();
  truncatedNow.setMinutes(0, 0, 0);

  const { data, error } = await runQuery(userFuturesQuery, { now: truncatedNow });
  if (error || !data) {
    throw error ?? "failed to fetch events";
  }

  const env = context.cloudflare.env;
  const sensei = await getRouteSensei(env, params);
  const currentUser = await getAuthenticator(env).isAuthenticated(request);

  const favoritedStudents = await getUserFavoritedStudents(env, sensei.id);
  const plannedContentIds = favoritedStudents.map(({ contentId }) => contentId);

  const events = data.events.nodes.filter((event) => plannedContentIds.includes(event.uid));

  const allComments: Record<string, NestedComment[]> = {};
  const contentComments = await getContentsComments(env, plannedContentIds, currentUser?.id);
  for (const contentId of plannedContentIds) {
    allComments[contentId] = nestComments(contentComments[contentId] ?? [], sensei);
  }

  return {
    events,
    favoritedStudents,
    allComments,
    isMe: currentUser?.id === sensei.id,
  };
}

export default function UserFutures() {
  const { events, favoritedStudents, allComments } = useLoaderData<typeof loader>();

  if (events.length === 0) {
    return (
      <div className="my-16">
        <p className="text-center my-4">아직 관심 학생을 등록하지 않았어요</p>
        <Link to="/futures" className="text-center underline">
          <p>미래시 보고 등록하러 가기 →</p>
        </Link>
      </div>
    )
  }

  return (
    <div className="my-8">
      <SubTitle text="관심 학생 목록" />
      {events.map((event) => {
        return (
          <FuturePlan
            key={event.uid}
            event={event}
            favoritedStudents={favoritedStudents.filter(({ contentId }) => contentId === event.uid)}
            comments={allComments[event.uid] ?? []}
          />
        );
      })}
    </div>
  );
}
