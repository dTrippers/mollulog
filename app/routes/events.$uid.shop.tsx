import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getEventMetadata, getEventShopContent } from "~/models/event-content";
import { getEventShopState } from "~/models/event-shop-state";
import { getRecruitedStudents } from "~/models/recruited-student";
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
  if (
    (metadata.runType === "permanent" && !metadata.shopContentUid) ||
    !shopContent ||
    shopContent.shopResources.length === 0
  ) {
    return {
      eventName: metadata.name,
      until: metadata.until,
      empty: true as const,
    };
  }

  const eventEnded = metadata.until ? new Date(metadata.until) < new Date() : false;
  if (eventEnded) {
    return {
      eventName: metadata.name,
      until: metadata.until,
      empty: true as const,
    };
  }

  const { stages, shopResources, eventRewardBonus, minigameConfig } = shopContent;

  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  let recruitedStudentUids: string[] = [];
  if (currentUser) {
    const recruitedStudents = await getRecruitedStudents(env, currentUser.id);
    recruitedStudentUids = recruitedStudents.map((student) => student.studentUid);
  }

  const savedShopState = currentUser ? await getEventShopState(env, currentUser.id, timelineUid) : null;
  return {
    eventName: metadata.name,
    until: metadata.until,
    empty: false as const,
    stages,
    shopResources,
    eventRewardBonus,
    minigameConfig,
    recruitedStudentUids,
    savedShopState,
    eventUid: timelineUid,
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
      savedShopState={loaderData.savedShopState}
      signedIn={loaderData.signedIn}
      minigameConfig={loaderData.minigameConfig}
    />
  );
}
