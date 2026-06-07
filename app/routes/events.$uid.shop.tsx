import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { calculateShopPurchaseDays } from "~/components/features/events/shop/calculations";
import { getEventContentSchedule, getEventMetadata, getEventShopContent } from "~/models/event-content";
import { buildEventShopStateIdentity } from "~/models/event-shop-state-key";
import { getEventShopState } from "~/models/event-shop-state";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getTimelineContentDatesByContentUid } from "~/models/timeline-content";
import EventShopContent from "./events.$uid._components/EventShopContent";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = context.cloudflare;

  const metadata = await getEventMetadata(env, timelineUid);
  if (!metadata) {
    throw new Response("Not Found", { status: 404 });
  }
  const shopContent = await getEventShopContent(env, timelineUid);
  const shopSchedule = metadata.shopContentUid
    ? await getEventContentSchedule(env, metadata.shopContentUid, metadata.runType)
    : null;
  const canonicalShopDates = metadata.shopContentUid
    ? await getTimelineContentDatesByContentUid(env, metadata.shopContentUid)
    : null;
  const shopSince = shopSchedule?.startAt ?? canonicalShopDates?.startAt ?? metadata.since;
  const shopUntil = shopSchedule?.endAt ?? canonicalShopDates?.endAt ?? metadata.until;
  if (
    (metadata.runType === "permanent" && !metadata.shopContentUid) ||
    !shopContent ||
    shopContent.shopResources.length === 0
  ) {
    return {
      eventName: metadata.name,
      until: shopUntil,
      empty: true as const,
    };
  }

  const eventEnded = shopUntil ? new Date(shopUntil) < new Date() : false;
  if (eventEnded) {
    return {
      eventName: metadata.name,
      until: shopUntil,
      empty: true as const,
    };
  }

  const { stages, shopResources, eventRewardBonus, minigameConfig } = shopContent;

  const currentUser = await getActiveSensei(env, request);
  let recruitedStudentUids: string[] = [];
  if (currentUser) {
    const recruitedStudents = await getRecruitedStudents(env, currentUser.id);
    recruitedStudentUids = recruitedStudents.map((student) => student.studentUid);
  }

  const shopStateIdentity = buildEventShopStateIdentity({
    timelineUid,
    shopContentUid: metadata.shopContentUid,
  });
  const savedShopState = currentUser
    ? ((await getEventShopState(env, currentUser.id, shopStateIdentity.shopStateUid)) ??
      (shopStateIdentity.fallbackStateUid
        ? await getEventShopState(env, currentUser.id, shopStateIdentity.fallbackStateUid)
        : null))
    : null;
  return {
    eventName: metadata.name,
    until: shopUntil,
    empty: false as const,
    stages,
    shopResources,
    eventRewardBonus,
    minigameConfig,
    recruitedStudentUids,
    savedShopState,
    availablePurchaseDays: calculateShopPurchaseDays(shopSince, shopUntil),
    eventUid: timelineUid,
    shopStateUid: shopStateIdentity.shopStateUid,
    signedIn: currentUser !== null,
  };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, params }) => {
  const title = `${loaderData?.eventName ?? "이벤트"} - 상점 계산기`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "og:title", content: title },
    { name: "og:url", content: `https://mollulog.net/events/${params.uid}/shop` },
  ];
};

export default function EventShop() {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.empty) {
    return <EventShopContent empty />;
  }

  return (
    <EventShopContent
      empty={false}
      stages={loaderData.stages}
      shopResources={loaderData.shopResources}
      eventRewardBonus={loaderData.eventRewardBonus}
      recruitedStudentUids={loaderData.recruitedStudentUids}
      eventUid={loaderData.eventUid}
      shopStateUid={loaderData.shopStateUid}
      savedShopState={loaderData.savedShopState}
      availablePurchaseDays={loaderData.availablePurchaseDays}
      signedIn={loaderData.signedIn}
      minigameConfig={loaderData.minigameConfig}
    />
  );
}
