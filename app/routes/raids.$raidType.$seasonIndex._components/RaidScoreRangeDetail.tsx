import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import RaidOftenUsedParties from "~/components/features/raids/RaidOftenUsedParties";
import { SectionCard, Toggle } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import type { RangeStats } from "~/lib/ranks/range-stats";
import type { Role } from "~/models/content.d";
import RaidScoreUsageList from "./RaidScoreUsageList";

type StudentInfo = {
  name: string;
  role: Role;
  attackType: Attack;
  defenseType: Defense;
};

type RaidScoreRangeDetailProps = {
  rangeStats: RangeStats | null;
  loading: boolean;
  sampleSize: number;
  allStudents: Record<string, StudentInfo>;
  recruitedStudentTiers: Record<string, number>;
  hasRecruitedStudentData: boolean;
};

const PARTY_COUNT_BUCKETS = ["1편성", "2편성", "3편성", "4편성+"] as const;
const SKELETON_PARTY_CARD_KEYS = ["first", "second"] as const;
const SKELETON_STUDENT_ROW_KEYS = ["first", "second", "third"] as const;
const SKELETON_PARTY_SLOT_KEYS = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"] as const;

export default function RaidScoreRangeDetail({
  rangeStats,
  loading,
  sampleSize,
  allStudents,
  recruitedStudentTiers,
  hasRecruitedStudentData,
}: RaidScoreRangeDetailProps) {
  const [showUnrecruitedStudents, setShowUnrecruitedStudents] = useState(true);
  const { search } = useLocation();

  if (loading && !rangeStats) {
    return <RaidScoreRangeDetailSkeleton />;
  }

  if (!rangeStats || rangeStats.sampleSize === 0) {
    return (
      <div className="rounded-md bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        선택한 구간의 상세 통계가 없어요
      </div>
    );
  }

  const detailSampleSize = rangeStats.sampleSize || sampleSize;

  return (
    <div className="space-y-4">
      <SectionCard title="클리어 편성 수">
        <PartyCountDistribution partyCounts={rangeStats.partyCounts} sampleSize={detailSampleSize} />
      </SectionCard>

      <SectionCard title="학생별 출전 횟수" description="학생 성장도별 출전 횟수">
        <RaidScoreUsageList
          usage={rangeStats.studentUsage}
          sampleSize={detailSampleSize}
          allStudents={allStudents}
          recruitedStudentTiers={recruitedStudentTiers}
        />
        <p className="mt-2 text-xs text-muted-foreground">고유 ★1 데이터에는 ★5가 포함돼요</p>
      </SectionCard>

      {rangeStats.oftenUsedParties.length > 0 && (
        <SectionCard
          title="많이 편성한 조합"
          description="순서나 학생 성장도는 반영되지 않아요"
          action={
            hasRecruitedStudentData ? (
              <Toggle
                label="미모집 학생 표시"
                initialState={showUnrecruitedStudents}
                className="my-0"
                onChange={setShowUnrecruitedStudents}
              />
            ) : null
          }
        >
          <RaidOftenUsedParties
            oftenUsedParties={rangeStats.oftenUsedParties}
            allStudents={allStudents}
            recruitedStudentTiers={recruitedStudentTiers}
            showUnrecruitedStudents={hasRecruitedStudentData && showUnrecruitedStudents}
          />
          <RanksPageLink to={`ranks${search}`} />
        </SectionCard>
      )}
    </div>
  );
}

function RanksPageLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="group mt-3 flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <span className="min-w-0">
        <span className="font-medium text-foreground group-hover:underline">모든 편성 보기</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          특정 성장도의 학생을 포함/제외하는 조건으로 편성을 찾아볼 수 있어요
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function RaidScoreRangeDetailSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <SectionCard title="클리어 편성 수">
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {PARTY_COUNT_BUCKETS.map((label, index) => (
            <div key={label} className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="h-4 w-10 animate-pulse rounded-sm bg-muted" />
                <span className="h-3 w-20 animate-pulse rounded-sm bg-muted/60" />
              </div>
              <SkeletonLine className={index === 0 ? "w-full" : index === 1 ? "w-3/4" : "w-2/5"} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="출전 횟수 통계" description="학생 성장도 및 모집/조력별 출전 횟수">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <span className="h-8 w-12 animate-pulse rounded-md bg-muted" />
            <span className="h-8 w-12 animate-pulse rounded-md bg-muted/60" />
            <span className="h-8 w-12 animate-pulse rounded-md bg-muted/60" />
          </div>
          <span className="h-4 w-20 animate-pulse rounded-sm bg-muted/60" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <StudentUsageSkeletonGroup />
          <StudentUsageSkeletonGroup />
        </div>
      </SectionCard>

      <SectionCard title="많이 편성한 조합" description="순서나 학생 성장도는 반영되지 않아요">
        <div className="grid gap-3 md:grid-cols-2">
          {SKELETON_PARTY_CARD_KEYS.map((key) => (
            <div key={key} className="space-y-3 rounded-md bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <span className="h-4 w-24 animate-pulse rounded-sm bg-muted" />
                <span className="h-4 w-16 animate-pulse rounded-sm bg-muted/60" />
              </div>
              <div className="grid grid-cols-6 gap-2">
                {SKELETON_PARTY_SLOT_KEYS.map((slotKey) => (
                  <span key={slotKey} className="aspect-square animate-pulse rounded-full bg-muted/60" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function StudentUsageSkeletonGroup() {
  return (
    <div>
      <span className="mb-2 block h-4 w-16 animate-pulse rounded-sm bg-muted" />
      <div className="space-y-3">
        {SKELETON_STUDENT_ROW_KEYS.map((key) => (
          <div key={key} className="flex items-start gap-2">
            <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="h-4 w-24 animate-pulse rounded-sm bg-muted" />
                <span className="h-3 w-16 animate-pulse rounded-sm bg-muted/60" />
              </div>
              <SkeletonLine className="w-full" />
              <SkeletonLine className={key === "first" ? "w-5/6" : "w-2/3"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <span className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
      <span className={`block h-2 animate-pulse rounded-full bg-muted ${className ?? ""}`} />
    </span>
  );
}

function PartyCountDistribution({
  partyCounts,
  sampleSize,
}: {
  partyCounts: RangeStats["partyCounts"];
  sampleSize: number;
}) {
  const counts = [0, 0, 0, 0];
  for (const bucket of partyCounts) {
    const index = Math.min(Math.max(bucket.partyCount, 1), 4) - 1;
    counts[index] += bucket.entryCount;
  }

  const total = counts.reduce((sum, count) => sum + count, 0) || sampleSize;

  return (
    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {PARTY_COUNT_BUCKETS.map((label, index) => {
        const count = counts[index];
        const ratio = total > 0 ? count / total : 0;
        return (
          <div key={label} className="min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{label}</span>
              <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {count.toLocaleString()}명 · {formatPercent(ratio)}
              </span>
            </div>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all duration-300 dark:bg-blue-400"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
