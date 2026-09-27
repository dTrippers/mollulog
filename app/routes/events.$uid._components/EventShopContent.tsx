import { useEffect, useState } from "react";
import { EventDetailShopPage } from "~/components/features/events";
import { EmptyView } from "~/components/primitives";
import type { GuestEventShopPlannerSnapshot } from "~/lib/guest-event-shop-planner.client";
import { readGuestEventShopPlanner, subscribeGuestEventShopPlanner } from "~/lib/guest-event-shop-planner.client";

type EventShopContentProps =
  | {
      empty: true;
    }
  | {
      empty: false;
      stages: Parameters<typeof EventDetailShopPage>[0]["stages"];
      shopResources: Parameters<typeof EventDetailShopPage>[0]["shopResources"];
      eventRewardBonus: Parameters<typeof EventDetailShopPage>[0]["eventRewardBonus"];
      recruitedStudentUids: Parameters<typeof EventDetailShopPage>[0]["recruitedStudentUids"];
      eventUid: Parameters<typeof EventDetailShopPage>[0]["eventUid"];
      shopStateUid: Parameters<typeof EventDetailShopPage>[0]["shopStateUid"];
      savedShopState: Parameters<typeof EventDetailShopPage>[0]["savedShopState"];
      savedShopStateSource: Parameters<typeof EventDetailShopPage>[0]["savedShopStateSource"];
      availablePurchaseDays: Parameters<typeof EventDetailShopPage>[0]["availablePurchaseDays"];
      signedIn: Parameters<typeof EventDetailShopPage>[0]["signedIn"];
      minigameConfig: Parameters<typeof EventDetailShopPage>[0]["minigameConfig"];
    };

export default function EventShopContent(props: EventShopContentProps) {
  if (props.empty) {
    return <EmptyView text="상점 정보가 없거나 종료된 이벤트예요" />;
  }

  return <ConnectedEventShopContent {...props} />;
}

function ConnectedEventShopContent(props: Extract<EventShopContentProps, { empty: false }>) {
  const [guestSnapshot, setGuestSnapshot] = useState<GuestEventShopPlannerSnapshot | null>(null);

  useEffect(() => {
    if (props.signedIn) return;
    const refresh = () => setGuestSnapshot(readGuestEventShopPlanner());
    refresh();
    return subscribeGuestEventShopPlanner(refresh);
  }, [props.signedIn]);

  if (!props.signedIn && !guestSnapshot) {
    return (
      <div
        aria-busy="true"
        className="my-8 rounded-lg border border-neutral-200 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        role="status"
      >
        상점 계획을 불러오고 있어요…
      </div>
    );
  }

  const guestPlan =
    guestSnapshot?.status === "ready" || guestSnapshot?.status === "memory" || guestSnapshot?.status === "conflict"
      ? guestSnapshot.envelope.data.plans[props.shopStateUid]
      : undefined;
  const savedShopState = props.signedIn ? props.savedShopState : (guestPlan?.state ?? null);
  const guestPlannerStatus = props.signedIn ? "none" : (guestSnapshot?.status ?? "unavailable");

  return (
    <EventDetailShopPage
      stages={props.stages}
      shopResources={props.shopResources}
      eventRewardBonus={props.eventRewardBonus}
      recruitedStudentUids={props.recruitedStudentUids}
      eventUid={props.eventUid}
      shopStateUid={props.shopStateUid}
      savedShopState={savedShopState}
      savedShopStateSource={props.savedShopStateSource}
      availablePurchaseDays={props.availablePurchaseDays}
      signedIn={props.signedIn}
      guestPlannerStatus={guestPlannerStatus}
      minigameConfig={props.minigameConfig}
    />
  );
}
