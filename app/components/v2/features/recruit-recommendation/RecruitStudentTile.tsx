import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useRef, useSyncExternalStore } from "react";
import { type RecruitGoal, recruitEvidenceLabels, usageColumnLabel } from "~/domain/recruit-recommendation";
import { formatCommunityTagLines } from "~/domain/recruit-recommendation-display";
import { cn } from "~/lib/utils";
import type { RecruitBossUsage, RecruitRecommendationStudent } from "~/models/recruit-recommendation-contract";
import { v2FocusRing } from "../../layout/styles";
import { Popover } from "../../primitives/Popover";
import { Sheet } from "../../primitives/Sheet";
import { AiRecommendedMark } from "../ai/AiMarks";
import { StudentThumb } from "../students/StudentThumb";
import { RecruitStudentDetail } from "./RecruitStudentDetail";
import { BossIcon, CommunityLevel, FavoriteToggle, formatShare, GrowthSummary, VerdictPill } from "./RecruitValues";
import type { RecruitPickupView } from "./types";

// The evidence opens as a popover under the tile wherever the desktop navigation shows (1024px and up), also when the
// page stacks its Aside beside a wide sidebar, and as a sheet below that.
const POPOVER_EVIDENCE_QUERY = "(min-width: 1024px)";

function subscribePopoverEvidence(onChange: () => void) {
  const query = window.matchMedia(POPOVER_EVIDENCE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePopoverEvidence(): boolean {
  return useSyncExternalStore(
    subscribePopoverEvidence,
    () => window.matchMedia(POPOVER_EVIDENCE_QUERY).matches,
    () => true,
  );
}

// One recommended student: the portrait, the verdict, and three columns of evidence (usage, community rating, growth
// tier). The whole tile opens the full evidence. The heart button sits above the tile's own button, so it stays a
// separate control.
export function RecruitStudentTile({
  goal,
  pickup,
  student,
  aiRecommended,
  substituteNames,
  timeZone,
  open,
  onOpenChange,
}: {
  goal: RecruitGoal;
  pickup: RecruitPickupView;
  student: RecruitRecommendationStudent;
  aiRecommended: boolean;
  substituteNames: ReadonlyMap<string, string>;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const popover = usePopoverEvidence();
  const tileRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const studentLabel = pickup.variant ? `${pickup.name}(${pickup.variant})` : pickup.name;
  const { recommendation } = student;
  const newbie = goal === "newbie" ? recommendation.newbie : null;
  const evidence = newbie ? (newbie.evidence === "community" ? "community" : null) : recommendation.verdict.evidence;
  const tagLines = formatCommunityTagLines(student.tags, substituteNames);
  const detail = (showHeader: boolean) => (
    <RecruitStudentDetail
      goal={goal}
      student={student}
      aiRecommended={aiRecommended}
      substituteNames={substituteNames}
      timeZone={timeZone}
      name={pickup.name}
      variant={pickup.variant}
      showHeader={showHeader}
    />
  );

  return (
    <div
      ref={tileRef}
      className={cn(
        "@container relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg p-3 v2-interaction-transition",
        open ? "bg-v2-inset" : "bg-v2-surface",
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${studentLabel} 근거`}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "absolute inset-0 cursor-pointer rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:bg-v2-hover v2-interaction-transition",
          v2FocusRing,
        )}
      />
      <div className="pointer-events-none relative">
        <StudentThumb
          studentUid={pickup.studentUid}
          name={pickup.name}
          variant={pickup.variant}
          recruitmentLabel={pickup.recruitmentLabel}
          isNew={pickup.isNew}
        />
        {newbie ? (
          <span className="absolute top-0.5 left-0.5 h-[1.125rem] min-w-[1.125rem] rounded-full bg-v2-scrim px-1 text-center text-xs leading-[1.125rem] font-semibold text-v2-on-media tabular-nums">
            {newbie.rank}
          </span>
        ) : null}
      </div>
      <div className="pointer-events-none relative min-w-0">
        <div className="flex min-h-7 flex-wrap items-center gap-2 pr-20">
          {newbie ? null : <VerdictPill goal={goal} verdict={recommendation.verdict} />}
          {evidence === "community" ? (
            <span className="text-xs text-v2-fg-tertiary">{recruitEvidenceLabels.community}</span>
          ) : null}
          {aiRecommended && !newbie ? <AiRecommendedMark /> : null}
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-x-3 break-keep [overflow-wrap:anywhere] @lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] @lg:gap-x-6">
          <Column label={usageColumnLabel(goal)}>
            <UsageValue bosses={recommendation.tileBosses} />
          </Column>
          <Column label="커뮤니티 평가">
            <CommunityLevel level={recommendation.communityLevel} dotClassName="w-[0.6875rem] @lg:w-4" />
            {tagLines.map((line) => (
              <span key={line} className="mt-1 block text-xs leading-4 text-v2-fg-secondary">
                {line}
              </span>
            ))}
          </Column>
          <Column label="육성 수준">
            <GrowthSummary modal={recommendation.growth?.modal ?? null} />
          </Column>
        </div>
      </div>
      <FavoriteToggle favorite={pickup.favorite} studentLabel={studentLabel} className="absolute top-3 right-3" />
      <ChevronRightIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 bottom-3 size-4 text-v2-fg-tertiary"
      />
      <Popover
        open={open && popover}
        label={`${studentLabel} 근거`}
        onClose={() => onOpenChange(false)}
        returnFocusRef={triggerRef}
        anchorRef={tileRef}
        className="w-[25rem] pb-2"
      >
        {detail(true)}
      </Popover>
      <Sheet open={open && !popover} title={studentLabel} onClose={() => onOpenChange(false)}>
        {detail(false)}
      </Sheet>
    </div>
  );
}

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] leading-4 text-v2-fg-tertiary @lg:text-xs">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// The usage column: one boss as its image, its usage and its name; several as their images, three on a narrow tile and
// eight on a wide one, then "+N" for the rest.
function UsageValue({ bosses }: { bosses: RecruitBossUsage[] }) {
  const first = bosses[0];
  if (first === undefined) {
    return <span className="text-xs leading-4 text-v2-fg-secondary">30% 이상인 보스 없음</span>;
  }
  if (bosses.length === 1) {
    return (
      <>
        <span className="flex min-h-7 items-center gap-1.5">
          <BossIcon bossUid={first.bossUid} bossName={first.bossName} size="lg" />
          <span className="text-lg leading-5 font-semibold text-v2-fg tabular-nums">{formatShare(first.usage)}</span>
        </span>
        <span className="mt-1 block text-xs leading-4 text-v2-fg-secondary">{first.bossName}</span>
      </>
    );
  }
  const narrowRest = Math.max(0, bosses.length - NARROW_BOSS_LIMIT);
  const wideRest = Math.max(0, bosses.length - WIDE_BOSS_LIMIT);
  return (
    <span className="flex min-h-7 flex-nowrap items-center gap-1 @lg:flex-wrap">
      {bosses.slice(0, WIDE_BOSS_LIMIT).map((boss, index) => (
        <span
          key={`${boss.source}-${boss.bossUid}`}
          className={cn("inline-flex", index >= NARROW_BOSS_LIMIT && "hidden @lg:inline-flex")}
        >
          <BossIcon bossUid={boss.bossUid} bossName={boss.bossName} size="md" />
        </span>
      ))}
      {narrowRest > 0 ? <MoreCount count={narrowRest} className="@lg:hidden" /> : null}
      {wideRest > 0 ? <MoreCount count={wideRest} className="hidden @lg:inline" /> : null}
    </span>
  );
}

const NARROW_BOSS_LIMIT = 3;
const WIDE_BOSS_LIMIT = 8;

function MoreCount({ count, className }: { count: number; className: string }) {
  return (
    <span className={cn("shrink-0 text-xs leading-4 font-semibold whitespace-nowrap text-v2-fg-secondary", className)}>
      +{count}
    </span>
  );
}
