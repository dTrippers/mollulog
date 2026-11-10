import { ChevronRightIcon, ExclamationCircleIcon, StarIcon } from "@heroicons/react/16/solid";
import { Link, useRevalidator } from "react-router";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import {
  buildRecruitmentTierBars,
  formatRecruitmentRate,
  type RecruitmentRecordSummary,
} from "~/domain/recruitment-record-summary";
import { cn } from "~/lib/utils";

// The record summary: how many students the teacher has recruited, and the totals of the recruitment records. Each card
// links to its screen. Below 40rem of body width the two cards stack.
export type ProfileRecordSummaryData = { status: "ready"; summary: RecruitmentRecordSummary } | { status: "failed" };

const tierBarClassName = [
  "bg-v2-viz-tier-1",
  "bg-v2-viz-tier-2",
  "bg-v2-viz-tier-3",
  "bg-v2-viz-tier-4",
  "bg-v2-viz-tier-5",
  "bg-v2-viz-tier-6",
  "bg-v2-viz-tier-7",
  "bg-v2-viz-tier-8",
  "bg-v2-viz-tier-9",
] as const;

const tileClassName = "flex min-w-0 flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-tile-p";

export function ProfileRecordSummary({
  username,
  tierCounts,
  recruitedCount,
  totalCount,
  records,
}: {
  username: string;
  tierCounts: Record<number, number>;
  recruitedCount: number;
  totalCount: number;
  records: ProfileRecordSummaryData;
}) {
  return (
    <section aria-labelledby="profile-record-summary" className="@container flex flex-col gap-v2-block-gap">
      <h2 id="profile-record-summary" className="text-base font-bold text-v2-fg">
        기록 요약
      </h2>
      <div className="grid gap-v2-block-gap @min-[40rem]:grid-cols-2">
        <StudentsTile
          username={username}
          tierCounts={tierCounts}
          recruitedCount={recruitedCount}
          totalCount={totalCount}
        />
        <RecordsTile username={username} records={records} />
      </div>
    </section>
  );
}

function TileHeading({ children }: { children: string }) {
  return (
    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-v2-fg">
      {children}
      <ChevronRightIcon className="size-4 text-v2-fg-tertiary" aria-hidden="true" />
    </span>
  );
}

function StudentsTile({
  username,
  tierCounts,
  recruitedCount,
  totalCount,
}: {
  username: string;
  tierCounts: Record<number, number>;
  recruitedCount: number;
  totalCount: number;
}) {
  const bars = buildRecruitmentTierBars(tierCounts, recruitedCount, totalCount);
  return (
    <Link
      to={`/@${username}/students`}
      aria-label={`모집한 학생 ${recruitedCount}명 보기`}
      className={cn(tileClassName, "transition-colors hover:bg-v2-hover")}
    >
      <TileHeading>모집한 학생</TileHeading>
      <p className="text-2xl leading-[1.2] font-bold text-v2-fg tabular-nums">
        {recruitedCount.toLocaleString("en-US")}
        <span className="ml-0.5 text-sm font-semibold text-v2-fg-tertiary">
          {" "}
          / {totalCount.toLocaleString("en-US")}명
        </span>
      </p>
      <ul aria-label="성급별 학생 수" className="grid grid-cols-10 items-end gap-1.5">
        {bars.map((bar) => (
          <li key={bar.key} className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-v2-fg tabular-nums">{bar.count.toLocaleString("en-US")}</span>
            <span aria-hidden="true" className="relative block h-14 w-full rounded-[3px] bg-v2-inset">
              {bar.count > 0 ? (
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 block min-h-0.5 rounded-[3px]",
                    bar.tier === null ? "bg-v2-fg-disabled" : tierBarClassName[bar.tier - 1],
                  )}
                  style={{ height: `${bar.heightPercent}%` }}
                />
              ) : null}
            </span>
            <TierBarLabel tier={bar.tier} />
          </li>
        ))}
      </ul>
    </Link>
  );
}

// ★1-★5, the exclusive weapon icon with its level for 고유무기 1-4, and 미모집. Screen readers hear the full meaning.
function TierBarLabel({ tier }: { tier: number | null }) {
  if (tier === null) {
    return <span className="text-[0.6875rem] whitespace-nowrap text-v2-fg-secondary">미모집</span>;
  }
  if (tier <= 5) {
    return (
      <span className="inline-flex items-center gap-px text-[0.6875rem] text-v2-fg-secondary">
        <StarIcon className="size-3 text-v2-star" aria-hidden="true" />
        <span aria-hidden="true">{tier}</span>
        <span className="sr-only">{tier}성</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-px text-[0.6875rem] text-v2-fg-secondary">
      <img src="/icons/exclusive_weapon.png" alt="" className="size-3" />
      <span aria-hidden="true">{tier - 5}</span>
      <span className="sr-only">고유무기 {tier - 5}</span>
    </span>
  );
}

function RecordsTile({ username, records }: { username: string; records: ProfileRecordSummaryData }) {
  const revalidator = useRevalidator();

  if (records.status === "failed") {
    return (
      <div className={tileClassName}>
        <span className="text-sm font-semibold text-v2-fg">모집 기록</span>
        <StatusNotice
          tone="danger"
          Icon={ExclamationCircleIcon}
          action={
            <Button size="sm" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>
              다시 시도
            </Button>
          }
        >
          모집 기록을 불러오지 못했어요.
        </StatusNotice>
      </div>
    );
  }

  const { summary } = records;
  return (
    <Link to={`/@${username}/pickups`} className={cn(tileClassName, "transition-colors hover:bg-v2-hover")}>
      <TileHeading>모집 기록</TileHeading>
      {summary.recordCount === 0 ? (
        <p className="text-sm text-v2-fg-secondary">아직 모집 기록이 없어요</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[0.6875rem] text-v2-fg-tertiary">총 모집 횟수</p>
            <p className="text-2xl leading-[1.2] font-bold text-v2-fg tabular-nums">
              {summary.totalTrial > 0 ? (
                <>
                  {summary.totalTrial.toLocaleString("en-US")}
                  <span className="ml-0.5 text-sm font-semibold text-v2-fg-tertiary">회</span>
                </>
              ) : (
                <span className="text-base">미입력</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <RecordStat
              label="★3 획득 수"
              count={summary.tier3Count}
              rate={formatRecruitmentRate(summary.tier3RateCount, summary.totalTrial)}
            />
            <RecordStat
              label="★3 픽업 획득 수"
              count={summary.pickupCount}
              rate={formatRecruitmentRate(summary.pickupRateCount, summary.totalTrial)}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

function RecordStat({ label, count, rate }: { label: string; count: number; rate: string | null }) {
  return (
    <div>
      <p className="text-[0.6875rem] text-v2-fg-tertiary">{label}</p>
      <p className="text-base font-bold text-v2-fg tabular-nums">
        {count.toLocaleString("en-US")}회
        {rate ? <span className="ml-1 text-xs font-normal text-v2-fg-tertiary">{rate}</span> : null}
      </p>
    </div>
  );
}
