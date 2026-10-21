import { ArrowPathIcon, ExclamationCircleIcon, ListBulletIcon } from "@heroicons/react/16/solid";
import { PageActionBar, useV2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { IconButton } from "~/components/v2/primitives/IconButton";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";

export function ShopMobileResultBar({
  plan,
  ap,
  onEventPicker,
}: {
  plan: EventShopPlanContext;
  ap: number;
  onEventPicker?: () => void;
}) {
  const { stacked, openSheet } = useV2Page();
  if (!stacked) return null;

  return (
    <PageActionBar
      placement="fixed"
      summary={<MobileApSummary plan={plan} ap={ap} />}
      className="v2-action-bar flex-nowrap gap-2 px-4 py-2 [&>div:first-child]:shrink-0"
    >
      {onEventPicker ? <IconButton icon={ListBulletIcon} label="이벤트 선택" onClick={onEventPicker} /> : null}
      <Button variant="primary" onClick={() => openSheet("result")}>
        결과
      </Button>
    </PageActionBar>
  );
}

function MobileApSummary({ plan, ap }: { plan: EventShopPlanContext; ap: number }) {
  const danger =
    !!plan.saveError ||
    plan.resultTreasureHuntStatus === "failed" ||
    plan.roadPuzzlePlannerStatus === "failed" ||
    plan.roadPuzzlePlannerStatus === "missing";
  const busy =
    plan.isSaving ||
    plan.isCalculating ||
    plan.roadPuzzlePlannerStatus === "pending" ||
    plan.resultTreasureHuntStatus === "pending" ||
    plan.resultTreasureHuntStatus === "provisional";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0">
        <span className="block text-xs leading-tight font-normal text-v2-fg-tertiary">필요 AP</span>
        <span
          className={`block text-base font-semibold leading-tight tabular-nums ${ap > 0 ? "text-v2-ap" : "text-v2-fg-tertiary"}`}
        >
          {busy ? <span aria-hidden="true">{"\u00a0"}</span> : ap > 0 ? ap.toLocaleString() : "—"}
        </span>
      </span>
      {danger ? (
        <ExclamationCircleIcon className="size-4 shrink-0 text-v2-danger" role="img" aria-label="계산 오류" />
      ) : busy ? (
        <ArrowPathIcon
          className="size-4 shrink-0 animate-spin text-v2-fg-tertiary motion-reduce:animate-none"
          role="img"
          aria-label="계산 중"
        />
      ) : null}
    </div>
  );
}
