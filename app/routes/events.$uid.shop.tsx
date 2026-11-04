import { type LoaderFunctionArgs, type MetaFunction, redirect, type ShouldRevalidateFunction } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { calculateShopPurchaseDays } from "~/domain/event-shop/calculations";
import { getJankenStudentGrowthUid } from "~/domain/event-shop/janken";
import { buildEventShopStateIdentity, type SavedShopStateSource } from "~/domain/event-shop-state-key";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { isEventShopPlanSaveSubmission } from "~/lib/revalidation";
import { getEventContentSchedule, getEventMetadata, getEventShopContentForMetadata } from "~/models/event-content";
import { type EventShopState, getEventShopState } from "~/models/event-shop-state";
import { getPlannerState } from "~/models/planner-state";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { getTimelineContentDatesByContentUid } from "~/models/timeline-content.server";
import { getEventShopOwnedQuantities } from "~/views/event-shop-owned-quantities";
import EventShopController from "./events.$uid._components/EventShopController";
import { getEventShopAvailability } from "./events.$uid._components/event-shop-availability";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const eventUid = params.uid;
  if (!eventUid) throw new Response("Not Found", { status: 404 });
  const { env, ctx } = context.cloudflare;
  let metadata: Awaited<ReturnType<typeof getEventMetadata>>;
  try {
    metadata = await getEventMetadata(env, eventUid, ctx);
  } catch {
    return { status: "unavailable" as const, eventName: "이벤트" };
  }
  if (!metadata) throw new Response("Not Found", { status: 404 });
  if (metadata.contentType === "live")
    return redirect(`/lives/${eventUid}${new URL(request.url).search}`, { status: 301 });
  const logger = getLogger(env, ctx, { route: "events.$uid.shop.loader", contentUid: eventUid });

  const availability = await getEventShopAvailability(env, metadata);
  if (availability !== "ready") {
    return { status: availability, eventName: metadata.name };
  }

  try {
    const [shopContent, shopSchedule, canonicalShopDates, currentUser] = await Promise.all([
      getEventShopContentForMetadata(env, metadata),
      metadata.shopContentUid ? getEventContentSchedule(env, metadata.shopContentUid, metadata.runType) : null,
      metadata.shopContentUid ? getTimelineContentDatesByContentUid(env, metadata.shopContentUid, { ctx }) : null,
      getActiveSensei(env, request),
    ]);
    if (!shopContent || shopContent.shopResources.length === 0) {
      return { status: "no-data" as const, eventName: metadata.name };
    }

    const janken = shopContent.minigameConfig?.minigameType === "janken" ? shopContent.minigameConfig.janken : null;
    const jankenStudentGrowthUid =
      janken?.status === "available"
        ? getJankenStudentGrowthUid(
            janken,
            (await getAllStudents(env, true)).map(({ uid }) => uid),
          )
        : null;

    const shopSince = shopSchedule?.startAt ?? canonicalShopDates?.startAt ?? metadata.since;
    const shopUntil = shopSchedule?.endAt ?? canonicalShopDates?.endAt ?? metadata.until;
    const stateIdentity = buildEventShopStateIdentity({
      timelineUid: eventUid,
      shopContentUid: metadata.shopContentUid,
    });
    let recruitedStudentUids: string[] = [];
    let ownedQuantities: Record<string, number> | null = null;
    let savedShopState: EventShopState | null = null;
    let savedShopStateSource: SavedShopStateSource = "none";
    let savedJankenEntry: JankenPlannerEntry | null = null;
    if (currentUser) {
      const plannerStatePromise =
        shopContent.minigameConfig?.minigameType === "janken"
          ? getPlannerState(env, currentUser.id, { ctx })
          : Promise.resolve(null);
      const [recruitedStudents, userOwnedQuantities, primaryShopState, plannerState] = await Promise.all([
        getRecruitedStudents(env, currentUser.id),
        getEventShopOwnedQuantities(env, currentUser.id, shopContent.shopResources),
        getEventShopState(env, currentUser.id, stateIdentity.shopStateUid),
        plannerStatePromise,
      ]);
      recruitedStudentUids = recruitedStudents.map((student) => student.studentUid);
      ownedQuantities = userOwnedQuantities;
      savedShopState = primaryShopState;
      savedJankenEntry = plannerState?.jankenProgress[stateIdentity.shopStateUid] ?? null;
      if (savedShopState) savedShopStateSource = "primary";
      else if (stateIdentity.fallbackStateUid) {
        savedShopState = await getEventShopState(env, currentUser.id, stateIdentity.fallbackStateUid);
        savedShopStateSource = savedShopState ? "fallback" : "none";
      }
    }
    return {
      status: "ready" as const,
      eventName: metadata.name,
      stages: shopContent.stages,
      shopResources: shopContent.shopResources,
      ownedQuantities,
      eventRewardBonus: shopContent.eventRewardBonus,
      minigameConfig: shopContent.minigameConfig ?? null,
      jankenStudentGrowthUid,
      recruitedStudentUids,
      savedShopState,
      savedJankenEntry,
      savedShopStateSource,
      availablePurchaseDays: calculateShopPurchaseDays(shopSince, shopUntil),
      eventUid,
      shopStateUid: stateIdentity.shopStateUid,
      signedIn: currentUser !== null,
    };
  } catch (error) {
    logger.error("Failed to load event shop plan", error, { operation: "shop-plan" });
    captureServerError(error, { route: "events.$uid.shop.loader", operation: "shop-plan", contentUid: eventUid });
    return { status: "unavailable" as const, eventName: metadata.name };
  }
};

// The plan autosave only stores the state already on screen and reads its result from the fetcher, so reloading the
// shop data after every save is unnecessary. Owned quantity updates still reload it.
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isEventShopPlanSaveSubmission(args) && args.defaultShouldRevalidate;

export const meta: MetaFunction<typeof loader> = ({ data, params }) => {
  const title = `${data?.eventName ?? "이벤트"} - 상점 계산기`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "og:title", content: title },
    { name: "og:url", content: `https://mollulog.net/events/${params.uid}/shop` },
  ];
};

export default function EventShop() {
  return <EventShopController />;
}
