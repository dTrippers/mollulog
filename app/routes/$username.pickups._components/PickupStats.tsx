import { InformationCircleIcon } from "@heroicons/react/16/solid";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Popover } from "~/components/v2/primitives/Popover";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { cn } from "~/lib/utils";
import { formatCount, formatRate } from "./pickup-record";

type PickupStatsProps = {
  stats: {
    trial: number;
    tier3Count: number;
    tier3RateCount: number;
    pickupCount: number;
    pickupRateCount: number;
    hasFesRecord: boolean;
  };
  recordCount: number;
  // Records whose linked data failed to load. Their numbers are not in the totals.
  unavailableCount: number;
};

function StatTile({
  label,
  value,
  rate,
  labelAction,
  valueAction,
}: {
  label: string;
  value: string | null;
  rate?: string;
  // Beside the label from the md breakpoint, and at the end of the value row below it, where the narrow tile would
  // otherwise wrap the label.
  labelAction?: ReactNode;
  valueAction?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-v2-surface p-v2-tile-p md:p-v2-block-p">
      <p className="flex items-center gap-1 text-xs whitespace-nowrap text-v2-fg-tertiary">
        {label}
        {labelAction}
      </p>
      <p className="mt-1 flex items-center text-xl leading-tight font-bold text-v2-fg tabular-nums md:text-2xl">
        {value === null ? (
          <>
            <span aria-hidden="true">–</span>
            <span className="sr-only">기록 없음</span>
          </>
        ) : (
          <>
            {value}
            <span className="ml-0.5 text-xs font-normal text-v2-fg-secondary">회</span>
          </>
        )}
        {valueAction}
      </p>
      {rate ? <p className="mt-0.5 text-xs text-v2-fg-tertiary tabular-nums">{rate}</p> : null}
    </div>
  );
}

function usePickupCountHelp() {
  const labelButtonRef = useRef<HTMLButtonElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  const [openFrom, setOpenFrom] = useState<RefObject<HTMLButtonElement | null> | null>(null);
  const button = (ref: RefObject<HTMLButtonElement | null>, className: string) => (
    <button
      ref={ref}
      type="button"
      aria-label="★3 픽업 획득 수 설명"
      aria-haspopup="dialog"
      aria-expanded={openFrom === ref}
      onClick={() => setOpenFrom((prev) => (prev === ref ? null : ref))}
      className={cn(
        "size-[1.125rem] shrink-0 cursor-pointer items-center justify-center rounded-sm bg-v2-inset text-v2-fg-tertiary hover:bg-v2-filled-hover",
        v2FocusRing,
        className,
      )}
    >
      <InformationCircleIcon className="size-3" aria-hidden="true" />
    </button>
  );
  return {
    labelAction: button(labelButtonRef, "hidden md:inline-flex"),
    valueAction: (
      <>
        {button(valueButtonRef, "ml-auto inline-flex md:hidden")}
        <Popover
          open={openFrom !== null}
          label="★3 픽업 획득 수 설명"
          onClose={() => setOpenFrom(null)}
          returnFocusRef={openFrom ?? labelButtonRef}
          focusPanelIfNoFocusable
          className="w-[min(17.5rem,calc(100vw-2rem))] px-3.5 py-3 text-[0.8125rem] leading-normal font-normal text-v2-fg-secondary"
        >
          <p className="mb-1 font-semibold text-v2-fg">★3 픽업 획득 수</p>
          <p>
            픽업으로 얻은 학생만 세어요. ‘픽업 외’로 고른 학생은 픽업 획득 수와 확률에서는 빠지고, ★3 획득 수와 확률에는
            그대로 들어가요.
          </p>
        </Popover>
      </>
    ),
  };
}

function PickupCountTile({ value, rate }: { value: string | null; rate?: string }) {
  const { labelAction, valueAction } = usePickupCountHelp();
  return (
    <StatTile label="★3 픽업 획득 수" value={value} rate={rate} labelAction={labelAction} valueAction={valueAction} />
  );
}

export default function PickupStats({ stats, recordCount, unavailableCount }: PickupStatsProps) {
  // Without a record there is nothing to total, so the tiles show a dash instead of a zero.
  const empty = recordCount === 0;
  const hasTrial = stats.trial > 0;

  return (
    <section aria-labelledby="pickup-stats-title">
      <h2 id="pickup-stats-title" className="mb-2 text-base leading-[1.4] font-semibold text-v2-fg">
        모집 통계
      </h2>
      <div className="grid grid-cols-3 gap-v2-block-gap">
        <StatTile label="총 모집 횟수" value={empty ? null : formatCount(stats.trial)} />
        <StatTile
          label="★3 획득 수"
          value={empty ? null : formatCount(stats.tier3Count)}
          rate={!empty && hasTrial ? formatRate(stats.tier3RateCount, stats.trial) : undefined}
        />
        <PickupCountTile
          value={empty ? null : formatCount(stats.pickupCount)}
          rate={!empty && hasTrial ? formatRate(stats.pickupRateCount, stats.trial) : undefined}
        />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {stats.hasFesRecord ? (
          <StatusNotice tone="neutral">페스 기간에 모집한 ★3 학생은 확률을 0.5배로 계산했어요.</StatusNotice>
        ) : null}
        {unavailableCount > 0 ? (
          <StatusNotice tone="warning">
            불러오지 못한 기록 {formatCount(unavailableCount)}건은 통계에 포함되지 않았어요.
          </StatusNotice>
        ) : null}
      </div>
    </section>
  );
}
