import { ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
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
import { compareInstantAsc } from "~/lib/date-time";
import { isEventShopStateSubmission } from "~/lib/revalidation";
import { getEventMetadata, getEventMinigameType, getShopAvailableEvents } from "~/models/event-content";
import { CloudSlashIcon } from "./events.$uid._components/CloudSlashIcon";
import { getEventShopAvailability } from "./events.$uid._components/event-shop-availability";
import {
  buildEventScreens,
  describeEventPeriod,
  type EventLayoutContext,
  getActiveEventDetailTab,
} from "./events.$uid._components/event-screens";
import { useFutureDetailReturn } from "./futures._components/use-futures-navigation";

export { getActiveEventDetailTab } from "./events.$uid._components/event-screens";

// The shop and the overview show the event selector, so the loader reads the shop events for those pages alone.
function hasEventSelector(pathname: string, uid: string) {
  return pathname === `/events/${uid}/shop` || pathname === `/events/${uid}`;
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
  const shopEventsRequested = hasEventSelector(url.pathname, uid);
  const overviewRequested = url.pathname === `/events/${uid}`;
  let shopAvailableEvents: Awaited<ReturnType<typeof getShopAvailableEvents>> = [];
  let shopEventsUnavailable = false;
  if (shopEventsRequested) {
    try {
      shopAvailableEvents = await getShopAvailableEvents(env, ctx);
      // The overview selector always lists the current event, with or without a shop.
      if (
        (eventMetadata.shopAvailable || overviewRequested) &&
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

// Moving between a page with the selector and one without keeps this layout mounted, so the loader must run again to
// load or drop the selector's events. Shop state submissions never change the event metadata this loader reads.
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isEventShopStateSubmission(args) &&
  (hasEventSelector(args.currentUrl.pathname, args.currentParams.uid ?? "") !==
    hasEventSelector(args.nextUrl.pathname, args.nextParams.uid ?? "") ||
    args.defaultShouldRevalidate);

type DetailHandle = { v2HeaderTitleHidden?: boolean };

// Run type as a pill, the period, then the status. A running event gets a live dot.
function headerMeta(metadata: NonNullable<Awaited<ReturnType<typeof getEventMetadata>>>, timeZone: string) {
  const { runType, period, status } = describeEventPeriod(metadata, timeZone);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
      {runType ? (
        <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-v2-inset px-2 text-xs font-semibold text-v2-fg-secondary">
          {runType}
        </span>
      ) : null}
      <span>{period}</span>
      <span className="text-v2-fg-disabled" aria-hidden="true">
        ·
      </span>
      {status.kind === "ended" ? (
        <span className="text-v2-fg-disabled">{status.text}</span>
      ) : status.kind === "ongoing" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-[7px] shrink-0 rounded-full bg-v2-success" aria-hidden="true" />
          {status.text}
        </span>
      ) : (
        status.text
      )}
    </span>
  );
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
      <V2Page width="wide">
        <PageHeader title="이벤트 정보" titleHidden back={{ title: "이벤트", to: "/events" }} />
        <div role="alert" className="flex flex-col items-center gap-2.5 px-6 py-16 text-center">
          <CloudSlashIcon className="size-7 text-v2-fg-tertiary" />
          <p className="text-base font-semibold text-v2-fg">이벤트 정보를 불러오지 못했어요</p>
          <p className="text-sm text-v2-fg-tertiary">잠시 뒤 다시 시도해 주세요</p>
          <Button className="mt-1" onClick={() => revalidator.revalidate()}>
            <ArrowPathIcon className="size-4" aria-hidden="true" />
            다시 시도
          </Button>
        </div>
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
  const tabs = buildEventScreens({
    uid: uid ?? "",
    recruitmentGroupUid: eventMetadata.recruitmentGroupUid,
    minigameType,
    shopAvailability,
    activeTab,
    linkState: futureLinkState,
  });
  // A failed minigame lookup hides that tab, so the notice names it; other partial failures keep the generic notice.
  const statusMessage = minigameUnavailable
    ? "미니게임 정보를 불러오지 못해서 미니게임 탭을 보여주지 못했어요"
    : shopAvailability === "unavailable" || loaderData.shopEventsUnavailable
      ? "정보를 불러오지 못했어요."
      : null;

  return (
    // Every tab uses the same width and a full-width toolbar row, so switching tabs never moves the tabs or the content.
    <V2Page width="wide" toolbarSpan="full">
      <PageHeader
        title={eventMetadata.name}
        meta={headerMeta(eventMetadata, timeZone)}
        back={back}
        titleHidden={headerTitleHidden}
      />
      {/* The overview lists the other screens in its aside instead of the tabs. */}
      {activeTab === "overview" ? null : (
        <PageToolbar>
          <ScreenTabs items={tabs} />
        </PageToolbar>
      )}
      {statusMessage ? (
        <PageNotice>
          <StatusNotice
            tone="danger"
            boxed
            Icon={ExclamationTriangleIcon}
            className="items-center"
            action={
              <Button size="sm" onClick={() => revalidator.revalidate()}>
                <ArrowPathIcon className="size-4" aria-hidden="true" />
                다시 시도
              </Button>
            }
          >
            {statusMessage}
          </StatusNotice>
        </PageNotice>
      ) : null}
      <Outlet
        context={
          {
            screens: tabs,
            events: loaderData.shopAvailableEvents,
            period: describeEventPeriod(eventMetadata, timeZone),
          } satisfies EventLayoutContext
        }
      />
    </V2Page>
  );
}
