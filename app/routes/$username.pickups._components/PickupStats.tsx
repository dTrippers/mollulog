import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
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

function StatTile({ label, value, rate }: { label: string; value: string | null; rate?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-v2-surface p-v2-tile-p md:p-v2-block-p">
      <p className="text-xs text-v2-fg-tertiary">{label}</p>
      <p className="mt-1 text-xl leading-tight font-bold text-v2-fg tabular-nums md:text-2xl">
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
      </p>
      {rate ? <p className="mt-0.5 text-xs text-v2-fg-tertiary tabular-nums">{rate}</p> : null}
    </div>
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
        <StatTile
          label="★3 픽업 획득 수"
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
