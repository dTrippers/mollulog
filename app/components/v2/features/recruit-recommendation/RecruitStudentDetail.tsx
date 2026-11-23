import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { IdentificationIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatThousands } from "~/domain/futures/futures-view-model";
import {
  newbieGroupLabels,
  type RecruitGoal,
  recruitEvidenceLabels,
  usageColumnLabel,
} from "~/domain/recruit-recommendation";
import { formatCommunityTagLines, formatUsageSeason } from "~/domain/recruit-recommendation-display";
import { cn } from "~/lib/utils";
import type {
  RecruitBossUsage,
  RecruitGrowthSummary,
  RecruitRecommendationStudent,
} from "~/models/recruit-recommendation-contract";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { AiRecommendedMark } from "../ai/AiMarks";
import { TierFace, tierMeaning } from "../students/TierFace";
import { BossIcon, CommunityLevel, formatShare, growthTierValue, VerdictPill } from "./RecruitValues";

// The tile's evidence in full: the verdict and its evidence, every boss at 30% or more, the community rating with its
// tags, and the growth tiers of the placements. The popover shows the name as its header; the sheet has its own.
export function RecruitStudentDetail({
  goal,
  student,
  aiRecommended,
  substituteNames,
  timeZone,
  name,
  variant,
  showHeader,
}: {
  goal: RecruitGoal;
  student: RecruitRecommendationStudent;
  aiRecommended: boolean;
  substituteNames: ReadonlyMap<string, string>;
  timeZone: string;
  name: string;
  variant: string | null;
  showHeader: boolean;
}) {
  const { recommendation } = student;
  const windowBosses = recommendation.bosses.filter((boss) => boss.source === "window");
  const pastBosses = recommendation.bosses.filter((boss) => boss.source === "past");
  const tagLines = formatCommunityTagLines(student.tags, substituteNames);
  return (
    <div className="break-keep [overflow-wrap:anywhere]">
      {showHeader ? (
        <p className="text-sm font-semibold text-v2-fg">
          {name}
          {variant ? <span className="ml-1 text-[0.8125rem] font-medium text-v2-fg-secondary">{variant}</span> : null}
        </p>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-2", showHeader && "mt-2")}>
        {goal === "newbie" && recommendation.newbie ? (
          <p className="flex items-center gap-2 text-[0.8125rem] text-v2-fg-secondary">
            <b className="text-[0.9375rem] text-v2-fg tabular-nums">{recommendation.newbie.rank}위</b>
            <span>{newbieGroupLabels[recommendation.newbie.group]}</span>
          </p>
        ) : (
          <>
            <VerdictPill goal={goal} verdict={recommendation.verdict} />
            {recommendation.verdict.evidence ? (
              <span className="text-xs text-v2-fg-secondary">
                {recruitEvidenceLabels[recommendation.verdict.evidence]}
              </span>
            ) : null}
            {aiRecommended ? <AiRecommendedMark /> : null}
          </>
        )}
      </div>

      <DetailSection title={usageColumnLabel(goal)}>
        {recommendation.bosses.length === 0 ? (
          <p className="text-xs text-v2-fg-secondary">30% 이상인 보스 없음</p>
        ) : (
          <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content_max-content] items-center gap-x-2 gap-y-1 text-[0.8125rem] leading-[1.125rem]">
            <BossRows title="이번 일정" bosses={windowBosses} timeZone={timeZone} />
            <BossRows title="과거 시즌" bosses={pastBosses} timeZone={timeZone} />
          </div>
        )}
      </DetailSection>

      <DetailSection title="커뮤니티 평가">
        <CommunityLevel level={recommendation.communityLevel} />
        {tagLines.map((line) => (
          <p key={line} className="mt-1 text-xs leading-4 text-v2-fg-secondary">
            {line}
          </p>
        ))}
      </DetailSection>

      <DetailSection
        title="육성 수준"
        aside={recommendation.growth ? `편성 기록 ${formatThousands(recommendation.growth.sampleCount)}건` : null}
      >
        {recommendation.growth?.modal ? (
          <GrowthChart growth={recommendation.growth} />
        ) : (
          <p className="text-xs text-v2-fg-secondary">표본 부족</p>
        )}
      </DetailSection>

      {student.studentUid ? (
        <Link
          to={`/students/${student.studentUid}`}
          prefetch="intent"
          className={cn(
            "-mx-1.5 mt-3 flex h-9 items-center gap-2 rounded-md px-1.5 text-[0.8125rem] text-v2-fg hover:bg-v2-hover v2-interaction-transition",
            v2FocusRing,
          )}
          {...getV2LinkTransitionProps("forward")}
        >
          <IdentificationIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          <span className="min-w-0 flex-1">학생부 보기 (평가·통계)</span>
          <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function DetailSection({
  title,
  aside = null,
  children,
}: {
  title: string;
  aside?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 flex items-baseline gap-1.5 text-xs leading-4 text-v2-fg-tertiary">
        <span className="font-semibold text-v2-fg-secondary">{title}</span>
        {aside ? <span className="tabular-nums">{aside}</span> : null}
      </h3>
      {children}
    </section>
  );
}

// The bosses of one source, high to low. A boss under 70% has a lighter bar.
function BossRows({ title, bosses, timeZone }: { title: string; bosses: RecruitBossUsage[]; timeZone: string }) {
  if (bosses.length === 0) return null;
  return (
    <>
      <p className="col-span-full mt-1 text-[0.6875rem] text-v2-fg-tertiary first:mt-0">{title}</p>
      {bosses.map((boss) => (
        <BossRow key={`${boss.source}-${boss.bossUid}-${boss.startAt}`} boss={boss} timeZone={timeZone} />
      ))}
    </>
  );
}

function BossRow({ boss, timeZone }: { boss: RecruitBossUsage; timeZone: string }) {
  return (
    <>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-v2-fg">
        <BossIcon bossUid={boss.bossUid} bossName={boss.bossName} size="sm" />
        {boss.bossName}
      </span>
      <span aria-hidden="true" className="relative h-1.5 rounded-full bg-v2-inset">
        <i
          className={cn("absolute inset-y-0 left-0 rounded-full bg-v2-accent", boss.usage < 0.7 && "opacity-45")}
          style={{ width: formatShare(boss.usage) }}
        />
      </span>
      <span className="text-right font-semibold text-v2-fg tabular-nums">{formatShare(boss.usage)}</span>
      <span className="text-xs whitespace-nowrap text-v2-fg-tertiary tabular-nums">
        {formatUsageSeason(boss, timeZone)}
      </span>
    </>
  );
}

const growthColumns = [3, 4, 5, 6, 7, 8, 9];

// The share of placements at each growth tier from ★3 to the fourth exclusive weapon level. A lower star tier joins the
// columns only when it has placements. The most common tier stands out.
function GrowthChart({ growth }: { growth: RecruitGrowthSummary }) {
  const counts = new Map<number, number>();
  for (const entry of growth.distribution) {
    const value = growthTierValue(entry);
    counts.set(value, (counts.get(value) ?? 0) + entry.count);
  }
  const lower = [1, 2].filter((tier) => (counts.get(tier) ?? 0) > 0);
  const columns = [...lower, ...growthColumns];
  const maxCount = Math.max(1, ...columns.map((tier) => counts.get(tier) ?? 0));
  const modal = growth.modal ? growthTierValue(growth.modal) : null;
  return (
    <ol
      aria-label="성급별 편성 기록 비율"
      className="grid items-end gap-x-1.5"
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((tier) => {
        const count = counts.get(tier) ?? 0;
        const share = growth.sampleCount > 0 ? count / growth.sampleCount : 0;
        const shareText = count === 0 ? "-" : share < 0.005 ? "<1%" : formatShare(share);
        const highlighted = tier === modal;
        return (
          <li
            key={tier}
            aria-label={`${tierMeaning(tier)} ${count === 0 ? "없음" : shareText}`}
            className="flex flex-col items-center gap-1"
          >
            <span
              aria-hidden="true"
              className={cn(
                "text-[0.6875rem] leading-[0.875rem] tabular-nums",
                highlighted ? "font-semibold text-v2-fg" : "text-v2-fg-tertiary",
              )}
            >
              {shareText}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "w-full max-w-[1.875rem] rounded-t-[3px] rounded-b-[1px]",
                highlighted ? "bg-v2-accent" : "bg-v2-divider",
              )}
              style={{ height: `${Math.max(2, Math.round((56 * count) / maxCount))}px` }}
            />
            <span aria-hidden="true" className="h-[1.125rem] text-xs font-semibold text-v2-fg-secondary">
              <TierFace tier={tier} iconClassName="size-3.5" />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
