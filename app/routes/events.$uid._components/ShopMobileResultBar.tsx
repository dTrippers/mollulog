import { ChevronUpIcon, ClockIcon, ExclamationCircleIcon, ListBulletIcon } from "@heroicons/react/16/solid";
import { MobileActionBar, useV2Page } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { resourceShortfalls, resultSlotState, stageRunRows } from "./shop/shop-model";
import { formatCount, Pill } from "./shop/shop-ui";

// Stacked layouts float the result summary above the bottom navigation. Tapping it opens the result sheet; the event
// selector beside it opens the "events" sheet when another event's shop is available.
export function ShopMobileResultBar({
  plan,
  eventPicker = false,
}: {
  plan: EventShopPlanContext;
  eventPicker?: boolean;
}) {
  const { stacked, openSheet, sheetPanelId } = useV2Page();
  if (!stacked) return null;
  const slot = resultSlotState(plan);
  const recalculating = slot.kind === "ready" && plan.isCalculating;
  const ap = plan.stageCalculations.totalApWithExtras;
  const shortfalls = resourceShortfalls(plan);
  const short = plan.collectableResources.filter(({ uid }) => shortfalls[uid]);
  const stageCount = stageRunRows(plan).length;

  return (
    <MobileActionBar
      panels={
        eventPicker ? [{ panelId: "events", title: "이벤트 선택", shortTitle: "이벤트", Icon: ListBulletIcon }] : []
      }
      leading={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sheetPanelId === "result"}
          aria-label="계산 결과 열기"
          onClick={() => openSheet("result")}
          className={cn(
            "flex w-full items-center gap-3 rounded-[14px] bg-v2-elevated px-3.5 py-3 text-left shadow-lg",
            v2FocusRing,
          )}
        >
          <span className="min-w-0 grow">
            {slot.kind === "ready" ? (
              <>
                <span className={cn("flex min-w-0 items-center gap-2", recalculating && "opacity-50")}>
                  <span
                    className={cn(
                      "text-lg leading-[1.2] font-bold tabular-nums",
                      ap > 0 ? "text-v2-ap" : "text-v2-fg-tertiary",
                    )}
                  >
                    {formatCount(ap)}
                  </span>
                  {short.length === 1 ? (
                    <Pill tone="danger" className="min-w-0">
                      <span className="truncate">
                        {short[0]?.name} {formatCount(shortfalls[short[0]?.uid ?? ""] ?? 0)} 부족
                      </span>
                    </Pill>
                  ) : short.length > 1 ? (
                    <Pill tone="danger">재화 {formatCount(short.length)}종 부족</Pill>
                  ) : plan.collectableResources.length > 0 ? (
                    <Pill tone="success">재화 모두 충분</Pill>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-v2-fg-tertiary">
                  {recalculating ? "계산 중..." : `필요 AP · 스테이지 ${formatCount(stageCount)}곳`}
                </span>
              </>
            ) : slot.kind === "empty" ? (
              <>
                <span className="block text-lg leading-[1.2] font-bold text-v2-fg-tertiary">—</span>
                <span className="mt-0.5 block text-xs text-v2-fg-tertiary">살 아이템을 고르면 계산해요</span>
              </>
            ) : slot.kind === "waiting" ? (
              <span className="flex items-center gap-1.5 text-sm text-v2-fg-secondary">
                <ClockIcon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{slot.text}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-v2-danger">
                <ExclamationCircleIcon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{slot.text}</span>
              </span>
            )}
          </span>
          <ChevronUpIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
        </button>
      }
    />
  );
}
