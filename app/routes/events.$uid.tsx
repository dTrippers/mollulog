import { InformationCircleIcon, ListBulletIcon, ShoppingCartIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { type LoaderFunctionArgs, Outlet, redirect, useLoaderData, useLocation, useParams } from "react-router";
import { PanelEventSelector } from "~/components/features/events";
import { Page } from "~/components/features/layout";
import { withD1Session } from "~/lib/d1-session";
import { compareInstantAsc } from "~/lib/date-time";
import { getEventMetadata, getShopAvailableEvents } from "~/models/event-content";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = withD1Session(env, "first-unconstrained");
  const eventMetadata = await getEventMetadata(publicReadEnv, uid, ctx);
  if (!eventMetadata) {
    throw new Response("Not Found", { status: 404 });
  }
  const pathname = new URL(request.url).pathname;
  if (eventMetadata.contentType === "live" && pathname !== `/events/${uid}`) {
    return redirect(`/events/${uid}`);
  }
  const shopAvailableEvents = pathname.endsWith("/shop") ? await getShopAvailableEvents(publicReadEnv, ctx) : [];
  if (
    pathname.endsWith("/shop") &&
    eventMetadata.shopAvailable &&
    !shopAvailableEvents.some((event) => event.uid === uid)
  ) {
    shopAvailableEvents.push({
      uid,
      name: eventMetadata.name,
      since: eventMetadata.since,
      until: eventMetadata.until,
      isSpoiler: eventMetadata.isSpoiler,
    });
    shopAvailableEvents.sort((a, b) => compareInstantAsc(a.since, b.since));
  }
  return { eventMetadata, shopAvailableEvents };
};

export default function EventPage() {
  const { uid } = useParams();
  const { pathname } = useLocation();
  const { eventMetadata, shopAvailableEvents } = useLoaderData<typeof loader>();
  const isLive = eventMetadata.contentType === "live";
  const showEventSelector = pathname === `/events/${uid}/shop` && shopAvailableEvents.length > 1;
  const overviewScreen = {
    text: "개요",
    description: isLive
      ? "방송 영상과 공개된 정보, 선생님들의 의견을 확인해보세요"
      : "모집 학생 정보와 선생님들의 의견을 확인해보세요",
    Icon: InformationCircleIcon,
    link: `/events/${uid}`,
    active: pathname === `/events/${uid}`,
  };
  return (
    <Page
      title={isLive ? "공식 방송" : "이벤트 정보"}
      description={eventMetadata.name}
      backward={isLive ? { title: "미래시", to: "/futures" } : { title: "이벤트", to: "/events" }}
      panels={
        showEventSelector
          ? [
              {
                title: "이벤트 선택",
                description: "상점 계산기를 사용할 이벤트 선택",
                Icon: ListBulletIcon,
                children: <PanelEventSelector events={shopAvailableEvents} currentEventUid={uid ?? ""} />,
              },
            ]
          : undefined
      }
      screens={
        isLive
          ? [overviewScreen]
          : [
              overviewScreen,
              {
                text: "상점 계산기",
                description: eventMetadata.shopAvailable
                  ? "상점 아이템 구매에 필요한 AP를 계산할 수 있어요"
                  : "상점이 없는 이벤트이거나 정보를 준비중이에요",
                Icon: ShoppingCartIcon,
                link: `/events/${uid}/shop`,
                active: pathname === `/events/${uid}/shop`,
                disabled: !eventMetadata.shopAvailable,
              },
              {
                text: "모집 시뮬레이션",
                description: eventMetadata.recruitmentGroupUid
                  ? "픽업/모집 결과를 시뮬레이션 해보세요"
                  : "모집 정보가 없는 이벤트예요",
                Icon: SparklesIcon,
                link: `/events/${uid}/recruitment-simulator`,
                active: pathname === `/events/${uid}/recruitment-simulator`,
                disabled: !eventMetadata.recruitmentGroupUid,
              },
            ]
      }
    >
      <Outlet />
    </Page>
  );
}
