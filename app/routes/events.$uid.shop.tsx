import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { EventDetailShopPage } from "~/components/event";
import { EmptyView } from "~/components/atoms/typography";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getEventMetadata, getEventShopContent } from "~/models/event-content";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getEventShopState } from "~/models/event-shop-state";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const { uid: timelineUid } = params;
  const { env } = context.cloudflare;

  const metadata = await getEventMetadata(env, timelineUid!);
  if (!metadata) {
    throw new Response("Not Found", { status: 404 });
  }

  const shopContent = await getEventShopContent(env, timelineUid!);
  if (!shopContent || shopContent.shopResources.length === 0) {
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

  const savedShopState = currentUser ? await getEventShopState(env, currentUser.id, timelineUid!) : null;
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
    eventUid: timelineUid!,
    signedIn: currentUser !== null,
  };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, params }) => {
  const title = `${loaderData!.eventName} - 상점 계산기`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "og:title", content: title },
    { name: "og:url", content: `https://mollulog.net/events/${params.uid}/shop` },
  ];
};

export default function EventShop() {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.empty) {
    return <EmptyView text="상점 정보가 없거나 종료된 이벤트예요" />;
  }

  const { stages, shopResources, eventRewardBonus, minigameConfig, recruitedStudentUids, savedShopState, eventUid, signedIn } = loaderData;

  return (
    <EventDetailShopPage
      stages={stages}
      shopResources={shopResources}
      eventRewardBonus={eventRewardBonus}
      recruitedStudentUids={recruitedStudentUids}
      eventUid={eventUid}
      savedShopState={savedShopState}
      signedIn={signedIn}
      minigameConfig={minigameConfig}
    />
  );
}
