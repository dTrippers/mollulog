import { useState } from "react";
import { isRouteErrorResponse, type MetaFunction, redirect, useLoaderData, useRouteError, useSearchParams } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { EventHeader, EventDetailShopPage, EventDetailInfoPage, EventDetailStagePage } from "~/components/event";
import type { ActionData as EventDetailInfoPageActionData } from "~/components/event/EventDetailInfoPage";
import { FilterButtons } from "~/components/molecules/content";
import { ErrorPage } from "~/components/organisms/error";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { getAuthenticator } from "~/auth/authenticator.server";
import { favoriteStudent, getFavoritedCounts, getUserFavoritedStudents, unfavoriteStudent } from "~/models/favorite-students";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getEventShopState } from "~/models/event-shop-state";
import { getNestedContentComments } from "~/models/content";
import { getBattlePassRewards } from "~/models/battle-pass";

const eventDetailQuery = graphql(`
  query EventDetail($eventUid: String!) {
    event(uid: $eventUid) {
      uid name type since until endless imageUrl rerun
      stages {
        uid name entryAp index difficulty
        rewards(rewardType: "item") {
          amount rewardRequirement chance
          item { uid name category rarity }
        }
      }
      videos { title youtube start }
      shopResources {
        uid
        resource { type uid name rarity }
        resourceAmount
        paymentResource { uid name }
        paymentResourceAmount
        shopAmount
      }
    }
    pickupEvent: event(uid: $eventUid) {
      pickups { type rerun since until student { uid attackType defenseType role } studentName }
    }
  }
`);

const eventRewardBonusQuery = graphql(`
  query EventRewardBonus($itemUids: [String!]!) {
    items(uids: $itemUids) {
      uid name
      rewardBonuses { student { uid role } ratio }
    }
  }
`);

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const eventUid = params.id as string;
  const { data, error } = await runQuery(eventDetailQuery, { eventUid });
  let errorMessage: string | null = null;
  if (error || !data) {
    errorMessage = error?.message ?? "이벤트 정보를 가져오는 중 오류가 발생했어요";
  } else if (!data.event) {
    errorMessage = "이벤트 정보를 찾을 수 없어요";
  }

  if (errorMessage) {
    throw new Response(
      JSON.stringify({ error: { message: errorMessage } }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { env } = context.cloudflare;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);

  const pickupStudentUids = data!.pickupEvent!.pickups.map((pickup) => pickup.student?.uid).filter((uid) => uid !== undefined);
  const favoritedStudents = currentUser ? await getUserFavoritedStudents(env, currentUser.id, eventUid) : [];
  const favoritedCounts = (await getFavoritedCounts(env, pickupStudentUids)).filter((favorited) => favorited.contentId === eventUid);
  const pickups = data!.pickupEvent!.pickups.map((pickup) => {
    return {
      ...pickup,
      favoritedCount: favoritedCounts.find((favorited) => favorited.studentId === pickup.student?.uid)?.count ?? 0,
      favorited: favoritedStudents.some((favorited) => favorited.studentId === pickup.student?.uid),
    };
  });

  let recruitedStudentUids: string[] = [];
  if (currentUser) {
    const recruitedStudents = await getRecruitedStudents(env, currentUser.id);
    recruitedStudentUids = recruitedStudents.map((student) => student.studentUid);
  }

  const paymentResourceUids = [...new Set(data!.event!.stages.flatMap((stage) => stage.rewards.flatMap((reward) => reward.item?.uid).filter((uid) => uid !== undefined)))];
  const { data: eventRewardBonusData } = await runQuery(eventRewardBonusQuery, { itemUids: paymentResourceUids });
  const eventRewardBonus = eventRewardBonusData?.items ?? [];

  const savedShopState = currentUser ? await getEventShopState(env, currentUser.id, eventUid) : null;
  const nestedComments = await getNestedContentComments(env, eventUid, currentUser);
  const battlePassRewards = data!.event!.type === "battle_pass" ? await getBattlePassRewards(env, eventUid) : null;
  return {
    event: data!.event!,
    pickups,
    recruitedStudentUids,
    eventRewardBonus,
    savedShopState,
    allComments: nestedComments,
    battlePassRewards,
    me: currentUser ? { username: currentUser.username } : null,
  };
};

type ActionData = EventDetailInfoPageActionData;

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env } = context.cloudflare;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const eventUid = params.id!;
  const actionData = await request.json() as ActionData;
  if (actionData.favorite) {
    const { studentUid, favorited } = actionData.favorite;
    const run = favorited ? favoriteStudent : unfavoriteStudent;
    await run(env, currentUser.id, studentUid, eventUid);
  }
  // Comment actions are handled by the comments API route

  return {};
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "이벤트 정보 | 몰루로그" }];
  }

  const [searchParams] = useSearchParams();
  const page = searchParams.get("page") as EventDetailPage | null ?? "info";

  const { event } = data;
  let title = event.name;
  if (page === "shop") {
    title += " - 이벤트 소탕 계산기";
  } else if (page === "stages") {
    title += " - 스테이지 정보";
  } else {
    title += " - 이벤트 정보";
  }

  const description = `블루 아카이브 "${event.name}" 이벤트의 픽업, 보상 정보 등을 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:image", content: event.imageUrl },
    { name: "og:description", content: description },
    { name: "og:url", content: `https://mollulog.net/events/${event.uid}?page=${page}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <ErrorPage message={error.data.error.message} />;
  } else {
    return <ErrorPage />;
  }
}

type EventDetailPage = "info" | "stages" | "shop";

export default function EventDetail() {
  const { event, pickups, recruitedStudentUids, eventRewardBonus, savedShopState, allComments, me, battlePassRewards } = useLoaderData<typeof loader>();

  const [searchParams] = useSearchParams();

  const showInfoPage = true;
  const showStagesPage = event.stages.length > 0;
  const showShopPage = event.shopResources.length > 0;
  const [page, setPage] = useState<EventDetailPage>(searchParams.get("page") as EventDetailPage | null ?? "info");

  return (
    <>
      <div className="max-w-3xl mx-auto mt-6">
        <EventHeader {...event} />
      </div>

      <div className="my-6 md:my-8">
        <FilterButtons
          Icon={Bars3Icon}
          buttonProps={[
            showInfoPage ? { text: "정보", active: page === "info", onToggle: () => setPage("info") } : null,
            showStagesPage ? { text: "스테이지", active: page === "stages", onToggle: () => setPage("stages") } : null,
            showShopPage ? { text: "소탕 계산기", active: page === "shop", onToggle: () => setPage("shop") } : null,
          ].filter((button) => button !== null)}
          exclusive atLeastOne
        />
      </div>

      {page === "info" && (
        <EventDetailInfoPage
          event={event}
          pickups={pickups}
          allComments={allComments}
          me={me}
          battlePassRewards={battlePassRewards ?? undefined}
        />
      )}
      {page === "stages" && (
        <EventDetailStagePage
          stages={event.stages.filter(({ difficulty }) => difficulty === 1)}
          eventRewardBonus={eventRewardBonus}
          recruitedStudentUids={recruitedStudentUids}
          signedIn={me !== null}
        />
      )}
      {page === "shop" && (
        <EventDetailShopPage
          stages={event.stages}
          shopResources={event.shopResources}
          eventRewardBonus={eventRewardBonus}
          recruitedStudentUids={recruitedStudentUids}
          eventUid={event.uid}
          savedShopState={savedShopState}
          signedIn={me !== null}
        />
      )}
    </>
  );
}
