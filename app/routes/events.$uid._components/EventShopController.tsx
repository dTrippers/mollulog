import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { Link, Outlet, useLoaderData, useMatches, useParams, useRevalidator, useRouteLoaderData } from "react-router";
import { PageMain, useV2Page } from "~/components/v2/layout";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { SaveToast } from "~/components/v2/primitives/SaveToast";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { guestPlannerEventShopPlans } from "~/domain/guest-planner";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import { useEventShopPlan } from "~/lib/event-shop/useEventShopPlan";
import { nowUtcIso } from "~/lib/date-time";
import { type GuestPlannerSnapshot, readGuestPlanner, subscribeGuestPlanner } from "~/lib/guest-planner.client";
import type { ShopAvailableEvent } from "~/models/event-content";
import type { loader } from "../events.$uid.shop";
import { CloudSlashIcon } from "./CloudSlashIcon";
import { EventShopPicker } from "./shop/EventShopPicker";
import { ShopReportDialog } from "./shop/ShopResultPanel";
import { useJankenPlannerPersistence } from "./useJankenPlannerPersistence";

export default function EventShopController() {
  const data = useLoaderData<typeof loader>();
  const [guestSnapshot, setGuestSnapshot] = useState<GuestPlannerSnapshot | null>(null);
  useEffect(() => {
    if (data.status !== "ready" || data.signedIn) return;
    const refresh = () => setGuestSnapshot(readGuestPlanner());
    refresh();
    return subscribeGuestPlanner(refresh);
  }, [data]);

  if (data.status !== "ready") {
    return <EventShopUnavailable status={data.status} eventName={data.eventName} />;
  }

  if (!data.signedIn && !guestSnapshot) {
    return (
      <PageMain>
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">상점 계획을 불러오는 중</span>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageMain>
    );
  }

  const guestEnvelope =
    guestSnapshot?.status === "ready" || guestSnapshot?.status === "memory" || guestSnapshot?.status === "conflict"
      ? guestSnapshot.envelope
      : null;
  const guestPlan = guestEnvelope
    ? guestPlannerEventShopPlans(guestEnvelope).find((plan) => plan.shopStateUid === data.shopStateUid)
    : undefined;
  const savedShopState = data.signedIn ? data.savedShopState : (guestPlan?.state ?? null);
  const savedJankenEntry: JankenPlannerEntry | null = data.signedIn
    ? data.savedJankenEntry
    : (guestEnvelope?.document.jankenProgress[data.shopStateUid] ?? null);
  const guestPlannerStatus = data.signedIn ? "none" : (guestSnapshot?.status ?? "unavailable");
  return (
    <ReadyEventShopController
      data={data}
      savedShopState={savedShopState}
      savedJankenEntry={savedJankenEntry}
      guestPlannerStatus={guestPlannerStatus}
    />
  );
}

type ReadyEventShopData = Extract<Awaited<ReturnType<typeof loader>>, { status: "ready" }>;

