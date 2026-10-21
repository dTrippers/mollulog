import { useEffect, useState } from "react";
import type { loader } from "../events.$uid.shop";
import { Outlet, useLoaderData, useRevalidator } from "react-router";
import { guestPlannerEventShopPlans } from "~/domain/guest-planner";
import { readGuestPlanner, subscribeGuestPlanner, type GuestPlannerSnapshot } from "~/lib/guest-planner.client";
import { useEventShopPlan } from "~/lib/event-shop/useEventShopPlan";
import { PageMain } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

export default function EventShopController() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [guestSnapshot, setGuestSnapshot] = useState<GuestPlannerSnapshot | null>(null);
  useEffect(() => {
    if (data.status !== "ready" || data.signedIn) return;
    const refresh = () => setGuestSnapshot(readGuestPlanner());
    refresh();
    return subscribeGuestPlanner(refresh);
  }, [data]);

  if (data.status !== "ready") {
    const message = data.status === "ended"
      ? "종료된 이벤트라 상점 계산기를 쓸 수 없어요"
      : data.status === "no-data"
        ? "상점이 없거나 정보를 준비 중이에요"
        : "정보를 불러오지 못했어요";
    return (
      <PageMain>
        <StatusNotice
          tone={data.status === "unavailable" ? "danger" : "neutral"}
          action={data.status === "unavailable" ? <Button size="sm" onClick={() => revalidator.revalidate()}>다시 시도</Button> : undefined}
        >
          {message}
        </StatusNotice>
      </PageMain>
    );
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
  const guestPlannerStatus = data.signedIn ? "none" : (guestSnapshot?.status ?? "unavailable");
  return (
    <ReadyEventShopController
      data={data}
      savedShopState={savedShopState}
      guestPlannerStatus={guestPlannerStatus}
    />
  );
}

type ReadyEventShopData = Extract<Awaited<ReturnType<typeof loader>>, { status: "ready" }>;

function ReadyEventShopController({
  data,
  savedShopState,
  guestPlannerStatus,
}: {
  data: ReadyEventShopData;
  savedShopState: ReadyEventShopData["savedShopState"];
  guestPlannerStatus: "ready" | "memory" | "conflict" | "corrupt" | "unavailable" | "loading" | "none";
}) {
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
  });
  return <Outlet context={controller.plan} />;
}
