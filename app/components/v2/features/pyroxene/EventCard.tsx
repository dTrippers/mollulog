import {
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  Square3Stack3DIcon,
  StarIcon,
} from "@heroicons/react/16/solid";
import { forwardRef, useId, useMemo, useState } from "react";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import { getBalanceRange, getPyroxeneEventStatus } from "~/domain/pyroxene-planner-view";
import {
  DEFAULT_RECRUITMENT_TARGET_TIER,
  getRecruitmentTargetCopies,
  getRecruitmentTargetEleph,
  RECRUITMENT_TARGET_TIERS,
  type RecruitmentStacks,
  type RecruitmentTargetTier,
  type RecruitmentTargetTiers,
} from "~/domain/pyroxene-recruitment-goal";
import type { TimelineEntry, TimelinePickupStack } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { NumberInput } from "../../primitives/NumberInput";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { OwnedResourcesDialog, type OwnedResourceValues } from "./OwnedResources";
import { PICKUP_BASIS_SHORT_LABELS, SegmentedChoice } from "./PickupBasis";
import {
  balanceClassName,
  formatAmount,
  formatSigned,
  KST,
  PlannerDialog,
  RangeTag,
  RECRUITMENT_STACK_LABELS,
  ResourceIcon,
  SCHEDULE_GRID_CLASS_NAME,
  ScheduleDateRange,
  StatusPill,
} from "./pyroxene-ui";

const PYROXENE_PER_PULL = 120;

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
  selected: boolean;
  handlers: EventCardHandlers;
};