function ReadyEventShopController({
  data,
  savedShopState,
  savedJankenEntry,
  guestPlannerStatus,
}: {
  data: ReadyEventShopData;
  savedShopState: ReadyEventShopData["savedShopState"];
  savedJankenEntry: JankenPlannerEntry | null;
  guestPlannerStatus: "ready" | "memory" | "conflict" | "corrupt" | "unavailable" | "loading" | "none";
}) {
  const jankenPersistence = useJankenPlannerPersistence({
    shopStateUid: data.shopStateUid,
    signedIn: data.signedIn,
    defaultProgress: data.jankenDefaultProgress,
    savedEntry: savedJankenEntry,
  });
  const controller = useEventShopPlan({
    stages: data.stages,
    shopResources: data.shopResources,
    ownedQuantities: data.ownedQuantities,
    eventRewardBonus: data.eventRewardBonus,
    recruitedStudentUids: data.recruitedStudentUids,
    eventUid: data.eventUid,
    shopStateUid: data.shopStateUid,
    savedShopState,
    savedShopStateSource: data.savedShopStateSource,
    availablePurchaseDays: data.availablePurchaseDays,
    signedIn: data.signedIn,
    guestPlannerStatus,
    minigameConfig: data.minigameConfig,
    jankenStudentGrowthUid: data.jankenStudentGrowthUid,
    jankenEntry: jankenPersistence.entry,
    savedJankenEntry: jankenPersistence.savedEntry,
    setJankenEntry: jankenPersistence.setEntry,
    jankenDefaultProgress: data.jankenDefaultProgress,
    jankenPersistence: jankenPersistence.persistence,
  });
  const { stacked } = useV2Page();
  const plan = controller.plan;
  return (
    <>
      <Outlet context={plan} />
      <SaveToast
        saving={!!plan.isSaving || jankenPersistence.persistence.isSaving}
        failed={!!plan.saveError || !!jankenPersistence.persistence.saveError}
        onRetry={() => {
          if (plan.saveError) plan.retrySave?.();
          if (jankenPersistence.persistence.saveError) jankenPersistence.persistence.retrySave();
        }}
        aboveActionBar={stacked}
      />
    </>
  );
}

type EventRouteData = { status: "ready"; shopAvailableEvents: ShopAvailableEvent[] } | { status: string };

// The shop cannot be planned. The card replaces the whole main area; the tabs and header stay.
function EventShopUnavailable({
  status,
  eventName,
}: {
  status: "ended" | "no-data" | "unavailable";
  eventName: string;
}) {
  const { uid } = useParams();
  const revalidator = useRevalidator();
  const matches = useMatches();
  const signedIn = !!(useRouteLoaderData("root") as { currentUsername?: string | null } | undefined)?.currentUsername;
  const [reportOpen, setReportOpen] = useState(false);
  const eventRouteData = matches.find((match) => match.id === "routes/events.$uid")?.data as EventRouteData | undefined;
  const events = eventRouteData && "shopAvailableEvents" in eventRouteData ? eventRouteData.shopAvailableEvents : [];
  const eventUid = uid ?? "";
  const picker =
    events.length > 1 ? (
      <EventShopPicker
        events={events}
        currentEventUid={eventUid}
        variant={status === "ended" ? "primary" : "secondary"}
      />
    ) : null;

  if (status === "unavailable") {
    return (
      <PageMain>
        <div
          role="alert"
          className="flex flex-col items-center rounded-lg border border-v2-divider px-6 py-12 text-center"
        >
          <CloudSlashIcon className="size-7 text-v2-fg-tertiary" />
          <p className="mt-3 text-base font-semibold text-v2-fg">상점 정보를 불러오지 못했어요</p>
          <p className="mt-1.5 text-[0.8125rem] text-v2-fg-tertiary">계획은 그대로 저장돼 있어요</p>
          <Button className="mt-4" onClick={() => revalidator.revalidate()}>
            <ArrowPathIcon className="size-4" aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <section aria-labelledby="shop-unavailable-title" className="rounded-lg bg-v2-surface p-7">
        <h2 id="shop-unavailable-title" className="text-lg font-semibold text-v2-fg">
          {status === "ended" ? "종료된 이벤트예요" : "상점 정보가 아직 없어요"}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {picker}
          {status === "ended" ? (
            <Link to={`/events/${eventUid}`} className={v2ButtonClassName({ size: "sm" })}>
              개요 보기
            </Link>
          ) : signedIn ? (
            <>
              <Button size="sm" onClick={() => setReportOpen(true)}>
                오류 제보
              </Button>
              <ShopReportDialog
                open={reportOpen}
                onClose={() => setReportOpen(false)}
                eventName={eventName}
                eventUid={eventUid}
                buildPayload={() => ({ timestamp: nowUtcIso(), eventUid, status })}
              />
            </>
          ) : null}
        </div>
      </section>
    </PageMain>
  );
}
