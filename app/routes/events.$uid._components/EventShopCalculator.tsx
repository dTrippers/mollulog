import { CalculatorIcon, ListBulletIcon } from "@heroicons/react/16/solid";
import { useMatches, useOutletContext } from "react-router";
import { PageAside, PageMain, PanelSheet, useV2Page } from "~/components/v2/layout";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import type { ShopAvailableEvent } from "~/models/event-content";
import { EventShopPicker } from "./shop/EventShopPicker";
import { ShopBalanceSection, ShopFinalRewardsSection } from "./shop/ShopBalanceSection";
import { ShopBonusSection } from "./shop/ShopBonusSection";
import { ShopItemsSection } from "./shop/ShopItemsSection";
import { ShopMinigameSection } from "./shop/ShopMinigameSection";
import { ShopDataNote, ShopResultContents, ShopSignInNote } from "./shop/ShopResultPanel";
import { ShopStagesSection } from "./shop/ShopStagesSection";
import { ShopMobileResultBar } from "./ShopMobileResultBar";

export { matchesShopEventSearch } from "./shop/EventShopPicker";
export { ShopResultContents } from "./shop/ShopResultPanel";

type EventRouteData =
  | { status: "ready"; eventMetadata: { name: string }; shopAvailableEvents: ShopAvailableEvent[] }
  | { status: string };

export default function EventShopCalculator() {
  const plan = useOutletContext<EventShopPlanContext>();
  const matches = useMatches();
  const eventRouteData = matches.find((match) => match.id === "routes/events.$uid")?.data as EventRouteData | undefined;
  const eventName = eventRouteData && "eventMetadata" in eventRouteData ? eventRouteData.eventMetadata.name : "";
  const events = eventRouteData && "shopAvailableEvents" in eventRouteData ? eventRouteData.shopAvailableEvents : [];
  const { stacked } = useV2Page();

  return (
    <>
      <PageMain>
        <div className="flex flex-col gap-10">
          <ShopItemsSection plan={plan} />
          <ShopBonusSection plan={plan} />
          <ShopStagesSection plan={plan} />
          <ShopMinigameSection plan={plan} />
          <ShopBalanceSection plan={plan} />
          <ShopFinalRewardsSection plan={plan} />
          {/* The aside is hidden on stacked layouts, so its notes close the page instead. */}
          <div className="v2-stacked-only flex flex-col gap-2">
            {plan.signedIn ? null : <ShopSignInNote />}
            <ShopDataNote plan={plan} eventName={eventName} />
          </div>
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet panelId="result" title="계산 결과" Icon={CalculatorIcon}>
          <ShopResultContents plan={plan} />
        </PanelSheet>
        {events.length > 1 ? (
          <PanelSheet panelId="events" title="이벤트 선택" Icon={ListBulletIcon} collapsible defaultExpanded={false}>
            <EventShopPicker events={events} currentEventUid={plan.eventUid} stacked={stacked} />
          </PanelSheet>
        ) : null}
        {plan.signedIn ? null : <ShopSignInNote />}
        <ShopDataNote plan={plan} eventName={eventName} />
      </PageAside>
      <ShopMobileResultBar plan={plan} eventPicker={events.length > 1} />
    </>
  );
}
