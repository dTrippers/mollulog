import {
  InformationCircleIcon,
  MapIcon,
  RectangleStackIcon,
  ShoppingCartIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import {
  type LoaderFunctionArgs,
  Outlet,
  type ShouldRevalidateFunction,
  redirect,
  useLoaderData,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
  useRevalidator,
} from "react-router";
import { PageHeader, PageNotice, PageToolbar, ScreenTabs, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { calendarDayDifference } from "~/domain/home-portal";
import { compareInstantAsc, formatInstant, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { isEventShopStateSubmission } from "~/lib/revalidation";
import { cardFlipLocale, jankenLocale, roadPuzzleLocale, treasureHuntLocale } from "~/locales/ko";
import { getEventMetadata, getEventMinigameType, getShopAvailableEvents } from "~/models/event-content";
import { getEventShopAvailability } from "./events.$uid._components/event-shop-availability";
import { useFutureDetailReturn } from "./futures._components/use-futures-navigation";

// Only the shop page shows the event selector, so the loader reads the shop events for that page alone.
function isShopPath(pathname: string) {
  return pathname.endsWith("/shop");
}

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) throw new Response("Not Found", { status: 404 });
  const { env, ctx } = context.cloudflare;
  const url = new URL(request.url);

  let eventMetadata: Awaited<ReturnType<typeof getEventMetadata>>;
  try {
    eventMetadata = await getEventMetadata(env, uid, ctx);
  } catch {
    return { status: "unavailable" as const };
  }
  if (!eventMetadata) throw new Response("Not Found", { status: 404 });

  if (eventMetadata.contentType === "live") {
    return redirect(`/lives/${uid}${url.search}`, { status: 301 });
  }

  let minigameType: Awaited<ReturnType<typeof getEventMinigameType>> = null;
  let minigameUnavailable = false;
  try {
    minigameType = await getEventMinigameType(env, eventMetadata);
  } catch {
    minigameUnavailable = true;
  }

  const shopAvailability = await getEventShopAvailability(env, eventMetadata);
  const shopEventsRequested = isShopPath(url.pathname);
  let shopAvailableEvents: Awaited<ReturnType<typeof getShopAvailableEvents>> = [];
  let shopEventsUnavailable = false;
  if (shopEventsRequested) {
    try {
      shopAvailableEvents = await getShopAvailableEvents(env, ctx);
      if (eventMetadata.shopAvailable && !shopAvailableEvents.some((event) => event.uid === uid)) {
        shopAvailableEvents.push({
          uid,
          name: eventMetadata.name,
          since: eventMetadata.since,
          until: eventMetadata.until,
          isSpoiler: eventMetadata.isSpoiler,
        });
        shopAvailableEvents.sort((a, b) => compareInstantAsc(a.since, b.since));
      }
    } catch {
      shopEventsUnavailable = true;
    }
  }

  return {
    status: "ready" as const,
    eventMetadata,
    minigameType,
    minigameUnavailable,
    shopAvailability,
    shopAvailableEvents,
    shopEventsUnavailable,
  };
};

// Moving to or from the shop tab keeps this layout mounted, so the loader must run again to load or drop the selector's
// events. Shop state submissions never change the event metadata this loader reads.
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isEventShopStateSubmission(args) &&
  (isShopPath(args.currentUrl.pathname) !== isShopPath(args.nextUrl.pathname) || args.defaultShouldRevalidate);

type DetailHandle = { v2HeaderTitleHidden?: boolean };

type EventDetailTabKey = "overview" | "shop" | "simulator" | "card-flip" | "treasure-hunt" | "road-puzzle" | "janken";

export function getActiveEventDetailTab(pathname: string, uid: string): EventDetailTabKey | null {
  if (pathname === `/events/${uid}`) return "overview";
  if (pathname === `/events/${uid}/shop`) return "shop";
  if (pathname === `/events/${uid}/recruitment-simulator`) return "simulator";
  if (pathname === `/events/${uid}/shop/card-flip`) return "card-flip";
  if (pathname === `/events/${uid}/treasure-hunt`) return "treasure-hunt";
  if (pathname === `/events/${uid}/road-puzzle`) return "road-puzzle";
  if (pathname === `/events/${uid}/shop/janken`) return "janken";
  return null;
}

function headerMeta(metadata: NonNullable<Awaited<ReturnType<typeof getEventMetadata>>>, timeZone: string) {
  const now = nowUtcIso();
  const parts = ["이벤트"];
  if (metadata.runType === "rerun") parts.push("복각");
  if (metadata.runType === "permanent") parts.push("상설");
  const period = `${formatInstant(metadata.since, { timeZone, format: "MM/DD" })} ~ ${metadata.until ? formatInstant(metadata.until, { timeZone, format: "MM/DD" }) : "—"}`;
  if (metadata.until && !isInstantAfter(metadata.until, now)) {
    parts.push(period, "종료");
  } else if (isInstantAfter(metadata.since, now)) {
    const days = Math.max(1, calendarDayDifference(now, metadata.since, timeZone));
    parts.push(period, `${days}일 후 시작`);
  } else if (metadata.until) {
    const days = Math.max(1, calendarDayDifference(now, metadata.until, timeZone));
    parts.push(period, `${days}일 남음`);
  } else {
    parts.push(period);
  }
  return parts.join(" · ");
}

export default function EventPage() {
  const loaderData = useLoaderData<typeof loader>();
  const matches = useMatches();
  const { uid } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const timeZone = useDisplayTimeZone();
  const { navigationState, verifiedFutureReturn, returnToFutures } = useFutureDetailReturn(
    uid,
    location.state,
    (delta) => navigate(delta),
  );

  if (loaderData.status === "unavailable") {
    return (
      <V2Page width="reading">
        <PageHeader title="이벤트 정보" />
        <StatusNotice
          tone="danger"
          action={
            <Button size="sm" onClick={() => revalidator.revalidate()}>
              다시 시도
            </Button>
          }
        >
          정보를 불러오지 못했어요.
        </StatusNotice>
      </V2Page>
    );
  }

  const { eventMetadata, minigameType, minigameUnavailable, shopAvailability } = loaderData;
  const pathname = location.pathname;
  const activeTab = getActiveEventDetailTab(pathname, uid ?? "");
  const headerTitleHidden = matches.some((match) => (match.handle as DetailHandle | undefined)?.v2HeaderTitleHidden);
  const futureLinkState = navigationState ? location.state : undefined;
  const back = verifiedFutureReturn
    ? { title: "미래시", onClick: returnToFutures }
    : { title: "이벤트", to: "/events" };
  const tabs = [
    {
      key: "overview",
      text: "개요",
      Icon: InformationCircleIcon,
      link: `/events/${uid}`,
      active: activeTab === "overview",
      linkState: futureLinkState,
    },
    {
      key: "shop",
      text: "상점 계산기",
      Icon: ShoppingCartIcon,
      link: `/events/${uid}/shop`,
      active: activeTab === "shop",
      disabled: shopAvailability === "no-data" || shopAvailability === "unavailable",
      disabledReason:
        shopAvailability === "unavailable" ? "정보를 불러오지 못했어요" : "상점이 없거나 정보를 준비 중이에요",
      linkState: futureLinkState,
    },
    {
      key: "simulator",
      text: "모집 시뮬레이션",
      Icon: SparklesIcon,
      link: `/events/${uid}/recruitment-simulator`,
      active: activeTab === "simulator",
      disabled: !eventMetadata.recruitmentGroupUid,
      disabledReason: "모집 정보가 없어요",
      linkState: futureLinkState,
    },
    ...(minigameType === "card_flip"
      ? [
          {
            key: "card-flip",
            text: cardFlipLocale.menuTitle,
            Icon: RectangleStackIcon,
            link: `/events/${uid}/shop/card-flip`,
            active: activeTab === "card-flip",
            disabled: shopAvailability === "no-data" || shopAvailability === "unavailable",
            disabledReason:
              shopAvailability === "unavailable" ? "정보를 불러오지 못했어요" : "상점이 없거나 정보를 준비 중이에요",
            linkState: futureLinkState,
          },
        ]
      : []),
    ...(minigameType === "janken"
      ? [
          {
            key: "janken",
            text: jankenLocale.menuTitle,
            Icon: RectangleStackIcon,
            link: `/events/${uid}/shop/janken`,
            active: activeTab === "janken",
            disabled: shopAvailability === "no-data" || shopAvailability === "unavailable",
            disabledReason:
              shopAvailability === "unavailable" ? "정보를 불러오지 못했어요" : "상점이 없거나 정보를 준비 중이에요",
            linkState: futureLinkState,
          },
        ]
      : []),
    ...(minigameType === "treasure_hunt"
      ? [
          {
            key: "treasure-hunt",
            text: treasureHuntLocale.simulatorTitle,
            Icon: Squares2X2Icon,
            link: `/events/${uid}/treasure-hunt`,
            active: activeTab === "treasure-hunt",
            linkState: futureLinkState,
          },
        ]
      : []),
    ...(minigameType === "road_puzzle"
      ? [
          {
            key: "road-puzzle",
            text: roadPuzzleLocale.menuTitle,
            Icon: MapIcon,
            link: `/events/${uid}/road-puzzle`,
            active: activeTab === "road-puzzle",
            linkState: futureLinkState,
          },
        ]
      : []),
  ];
  const statusMessage = shopAvailability === "unavailable" || loaderData.shopEventsUnavailable || minigameUnavailable;

  return (
    // Every tab uses the same width and a full-width toolbar row, so switching tabs never moves the tabs or the content.
    <V2Page width="wide" toolbarSpan="full">
      <PageHeader
        title={eventMetadata.name}
        meta={headerMeta(eventMetadata, timeZone)}
        back={back}
        titleHidden={headerTitleHidden}
      />
      <PageToolbar>
        <ScreenTabs items={tabs} />
      </PageToolbar>
      {statusMessage ? (
        <PageNotice>
          <StatusNotice
            tone="danger"
            action={
              <Button size="sm" onClick={() => revalidator.revalidate()}>
                다시 시도
              </Button>
            }
          >
            정보를 불러오지 못했어요.
          </StatusNotice>
        </PageNotice>
      ) : null}
      <Outlet />
    </V2Page>
  );
}
