import { InformationCircleIcon, ListBulletIcon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import { type LoaderFunctionArgs, Outlet, useLoaderData, useLocation, useParams } from "react-router";
import { EventSelector } from "~/components/features/events";
import { Page } from "~/components/features/layout";
import { compareInstantAsc } from "~/lib/date-time";
import { getEventContentSchedule, getEventMetadata, getShopAvailableEvents } from "~/models/event-content";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = context.cloudflare;
  const eventMetadata = await getEventMetadata(env, uid);
  if (!eventMetadata) {
    throw new Response("Not Found", { status: 404 });
  }
  const pathname = new URL(request.url).pathname;
  const shopAvailableEvents = pathname.endsWith("/shop") ? await getShopAvailableEvents(env) : [];
  if (
    pathname.endsWith("/shop") &&
    eventMetadata.shopAvailable &&
    !shopAvailableEvents.some((event) => event.uid === uid)
  ) {
    const shopSchedule = eventMetadata.shopContentUid
      ? await getEventContentSchedule(env, eventMetadata.shopContentUid, eventMetadata.runType)
      : null;
    shopAvailableEvents.push({
      uid,
      name: eventMetadata.name,
      since: shopSchedule?.startAt ?? eventMetadata.since,
      until: shopSchedule?.endAt ?? eventMetadata.until,
    });
    shopAvailableEvents.sort((a, b) => compareInstantAsc(a.since, b.since));
  }
  return { eventMetadata, shopAvailableEvents };
};

export default function EventPage() {
  const { uid } = useParams();
  const { pathname } = useLocation();
  const { eventMetadata, shopAvailableEvents } = useLoaderData<typeof loader>();
  const showEventSelector = pathname === `/events/${uid}/shop` && shopAvailableEvents.length > 1;
  return (
    <Page
      title="이벤트 정보"
      description={eventMetadata.name}
      backward={{ title: "미래시", to: "/futures" }}
      panels={
        showEventSelector
          ? [
              {
                title: "이벤트 선택",
                description: "상점 계산기를 사용할 이벤트 선택",
                Icon: ListBulletIcon,
                children: <EventSelector events={shopAvailableEvents} currentEventUid={uid ?? ""} />,
              },
            ]
          : undefined
      }
      screens={[
        {
          text: "개요",
          description: "모집 학생 정보와 선생님들의 의견을 확인해보세요",
          Icon: InformationCircleIcon,
          link: `/events/${uid}`,
          active: pathname === `/events/${uid}`,
        },
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
      ]}
    >
      <Outlet />
    </Page>
  );
}
