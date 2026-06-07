import { EmptyView } from "~/components/primitives";
import { EventDetailShopPage } from "~/components/features/events";

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
      availablePurchaseDays: Parameters<typeof EventDetailShopPage>[0]["availablePurchaseDays"];
      signedIn: Parameters<typeof EventDetailShopPage>[0]["signedIn"];
      minigameConfig: Parameters<typeof EventDetailShopPage>[0]["minigameConfig"];
    };

export default function EventShopContent(props: EventShopContentProps) {
  if (props.empty) {
    return <EmptyView text="상점 정보가 없거나 종료된 이벤트예요" />;
  }

  return (
    <EventDetailShopPage
      stages={props.stages}
      shopResources={props.shopResources}
      eventRewardBonus={props.eventRewardBonus}
      recruitedStudentUids={props.recruitedStudentUids}
      eventUid={props.eventUid}
      shopStateUid={props.shopStateUid}
      savedShopState={props.savedShopState}
      availablePurchaseDays={props.availablePurchaseDays}
      signedIn={props.signedIn}
      minigameConfig={props.minigameConfig}
    />
  );
}