function tierLabel(tier: RecruitmentTargetTier): string {
  return tier <= 5 ? `★${tier}` : `전무${tier - 5}`;
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
      <Square3Stack3DIcon className="size-3.5" aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
      <span aria-hidden="true" className="relative h-1.5 w-12 overflow-hidden rounded-full bg-v2-inset">
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

function StackDelta({ stack }: { stack: TimelinePickupStack }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-v2-fg-secondary tabular-nums">
      <Square3Stack3DIcon className="size-3.5" aria-label={RECRUITMENT_STACK_LABELS[stack.scope]} />
      {formatSigned(stack.after - stack.before)}
    </span>
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
    selected,
    handlers,
  },
  ref,
) {
  const event = entry.source.event;
  const plan = entry.pickupPlan;
  const [dialog, setDialog] = useState<"target" | "complete" | { tier: string } | null>(null);
  const [showRecruited, setShowRecruited] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
  const range = plan ? getBalanceRange(entry) : null;
  const delta = entry.resourceDelta;
  const pyroxenePulls = Math.max(0, Math.round(-delta.pyroxene / PYROXENE_PER_PULL));
  const since = dayjs(event.since);
  const canComplete = canRecordCompletion && !completed && since.isBefore(dayjs());
  const freeLabel = plan && plan.freePulls > 0 ? plan.freePulls : null;
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

  const tierStudent = typeof dialog === "object" && dialog ? students.find((s) => s.uid === dialog.tier) : undefined;
  const balance = entry.accumulatedResources.pyroxene;
  const until = dayjs(event.until);
  const changedStacks = plan ? plan.stacks.filter((stack) => stack.after !== stack.before) : [];
  // An event with nothing left to choose reads as one line, like the income rows around it.
  const compact = !plan && !completed && !showRecruited && visibleStudents.length === 0;

  const pills =
    completed || ruleIsLegacy || freeLabel ? (
      <>
        {completed ? (
          <span className="inline-flex h-5.5 items-center gap-0.5 rounded-full bg-v2-success-subtle px-2 text-xs font-semibold text-v2-success">
            <CheckIcon className="size-3.5" aria-hidden="true" />
            완료
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
      {tierStudent ? (
        <TierDialog
          key={tierStudent.uid}
          open
          studentName={tierStudent.name}
          tier={(targetTiers[tierStudent.uid] ?? DEFAULT_RECRUITMENT_TARGET_TIER) as RecruitmentTargetTier}
          onClose={() => setDialog(null)}
          onRemove={() => {
            handlers.onFavoriteChange(tierStudent.contentUid, tierStudent.uid, false);
            setDialog(null);
          }}
          onSave={(tier) => {
            const next = { ...targetTiers };
            if (tier === DEFAULT_RECRUITMENT_TARGET_TIER) delete next[tierStudent.uid];
            else next[tierStudent.uid] = tier;
            handlers.onUpdateEventData(event.uid, { targetTiers: next });
            setDialog(null);
          }}
        />
      ) : null}
      <OwnedResourcesDialog
        open={dialog === "complete"}
        title="완료 기록"
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

  if (compact) {
    return (
      <div
        ref={ref}
        tabIndex={selected ? -1 : undefined}
        className={cn(
          SCHEDULE_GRID_CLASS_NAME,
          "min-h-9 items-center rounded-md py-1.5 pr-3 pl-7 text-[0.8125rem] focus:outline-none @lg:px-3",
          selected && "ring-2 ring-v2-focus",
        )}
      >
        <ScheduleDateRange from={since} to={until} />
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-8 truncate text-v2-fg-secondary">{event.name}</span>
          {recruited.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowRecruited(true)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded text-xs whitespace-nowrap text-v2-fg-tertiary hover:text-v2-fg",
                v2FocusRing,
              )}
            >
              모집한 학생 {recruited.length}/{students.length}
              <ChevronDownIcon className="hidden size-3.5 @lg:block" aria-hidden="true" />
            </button>
          ) : null}
        </span>
        <span className="text-right text-v2-fg-tertiary">—</span>
        <span />
        <span />
        {dialogs}
      </div>
    );
  }

  const thumbWidth = plan ? "w-15" : "w-11";

  return (
    <div
      ref={ref}
      tabIndex={selected ? -1 : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-v2-surface px-3 py-3.5 focus:outline-none @lg:grid @lg:grid-cols-[5.75rem_minmax(0,1fr)_6.5rem_11rem_3.75rem] @lg:items-start @lg:gap-x-3 @lg:gap-y-0",
        selected && "ring-2 ring-v2-focus",
      )}
    >
      <div className="hidden flex-col pt-px text-[0.8125rem] font-semibold tabular-nums @lg:flex">
        <span className="flex items-center gap-1.5 text-v2-fg">
          {marker !== null ? <MarkerBadge marker={marker} short={status === "short"} /> : null}
          {since.tz(KST).format("MM/DD")}
        </span>
        <span className={cn("text-xs font-normal text-v2-fg-tertiary", marker !== null && "pl-5.5")}>
          ~{until.tz(KST).format("MM/DD")}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums @lg:hidden">
            {marker !== null ? <MarkerBadge marker={marker} short={status === "short"} /> : null}
            <span className="text-v2-fg">
              {since.tz(KST).format("MM/DD")} ~ {until.tz(KST).format("MM/DD")}
            </span>
            {pills}
          </div>
          {pills ? <div className="hidden flex-wrap items-center gap-2 @lg:flex">{pills}</div> : null}
          <h3 className="text-base leading-snug font-semibold break-keep text-v2-fg">{event.name}</h3>
        </div>

        <div className="flex flex-wrap items-start gap-2.5">
          {visibleStudents.map((student) => {
            const names = splitVisibleStudentName(student.name);
            const tier = (targetTiers[student.uid] ?? DEFAULT_RECRUITMENT_TARGET_TIER) as RecruitmentTargetTier;
            return (
              <div key={student.uid} className={cn(thumbWidth, !student.favorited && "opacity-45")}>
                <StudentThumb
                  studentUid={student.imageUid ?? student.uid}
                  name={names.name}
                  variant={names.variant}
                  small
                  fluid
                  onSelect={() =>
                    student.favorited
                      ? setDialog({ tier: student.uid })
                      : handlers.onFavoriteChange(student.contentUid, student.uid, true)
                  }
                  selected={student.favorited}
                  showSelectedIndicator={false}
                  selectionActionLabel={student.favorited ? "목표 성급 설정" : "목표로 추가"}
                  favorite={{
                    visible: student.favorited,
                    icon: "favorited",
                    countText: null,
                    accessibleName: "관심 학생",
                  }}
                  scrimLabel={
                    student.favorited && tier !== DEFAULT_RECRUITMENT_TARGET_TIER ? tierLabel(tier) : undefined
                  }
                  scrimAriaLabel={student.favorited ? `목표 ${tierLabel(tier)}` : undefined}
                />
              </div>
            );
          })}
          {recruited.length > 0 && !showRecruited ? (
            <button
              type="button"
              onClick={() => setShowRecruited(true)}
              className={cn(
                "inline-flex min-h-7 cursor-pointer items-center gap-0.5 self-start rounded-full bg-v2-inset px-2.5 text-xs text-v2-fg-secondary hover:bg-v2-filled-hover",
                plan ? "mt-4" : "mt-2",
                v2FocusRing,
              )}
            >
              모집한 학생 {recruited.length}
              <ChevronDownIcon className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {plan ? (
          <div className="flex flex-col gap-2 text-[0.8125rem] text-v2-fg-secondary tabular-nums">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="font-semibold whitespace-nowrap text-v2-fg">{plan.pulls.toLocaleString()}회</span>
              {plan.basis === "manual" ? (
                <span className="inline-flex items-center gap-0.5 text-v2-fg-tertiary">
                  <PencilIcon className="size-3" aria-hidden="true" />
                  직접
                </span>
              ) : plan.basisOverridden ? (
                <span className="rounded bg-v2-accent-subtle px-1 text-xs leading-5 font-medium text-v2-accent">
                  {PICKUP_BASIS_SHORT_LABELS[plan.basis]} 기준
                </span>
              ) : null}
              {plan.pullRange ? (
                <span className="inline-flex items-center text-v2-fg-tertiary">
                  {plan.basisOverridden ? <span className="mr-1.5">·</span> : null}
                  <RangeTag />
                  {plan.pullRange.low.toLocaleString()}~{plan.pullRange.high.toLocaleString()}회
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
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] font-semibold text-v2-fg">
              {plan.freePulls > 0 ? (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <StarIcon className="size-3.5 text-v2-perk" aria-label="무료 모집" />
                  {plan.freePulls}회
                </span>
              ) : null}
              {delta.tenTimeTicket < 0 ? (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <ResourceIcon resource="tenTimeTicket" className="size-4" />×{-delta.tenTimeTicket}
                </span>
              ) : null}
              {delta.oneTimeTicket < 0 ? (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <ResourceIcon resource="oneTimeTicket" className="size-4" />×{-delta.oneTimeTicket}
                </span>
              ) : null}
              {pyroxenePulls > 0 ? (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <ResourceIcon resource="pyroxene" className="size-4" />
                  {pyroxenePulls.toLocaleString()}회
                </span>
              ) : null}
            </p>
          </div>
        ) : null}

        {plan ? (
          <div className="flex flex-col gap-1.5 tabular-nums @lg:hidden">
            <p className="text-xs text-v2-fg-tertiary">
              모집 후<span className="ml-2 font-semibold text-v2-fg-secondary">{formatSigned(delta.pyroxene)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("text-xl leading-tight font-bold", balanceClassName(balance))}>
                {formatAmount(balance)}
              </span>
              {range ? (
                <span className="inline-flex items-center text-xs text-v2-fg-tertiary">
                  <RangeTag />
                  {formatAmount(range.low)}~{formatAmount(range.high)}
                </span>
              ) : null}
              {status ? (
                <span className="ml-auto">
                  <StatusPill status={status} />
                </span>
              ) : null}
            </div>
            {plan.stacks.map((stack) => (
              <div key={stack.scope} className="flex items-center justify-between gap-2">
                <StackBar stack={stack} />
                {stack.after !== stack.before ? <StackDelta stack={stack} /> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 empty:hidden @lg:flex">
          {plan ? (
            <Button size="sm" onClick={() => setDialog("target")}>
              <PencilIcon className="size-3" aria-hidden="true" />
              목표 설정
            </Button>
          ) : null}
          {canComplete ? (
            <Button size="sm" onClick={() => setDialog("complete")}>
              <CheckIcon className="size-3" aria-hidden="true" />
              완료 기록
            </Button>
          ) : null}
          {completed && canRecordCompletion ? (
            <Button
              size="sm"
              variant={confirmingDelete ? "danger" : "text"}
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  window.setTimeout(() => setConfirmingDelete(false), 3000);
                  return;
                }
                setConfirmingDelete(false);
                handlers.onDeleteCompletion(event.uid);
              }}
            >
              {confirmingDelete ? "정말 삭제할까요?" : "완료 기록 삭제"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="hidden flex-col items-end gap-1.5 pt-px text-sm font-semibold text-v2-fg tabular-nums @lg:flex">
        {plan ? (
          <span className="inline-flex items-center gap-1">
            <ResourceIcon resource="pyroxene" className="size-4" />
            {formatSigned(delta.pyroxene)}
          </span>
        ) : (
          <span className="text-v2-fg-tertiary">—</span>
        )}
        {changedStacks.map((stack) => (
          <StackDelta key={stack.scope} stack={stack} />
        ))}
      </div>

      <div className="hidden flex-col items-end gap-1 tabular-nums @lg:flex">
        {plan ? (
          <>
            <span className={cn("text-lg leading-tight font-bold", balanceClassName(balance))}>
              {formatAmount(balance)}
            </span>
            {range ? (
              <span className="flex flex-col items-end gap-0.5 text-xs text-v2-fg-tertiary">
                <RangeTag />
                <span>
                  {formatAmount(range.low)} ~ {formatAmount(range.high)}
                </span>
              </span>
            ) : null}
            {status ? <StatusPill status={status} /> : null}
            {plan.stacks.map((stack) => (
              <div key={stack.scope} className="mt-1">
                <StackBar stack={stack} />
              </div>
            ))}
          </>
        ) : null}
      </div>
      <div className="hidden @lg:block" />
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
  const options = useMemo(
    () => [
      { value: "default" as const, label: `기본(${PICKUP_BASIS_SHORT_LABELS[defaultBasis]})` },
      { value: "average" as const, label: "평균" },
      { value: "average_pity" as const, label: "평균+천장" },
      { value: "ceil" as const, label: "천장" },
      { value: "manual" as const, label: "직접" },
    ],
    [defaultBasis],
  );

  return (
    <PlannerDialog
      open={open}
      title="목표 설정"
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

function TierDialog({
  open,
  studentName,
  tier,
  onClose,
  onRemove,
  onSave,
}: {
  open: boolean;
  studentName: string;
  tier: RecruitmentTargetTier;
  onClose: () => void;
  onRemove: () => void;
  onSave: (tier: RecruitmentTargetTier) => void;
}) {
  const [value, setValue] = useState(tier);
  const copies = getRecruitmentTargetCopies(value);
  return (
    <PlannerDialog
      open={open}
      title={`${splitVisibleStudentName(studentName).name} 목표 성급`}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger-subtle" className="mr-auto" onClick={onRemove}>
            목표 해제
          </Button>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => onSave(value)}>
            저장
          </Button>
        </>
      }
    >
      <SegmentedChoice
        label="목표 성급"
        variant="tiles"
        value={String(value)}
        onChange={(next) => setValue(Number(next) as RecruitmentTargetTier)}
        options={RECRUITMENT_TARGET_TIERS.map((option) => ({
          value: String(option),
          label:
            option <= 5 ? (
              <>
                <StarIcon className="size-3.5" aria-hidden="true" />
                {option}
              </>
            ) : (
              `전무 ${option - 5}`
            ),
        }))}
      />
      <p className="text-xs text-v2-fg-secondary tabular-nums">
        필요 엘레프 {getRecruitmentTargetEleph(value).toLocaleString()}개 · 같은 학생을 {copies}번 모집해야 해요
      </p>
      <p className="text-xs text-v2-fg-tertiary">갖고 있지 않은 학생을 ★3부터 모집만으로 키운다고 보고 계산해요.</p>
    </PlannerDialog>
  );
}
