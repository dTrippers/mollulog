import {
  InformationCircleIcon,
  ListBulletIcon,
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
  useNavigate,
  useParams,
} from "react-router";
import { PanelEventSelector } from "~/components/features/events";
import { Page } from "~/components/features/layout";
import { compareInstantAsc } from "~/lib/date-time";
import { isEventShopStateSubmission } from "~/lib/revalidation";
import { cardFlipLocale, roadPuzzleLocale, treasureHuntLocale } from "~/locales/ko";
import {
  getEventMetadata,
  getEventMinigameType,
  getShopAvailableEvents,
  type ShopAvailableEvent,
} from "~/models/event-content";
import { useFutureDetailReturn } from "./futures._components/use-futures-navigation";

// Only the shop page shows the event selector, so the loader reads the shop events for that page alone.
function isShopPath(pathname: string) {
  return pathname.endsWith("/shop");
}

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const eventMetadata = await getEventMetadata(publicReadEnv, uid, ctx);
  if (!eventMetadata) {
    throw new Response("Not Found", { status: 404 });
  }
  const pathname = new URL(request.url).pathname;
  if (eventMetadata.contentType === "live" && pathname !== `/events/${uid}`) {
    return redirect(`/events/${uid}`);
  }
  const isShopPage = isShopPath(pathname);
  const [minigameType, shopAvailableEvents] = await Promise.all([
    eventMetadata.contentType === "live" ? null : getEventMinigameType(publicReadEnv, eventMetadata),
    isShopPage ? getShopAvailableEvents(publicReadEnv, ctx) : ([] as ShopAvailableEvent[]),
  ]);
  if (
    isShopPage &&
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
  return { eventMetadata, minigameType, shopAvailableEvents };
};

// Moving to or from the shop tab keeps this layout mounted, so the loader must run again to load or drop the selector's
// events. Shop state submissions never change the event metadata this loader reads.
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isEventShopStateSubmission(args) &&
  (isShopPath(args.currentUrl.pathname) !== isShopPath(args.nextUrl.pathname) || args.defaultShouldRevalidate);

export default function EventPage() {
  const navigate = useNavigate();
  const { uid } = useParams();
  const location = useLocation();
  const { pathname } = location;
  const { eventMetadata, minigameType, shopAvailableEvents } = useLoaderData<typeof loader>();
  const isLive = eventMetadata.contentType === "live";
  const showEventSelector = pathname === `/events/${uid}/shop` && shopAvailableEvents.length > 1;
  const { navigationState, verifiedFutureReturn, returnToFutures } = useFutureDetailReturn(
    uid,
    location.state,
    (delta) => navigate(delta),
  );
  const futureLinkState = navigationState ? location.state : undefined;
  const backward = verifiedFutureReturn
    ? {
        title: "미래시",
        to: "/futures",
        onClick: returnToFutures,
      }
    : isLive
      ? { title: "미래시", to: "/futures" }
      : { title: "이벤트", to: "/events" };
  const overviewScreen = {
    text: "개요",
    description: isLive
      ? "방송 영상과 공개된 정보, 선생님들의 의견을 확인해보세요"
      : "모집 학생 정보와 선생님들의 의견을 확인해보세요",
    Icon: InformationCircleIcon,
    link: `/events/${uid}`,
    active: pathname === `/events/${uid}`,
    linkState: futureLinkState,
  };
  return (
    <Page
      title={isLive ? "공식 방송" : "이벤트 정보"}
      description={eventMetadata.name}
      enableContentViewTransition
      backward={backward}
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
                linkState: futureLinkState,
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
                linkState: futureLinkState,
              },
              ...(minigameType === "card_flip"
                ? [
                    {
                      text: cardFlipLocale.menuTitle,
                      description: eventMetadata.shopAvailable
                        ? cardFlipLocale.menuDescription
                        : "상점이 없는 이벤트이거나 정보를 준비중이에요",
                      Icon: RectangleStackIcon,
                      link: `/events/${uid}/shop/card-flip`,
                      active: pathname === `/events/${uid}/shop/card-flip`,
                      disabled: !eventMetadata.shopAvailable,
                      linkState: futureLinkState,
                    },
                  ]
                : []),
              ...(minigameType === "treasure_hunt"
                ? [
                    {
                      text: treasureHuntLocale.simulatorTitle,
                      description: treasureHuntLocale.simulatorDescription,
                      Icon: Squares2X2Icon,
                      link: `/events/${uid}/treasure-hunt`,
                      active: pathname === `/events/${uid}/treasure-hunt`,
                      linkState: futureLinkState,
                    },
                  ]
                : []),
              ...(minigameType === "road_puzzle"
                ? [
                    {
                      text: roadPuzzleLocale.menuTitle,
                      description: roadPuzzleLocale.menuDescription,
                      Icon: MapIcon,
                      link: `/events/${uid}/road-puzzle`,
                      active: pathname === `/events/${uid}/road-puzzle`,
                      linkState: futureLinkState,
                    },
                  ]
                : []),
            ]
      }
    >
      <Outlet />
    </Page>
  );
}
