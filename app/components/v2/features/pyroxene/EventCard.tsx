import {
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  StarIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { forwardRef, type ReactNode, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { getOfferedPickupChanceOptions } from "~/domain/pyroxene-assumptions";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import { getBalanceRange, getPyroxeneEventStatus } from "~/domain/pyroxene-planner-view";
import {
  DEFAULT_RECRUITMENT_TARGET_TIER,
  RECRUITMENT_TARGET_TIERS,
  type RecruitmentStacks,
  type RecruitmentTargetTier,
  type RecruitmentTargetTiers,
} from "~/domain/pyroxene-recruitment-goal";
import type { TimelineEntry, TimelinePickupStack } from "~/domain/pyroxene-timeline";
import { getTaggedFreeRecruitmentPulls } from "~/domain/recruitment-notice";
import { STUDENT_ACQUISITION_LABELS } from "~/domain/student-directory";
import dayjs from "~/lib/dayjs";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button, v2ButtonClassName } from "../../primitives/Button";
import { NumberInput } from "../../primitives/NumberInput";
import { Popover } from "../../primitives/Popover";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { TierStarPicker } from "../students/TierStarPicker";
import { OwnedResourcesDialog, type OwnedResourceValues } from "./OwnedResources";
import { PICKUP_BASIS_SHORT_LABELS, SegmentedChoice } from "./PickupBasis";
import {
  balanceClassName,
  formatAmount,
  formatSigned,
  KST,
  PlannerDialog,
  type PyroxeneResourceKey,
  RECRUITMENT_STACK_LABELS,
  ResourceIcon,
  StatusPill,
} from "./pyroxene-ui";

export type PlannerEventData = {
  completed: boolean;
  expectedTrials: number | null;
  pickupChance?: PyroxenePickupChance | null;
  targetTiers?: RecruitmentTargetTiers;
};

export type PlannerEventDataPatch = {
  expectedTrials?: number | null;
  pickupChance?: PyroxenePickupChance | null;
  targetTiers?: RecruitmentTargetTiers;
};

export type EventCardHandlers = {
  onFavoriteChange: (contentUid: string, studentUid: string, favorited: boolean) => void;
  onUpdateEventData: (eventUid: string, patch: PlannerEventDataPatch) => void;
  onComplete: (eventUid: string, values: OwnedResourceValues) => void;
  onDeleteCompletion: (eventUid: string) => void;
};

type EventCardProps = {
  entry: TimelineEntry;
  marker: number | null;
  eventData: PlannerEventData | undefined;
  defaultBasis: PyroxenePickupChance;
  recruitedStudentUids: ReadonlySet<string>;
  currentStacks: RecruitmentStacks;
  canRecordCompletion: boolean;
  recordEditLink: string | undefined;
  selected: boolean;
  handlers: EventCardHandlers;
};

/** The accessible meaning of a tier: "3성" for a star tier, "고유무기 2" for an exclusive weapon level. */
function tierMeaning(tier: RecruitmentTargetTier): string {
  return tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}`;
}

/** A yellow star with the tier up to 5, then the exclusive weapon icon with its level. */
function TierFace({ tier, iconClassName = "size-3.5" }: { tier: RecruitmentTargetTier; iconClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {tier <= 5 ? (
        <StarIcon className={cn(iconClassName, "shrink-0 text-v2-star")} aria-hidden="true" />
      ) : (
        <img src="/icons/exclusive_weapon.png" alt="" className={cn(iconClassName, "shrink-0")} />
      )}
      {tier <= 5 ? tier : tier - 5}
    </span>
  );
}

export function MarkerBadge({ marker, short }: { marker: number; short: boolean }) {
  return (
    <span
      role="img"
      aria-label={`${marker}번 목표`}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold tabular-nums",
        short ? "bg-v2-danger-solid text-v2-on-danger" : "bg-v2-fg text-v2-canvas",
      )}
    >
      {marker}
    </span>
  );
}

function StackBar({ stack }: { stack: TimelinePickupStack }) {
  const label = RECRUITMENT_STACK_LABELS[stack.scope];
  return (
    <div className="flex items-center justify-end gap-1.5 text-xs text-v2-fg-secondary">
      <span className="whitespace-nowrap">{label}</span>
      <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-full bg-v2-inset">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-v2-fg-secondary"
          style={{ width: `${(stack.after / 200) * 100}%` }}
        />
        <span className="absolute inset-y-0 left-1/2 w-px bg-v2-surface" aria-hidden="true" />
      </span>
      <span className="w-7 text-right font-semibold text-v2-fg tabular-nums">
        {stack.after}
        <span className="sr-only">/200</span>
      </span>
    </div>
  );
}

function usageText(delta: number): string | null {
  if (delta < 0) return `${Math.abs(delta).toLocaleString()}개 사용`;
  if (delta > 0) return `${delta.toLocaleString()}개 획득`;
  return null;
}

/** One resource as what is left, with how much this event uses right below it. */
function ResourceUnit({
  resource,
  amount,
  delta,
  large = false,
  showUsage = true,
  children,
}: {
  resource: PyroxeneResourceKey;
  amount: number;
  delta: number;
  large?: boolean;
  // Wide layouts show the usage in the change column instead.
  showUsage?: boolean;
  children?: ReactNode;
}) {
  const usage = showUsage ? usageText(delta) : null;
  return (
    <div className="flex flex-col items-end">
      <span className="flex items-center gap-1">
        <ResourceIcon resource={resource} className={cn("my-0", large ? "size-6" : "size-5")} />
        <span
          className={cn(
            large ? "text-lg leading-tight font-bold" : "text-sm leading-5 font-semibold",
            balanceClassName(amount),
          )}
        >
          {formatAmount(amount)}
        </span>
      </span>
      {usage ? <span className="text-xs text-v2-fg-tertiary">{usage}</span> : null}
      {children}
    </div>
  );
}

/** What the recruitment uses, one resource per line, for the change column of wide layouts. */
function ResourceUsage({ entry, className }: { entry: TimelineEntry; className?: string }) {
  const delta = entry.resourceDelta;
  const changed = (["pyroxene", "tenTimeTicket", "oneTimeTicket"] as const).filter((resource) => delta[resource] !== 0);
  return (
    <span className={cn("flex-col items-end gap-0.5 pt-0.5 text-sm font-semibold tabular-nums", className)}>
      {changed.length === 0 ? <span className="text-v2-fg-tertiary">—</span> : null}
      {changed.map((resource) => (
        <span
          key={resource}
          className={cn("inline-flex items-center gap-0.5", delta[resource] < 0 ? "text-v2-danger" : "text-v2-success")}
        >
          <ResourceIcon resource={resource} className="my-0 size-5" />
          {formatSigned(delta[resource])}
        </span>
      ))}
    </span>
  );
}

/** What is left of each resource after the recruitment, grouped by resource. */
function ResourceLedger({
  entry,
  showUsage = true,
  className,
}: {
  entry: TimelineEntry;
  showUsage?: boolean;
  className?: string;
}) {
  const plan = entry.pickupPlan;
  if (!plan) return null;
  const delta = entry.resourceDelta;
  const after = entry.accumulatedResources;
  const range = getBalanceRange(entry);
  const status = getPyroxeneEventStatus(entry);
  const tickets = (["tenTimeTicket", "oneTimeTicket"] as const).filter((resource) => delta[resource] !== 0);
  // An automatic basis assumes the targets are acquired, so the stack returns to 0; show only a stack that is not.
  const stacks = plan.stacks.filter((stack) => stack.before !== 0 || stack.after !== 0);
  return (
    <div className={cn("flex items-start justify-between gap-3 tabular-nums @2xl:justify-end", className)}>
      <span className="flex items-center gap-2 @2xl:hidden">
        <span className="text-xs text-v2-fg-tertiary">남은 재화</span>
        {/* Desktop shows the status in the actions column instead. */}
        {status ? <StatusPill status={status} /> : null}
      </span>
      <div className="flex flex-col items-end gap-2.5">
        <ResourceUnit resource="pyroxene" amount={after.pyroxene} delta={delta.pyroxene} showUsage={showUsage} large>
          {range ? (
            <span className="mt-1.5 flex flex-col items-end text-xs text-v2-fg-tertiary">
              <span className="text-[0.625rem] leading-3">예상 범위 (80%)</span>
              <span>
                {/* A low end below zero means bad luck can run the balance short. */}
                <span className={cn(range.low < 0 && "font-semibold text-v2-warning")}>{formatAmount(range.low)}</span>
                {" ~ "}
                {formatAmount(range.high)}
              </span>
            </span>
          ) : null}
        </ResourceUnit>
        {tickets.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-x-4 gap-y-2.5">
            {tickets.map((resource) => (
              <ResourceUnit
                key={resource}
                resource={resource}
                amount={after[resource]}
                delta={delta[resource]}
                showUsage={showUsage}
              />
            ))}
          </div>
        ) : null}
        {stacks.map((stack) => (
          <div key={stack.scope} className="flex flex-col items-end">
            <StackBar stack={stack} />
            {stack.after !== stack.before ? (
              <span className="text-xs text-v2-fg-tertiary">{formatSigned(stack.after - stack.before)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export const EventCard = forwardRef<HTMLDivElement, EventCardProps>(function EventCard(
  {
    entry,
    marker,
    eventData,
    defaultBasis,
    recruitedStudentUids,
    currentStacks,
    canRecordCompletion,
    recordEditLink,
    selected,
    handlers,
  },
  ref,
) {
  const event = entry.source.event;
  const plan = entry.pickupPlan;
  const [dialog, setDialog] = useState<"target" | "complete" | null>(null);
  // The student whose target tier popover is open. The uid stays after closing, so the panel keeps its content while it
  // fades out.
  const [tierPopover, setTierPopover] = useState<{ uid: string; open: boolean } | null>(null);
  const thumbRefs = useRef(new Map<string, HTMLButtonElement>());
  const tierAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [showRecruited, setShowRecruited] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteWarningId = useId();
  if (!event) return null;

  const completed = eventData?.completed ?? false;
  const targetTiers = eventData?.targetTiers ?? {};
  const students = event.recruitments.flatMap((recruitment) =>
    recruitment.pickup && recruitment.student
      ? [
          {
            ...recruitment.student,
            favorited: recruitment.favorited,
            contentUid: recruitment.sourceContentUid ?? event.uid,
          },
        ]
      : [],
  );
  const recruited = students.filter((student) => !student.favorited && recruitedStudentUids.has(student.uid));
  const visibleStudents = showRecruited ? students : students.filter((student) => !recruited.includes(student));
  const status = plan ? getPyroxeneEventStatus(entry) : null;
  const since = dayjs(event.since);
  const canComplete = canRecordCompletion && !completed && since.isBefore(dayjs());
  // Event metadata: the tagged free count, independent of how many pulls the plan uses.
  const taggedFreePulls = getTaggedFreeRecruitmentPulls(event.tags);
  const freeLabel = taggedFreePulls > 0 ? taggedFreePulls : null;
  const ruleIsLegacy = event.recruitmentRuleSet !== "call_charge_v1";

  const completionValues: OwnedResourceValues = {
    resources: {
      pyroxene: Math.max(0, entry.accumulatedResources.pyroxene),
      oneTimeTicket: Math.max(0, entry.accumulatedResources.oneTimeTicket),
      tenTimeTicket: Math.max(0, entry.accumulatedResources.tenTimeTicket),
    },
    stacks: {
      ...currentStacks,
      ...Object.fromEntries((plan?.stacks ?? []).map((stack) => [stack.scope, stack.after])),
    },
  };

  const tierStudent = tierPopover ? students.find((s) => s.uid === tierPopover.uid) : undefined;
  const tierStudentNames = tierStudent ? splitVisibleStudentName(tierStudent.name) : null;
  // The name with its variant, so a student is never mistaken for another variant of the same name.
  const tierStudentLabel = tierStudentNames
    ? tierStudentNames.variant
      ? `${tierStudentNames.name}(${tierStudentNames.variant})`
      : tierStudentNames.name
    : null;
  const closeTierPopover = () => setTierPopover((current) => (current ? { ...current, open: false } : null));
  const until = dayjs(event.until);
  // An event with nothing left to choose reads as one line, like the income rows around it.
  const compact = !plan && !completed && !showRecruited && visibleStudents.length === 0;

  const pills =
    completed || ruleIsLegacy || freeLabel ? (
      <>
        {completed ? (
          <span className="inline-flex h-5.5 items-center gap-0.5 rounded-full bg-v2-success-subtle px-2 text-xs font-semibold text-v2-success">
            <CheckIcon className="size-3.5" aria-hidden="true" />
            모집 완료
          </span>
        ) : null}
        {ruleIsLegacy ? (
          <span className="inline-flex h-5.5 items-center rounded-full bg-v2-inset px-2 text-xs font-semibold text-v2-fg-secondary">
            개편 전 규칙
          </span>
        ) : null}
        {freeLabel ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-v2-perk">
            <StarIcon className="size-3.5" aria-hidden="true" />
            무료 {freeLabel}회
          </span>
        ) : null}
      </>
    ) : null;

  const dialogs = (
    <>
      <TargetDialog
        key={dialog === "target" ? "target-open" : "target-closed"}
        open={dialog === "target"}
        onClose={() => setDialog(null)}
        eventData={eventData}
        defaultBasis={defaultBasis}
        defaultPulls={plan && !plan.basisOverridden && plan.basis !== "manual" ? plan.pulls : null}
        onSave={(patch) => {
          handlers.onUpdateEventData(event.uid, patch);
          setDialog(null);
        }}
      />
      <Popover
        open={Boolean(tierStudent && tierPopover?.open)}
        label={tierStudentLabel ? `${tierStudentLabel} 목표 성급` : "목표 성급"}
        onClose={closeTierPopover}
        returnFocusRef={tierAnchorRef}
        className="flex w-fit flex-col gap-2 p-3"
      >
        {tierStudent && tierStudentLabel ? (
          <>
            <p className="text-sm font-semibold text-v2-fg">{tierStudentLabel} 목표 성급</p>
            <TierStarPicker
              value={targetTiers[tierStudent.uid] ?? DEFAULT_RECRUITMENT_TARGET_TIER}
              min={1}
              max={RECRUITMENT_TARGET_TIERS[RECRUITMENT_TARGET_TIERS.length - 1]}
              initialTier={RECRUITMENT_TARGET_TIERS[0]}
              onPick={(picked) => {
                const tier = picked as RecruitmentTargetTier;
                const next = { ...targetTiers };
                if (tier === DEFAULT_RECRUITMENT_TARGET_TIER) delete next[tierStudent.uid];
                else next[tierStudent.uid] = tier;
                handlers.onUpdateEventData(event.uid, { targetTiers: next });
                closeTierPopover();
                tierAnchorRef.current?.focus({ preventScroll: true });
              }}
            />
            <Button
              size="sm"
              variant="danger-subtle"
              className="self-start"
              onClick={() => {
                handlers.onFavoriteChange(tierStudent.contentUid, tierStudent.uid, false);
                closeTierPopover();
              }}
            >
              관심 학생에서 제외
            </Button>
          </>
        ) : null}
      </Popover>
      <OwnedResourcesDialog
        open={dialog === "complete"}
        title="모집 완료 기록"
        submitLabel="기록"
        description="모집을 마친 뒤 남은 재화와 스택을 입력해주세요. 예상값으로 채워 두었어요."
        initialValues={completionValues}
        onClose={() => setDialog(null)}
        onSubmit={(values) => {
          handlers.onComplete(event.uid, values);
          setDialog(null);
        }}
      />
    </>
  );

  const recruitedButton = (
    <button
      type="button"
      onClick={() => setShowRecruited(true)}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded text-xs whitespace-nowrap text-v2-fg-tertiary hover:text-v2-fg",
        v2FocusRing,
      )}
    >
      모집한 학생 {recruited.length}/{students.length}
      <ChevronDownIcon className="hidden size-3.5 @2xl:block" aria-hidden="true" />
    </button>
  );

  if (compact) {
    // An event with nothing to choose keeps the card surface, so it still reads as an event among income rows.
    return (
      <div
        ref={ref}
        tabIndex={selected ? -1 : undefined}
        className={cn(
          "flex flex-col gap-1 rounded-lg bg-v2-surface px-4 py-3 focus:outline-none @2xl:grid @2xl:grid-cols-[3.25rem_minmax(0,1fr)_6rem_7rem_4.5rem] @2xl:items-start @2xl:gap-x-3 @2xl:gap-y-0",
          selected && "ring-2 ring-v2-focus",
        )}
      >
        <div className="hidden flex-col pt-px text-[0.8125rem] font-semibold tabular-nums @2xl:flex">
          <span className="text-v2-fg">{since.tz(KST).format("MM/DD")}</span>
          <span className="text-xs font-normal text-v2-fg-tertiary">~{until.tz(KST).format("MM/DD")}</span>
        </div>
        <span className="text-[0.8125rem] font-semibold text-v2-fg tabular-nums @2xl:hidden">
          {since.tz(KST).format("MM/DD")} ~ {until.tz(KST).format("MM/DD")}
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <h3 className="text-sm leading-snug font-semibold break-keep whitespace-pre-line text-v2-fg-secondary">
            {event.name}
          </h3>
          {recruited.length > 0 ? recruitedButton : null}
        </div>
        {dialogs}
      </div>
    );
  }

  const thumbWidth = plan ? "w-15" : "w-12";

  return (
    <div
      ref={ref}
      tabIndex={selected ? -1 : undefined}
      className={cn(
        "flex flex-col gap-4 rounded-lg bg-v2-surface px-4 py-5 focus:outline-none @2xl:grid @2xl:grid-cols-[3.25rem_minmax(0,1fr)_6rem_7rem_4.5rem] @2xl:items-start @2xl:gap-x-3 @2xl:gap-y-0",
        selected && "ring-2 ring-v2-focus",
      )}
    >
      <div className="hidden flex-col pt-px text-[0.8125rem] font-semibold tabular-nums @2xl:flex">
        <span className="text-v2-fg">{since.tz(KST).format("MM/DD")}</span>
        <span className="text-xs font-normal text-v2-fg-tertiary">~{until.tz(KST).format("MM/DD")}</span>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2 @2xl:hidden">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums">
              <span className="text-v2-fg">
                {since.tz(KST).format("MM/DD")} ~ {until.tz(KST).format("MM/DD")}
              </span>
              {pills}
            </div>
          </div>
          {pills ? <div className="hidden flex-wrap items-center gap-2 @2xl:flex">{pills}</div> : null}
          {/* The marker always leads the title; tags sit on their own line above. */}
          <div className="flex items-start gap-2">
            {marker !== null ? (
              <span className="inline-flex pt-px">
                <MarkerBadge marker={marker} short={status === "short"} />
              </span>
            ) : null}
            <h3 className="min-w-0 text-base leading-snug font-semibold break-keep whitespace-pre-line text-v2-fg">
              {event.name}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2.5">
          {visibleStudents.map((student) => {
            const names = splitVisibleStudentName(student.name);
            const tier = (targetTiers[student.uid] ?? DEFAULT_RECRUITMENT_TARGET_TIER) as RecruitmentTargetTier;
            const acquisitionLabel = getAcquisitionLabel(student.acquisitionType);
            const showTier = student.favorited && tier !== DEFAULT_RECRUITMENT_TARGET_TIER;
            const thumbDescription = [acquisitionLabel, student.favorited ? `목표 ${tierMeaning(tier)}` : null]
              .filter(Boolean)
              .join(", ");
            return (
              <div
                key={student.uid}
                className={cn(
                  "relative",
                  thumbWidth,
                  // A student not yet added brightens on hover, as adding it will.
                  !student.favorited &&
                    "opacity-45 motion-safe:transition-opacity motion-safe:duration-v2-fast motion-safe:ease-v2-standard [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90",
                )}
              >
                <StudentThumb
                  studentUid={student.imageUid ?? student.uid}
                  name={names.name}
                  variant={names.variant}
                  small
                  fluid
                  ref={(node) => {
                    if (node) thumbRefs.current.set(student.uid, node);
                    else thumbRefs.current.delete(student.uid);
                  }}
                  onSelect={() => {
                    if (tierPopover?.open && tierPopover.uid === student.uid) {
                      closeTierPopover();
                      return;
                    }
                    // Adding a student opens the same popover, so the target tier can be set right away.
                    if (!student.favorited) handlers.onFavoriteChange(student.contentUid, student.uid, true);
                    const anchor = thumbRefs.current.get(student.uid) ?? null;
                    tierAnchorRef.current = anchor;
                    setTierPopover({ uid: student.uid, open: true });
                  }}
                  selected={student.favorited}
                  showSelectedIndicator={false}
                  captionPlacement="overlay"
                  overlayOnMobile
                  selectionActionLabel={student.favorited ? "목표 성급 설정" : "관심 학생으로 추가"}
                  favorite={{
                    visible: student.favorited,
                    icon: "favorited",
                    countText: null,
                    accessibleName: "관심 학생",
                  }}
                  scrimAriaLabel={thumbDescription || undefined}
                />
                {/* The favorite heart owns the top-right corner, so the badges stack at the top-left. */}
                {acquisitionLabel || showTier ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0.5 left-0.5 flex flex-col items-start gap-0.5"
                  >
                    {acquisitionLabel ? (
                      <span className="rounded-sm bg-v2-scrim px-1 text-[0.5625rem] leading-4 font-medium text-v2-on-media">
                        {acquisitionLabel}
                      </span>
                    ) : null}
                    {showTier ? (
                      <span className="rounded-sm bg-v2-scrim px-1 text-[0.625rem] leading-4 font-semibold text-v2-on-media">
                        <TierFace tier={tier} iconClassName="size-3" />
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            );
          })}
          {recruited.length > 0 ? (
            <button
              type="button"
              aria-expanded={showRecruited}
              aria-label={showRecruited ? "모집한 학생 접기" : `모집한 학생 ${recruited.length}명 보기`}
              onClick={() => setShowRecruited((current) => !current)}
              className={cn(
                "flex aspect-[5/6] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md bg-v2-inset text-v2-fg-secondary hover:bg-v2-filled-hover",
                thumbWidth,
                v2FocusRing,
              )}
            >
              {showRecruited ? (
                <>
                  <ChevronUpIcon className="size-4" aria-hidden="true" />
                  <span className="text-[0.625rem] leading-none">접기</span>
                </>
              ) : (
                <span className="text-sm leading-none font-semibold tabular-nums">+{recruited.length}</span>
              )}
            </button>
          ) : null}
        </div>

        {plan ? (
          <div className="text-[0.8125rem] text-v2-fg-secondary tabular-nums">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="whitespace-nowrap text-v2-fg-secondary">
                예상 모집 <span className="font-semibold text-v2-fg">{plan.pulls.toLocaleString()}회</span>
              </span>
              {plan.basis === "manual" ? (
                <span className="inline-flex items-center gap-0.5 text-v2-fg-tertiary">
                  <PencilIcon className="size-3" aria-hidden="true" />
                  직접 입력
                </span>
              ) : plan.basisOverridden ? (
                <span className="rounded bg-v2-accent-subtle px-1 text-xs leading-5 font-medium text-v2-accent">
                  {PICKUP_BASIS_SHORT_LABELS[plan.basis]} 기준
                </span>
              ) : null}
              {plan.basis === "manual" || plan.basisOverridden ? (
                <>
                  <span className="text-v2-fg-tertiary">·</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="min-h-0 text-v2-link"
                    onClick={() => handlers.onUpdateEventData(event.uid, { expectedTrials: null, pickupChance: null })}
                  >
                    <ArrowUturnLeftIcon className="size-3" aria-hidden="true" />
                    기본으로
                  </Button>
                </>
              ) : null}
            </p>
          </div>
        ) : null}

        <ResourceLedger entry={entry} className="border-t border-v2-divider pt-3 @2xl:hidden" />
        <div className="grid grid-cols-2 gap-1.5 empty:hidden @2xl:flex">
          {plan ? (
            <Button size="sm" onClick={() => setDialog("target")}>
              <PencilIcon className="size-3" aria-hidden="true" />
              모집 횟수 설정
            </Button>
          ) : null}
          {canComplete ? (
            <Button size="sm" onClick={() => setDialog("complete")}>
              <CheckIcon className="size-3" aria-hidden="true" />
              모집 완료 기록
            </Button>
          ) : null}
          {completed && canRecordCompletion && recordEditLink ? (
            <Link to={recordEditLink} className={v2ButtonClassName({ size: "sm" })}>
              <PencilIcon className="size-3" aria-hidden="true" />
              모집 기록 편집
            </Link>
          ) : null}
          {completed && canRecordCompletion ? (
            <Button
              size="sm"
              variant={confirmingDelete ? "danger" : "secondary"}
              aria-describedby={confirmingDelete ? deleteWarningId : undefined}
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  window.setTimeout(() => setConfirmingDelete(false), 5000);
                  return;
                }
                setConfirmingDelete(false);
                handlers.onDeleteCompletion(event.uid);
              }}
            >
              <TrashIcon className="size-3" aria-hidden="true" />
              {confirmingDelete ? "삭제" : "모집 기록 삭제"}
            </Button>
          ) : null}
        </div>
        {confirmingDelete ? (
          <p id={deleteWarningId} className="text-xs text-v2-danger">
            한 번 더 누르면 모집 기록 전체가 삭제돼요.
          </p>
        ) : null}
      </div>

      {plan ? (
        <>
          <ResourceUsage entry={entry} className="hidden @2xl:flex" />
          <ResourceLedger entry={entry} showUsage={false} className="hidden @2xl:flex" />
        </>
      ) : (
        <span className="hidden pt-px text-right text-sm text-v2-fg-tertiary @2xl:block">—</span>
      )}
      {plan ? null : <span className="hidden @2xl:block" />}
      <span className="hidden justify-self-end pt-0.5 @2xl:block">
        {status ? <StatusPill status={status} /> : null}
      </span>
      {dialogs}
    </div>
  );
});

type TargetBasis = "default" | PyroxenePickupChance | "manual";

function TargetDialog({
  open,
  onClose,
  eventData,
  defaultBasis,
  defaultPulls,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  eventData: PlannerEventData | undefined;
  defaultBasis: PyroxenePickupChance;
  defaultPulls: number | null;
  onSave: (patch: PlannerEventDataPatch) => void;
}) {
  const initialBasis: TargetBasis =
    eventData?.expectedTrials != null ? "manual" : (eventData?.pickupChance ?? "default");
  const [basis, setBasis] = useState<TargetBasis>(initialBasis);
  const [trials, setTrials] = useState(eventData?.expectedTrials ?? defaultPulls ?? 200);
  const inputId = useId();
  // A deprecated basis is offered only while the global basis or this event's own basis uses it.
  const savedBasis = eventData?.pickupChance;
  const options = useMemo(
    () => [
      { value: "default" as const, label: `기본(${PICKUP_BASIS_SHORT_LABELS[defaultBasis]})` },
      ...getOfferedPickupChanceOptions([defaultBasis, savedBasis]).map(({ value }) => ({
        value,
        label: PICKUP_BASIS_SHORT_LABELS[value],
      })),
      { value: "manual" as const, label: "직접 입력" },
    ],
    [defaultBasis, savedBasis],
  );

  return (
    <PlannerDialog
      open={open}
      title="모집 횟수 설정"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            onClick={() =>
              onSave(
                basis === "manual"
                  ? { expectedTrials: trials, pickupChance: null }
                  : { expectedTrials: null, pickupChance: basis === "default" ? null : basis },
              )
            }
          >
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-v2-fg-secondary">이 이벤트의 계산 기준</span>
        <SegmentedChoice label="이 이벤트의 계산 기준" options={options} value={basis} onChange={setBasis} />
      </div>
      {basis === "manual" ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <label htmlFor={inputId} className="text-sm text-v2-fg">
              예상 모집 횟수
            </label>
            <div className="ml-auto w-40">
              <NumberInput
                id={inputId}
                grouped
                min={0}
                step={10}
                value={trials}
                aria-label="예상 모집 횟수"
                onValueChange={setTrials}
              />
            </div>
          </div>
          {defaultPulls !== null ? (
            <p className="text-xs text-v2-fg-tertiary tabular-nums">
              기본 기준이면 {defaultPulls.toLocaleString()}회예요.
            </p>
          ) : null}
          <p className="text-xs text-v2-fg-tertiary">무료 모집과 모집 특전은 이 횟수에서 빼고 계산해요.</p>
        </div>
      ) : null}
    </PlannerDialog>
  );
}

function getAcquisitionLabel(acquisitionType: string | null | undefined): string | null {
  if (!acquisitionType) return null;
  return (STUDENT_ACQUISITION_LABELS as Record<string, string>)[acquisitionType] ?? null;
}
