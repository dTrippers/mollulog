import { CheckCircleIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon, EnvelopeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type LoaderFunctionArgs, type MetaFunction, redirect, useLoaderData } from "react-router";
import { RECRUITMENT_STACK_LABELS, ResourceIcon } from "~/components/v2/features/pyroxene/pyroxene-ui";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { PageActionBar, PageMain } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import {
  CALL_CHARGE_CEILING,
  CALL_CHARGE_MIDPOINT,
  type CallChargeAdjustment,
  simulateCallChargeTenPull,
} from "~/domain/recruitment-call-charge-simulation";
import {
  CALL_CHARGE_ANCHOR_TIMELINE_UID,
  getRecruitmentChargeScope,
  getRecruitmentRuleSet,
  type RecruitmentChargeScope,
  type RecruitmentRuleSet,
} from "~/domain/recruitment-cost";
import {
  buildRecruitmentPoolSnapshotFromBaql,
  drawRecruitmentTenPull,
  type RecruitmentDrawResult,
  type RecruitmentPoolSnapshot,
  type SimulationStudent,
} from "~/domain/recruitment-simulator";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { cn } from "~/lib/utils";
import { getRecruitmentGroupByUid, getRecruitmentPoolStudents } from "~/models/recruitment";
import { getTimelineContent } from "~/models/timeline-content.server";

type SimulatedResult = RecruitmentDrawResult & {
  // 1-based position across the whole simulation.
  index: number;
  adjustment: CallChargeAdjustment | null;
  resetCharge: boolean;
};

type PullRow = {
  id: string;
  type: "pull";
  startCount: number;
  results: SimulatedResult[];
};

type ExchangeRow = {
  id: string;
  type: "exchange";
  count: number;
  selectedStudentUid: string | null;
};

type SimulatorRow = PullRow | ExchangeRow;

type TargetStatus = { kind: "running" } | { kind: "stopped" } | { kind: "found"; index: number };

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) throw new Response("Not Found", { status: 404 });

  const { env, ctx } = context.cloudflare;
  const content = await getTimelineContent(env, timelineUid, { ctx });
  if (content?.contentType === "live")
    return redirect(`/lives/${timelineUid}${new URL(request.url).search}`, { status: 301 });
  if (!content?.recruitmentGroupUid) throw new Response("Not Found", { status: 404 });

  const [recruitmentGroup, students, callChargeAnchor] = await Promise.all([
    getRecruitmentGroupByUid(env, content.recruitmentGroupUid),
    getRecruitmentPoolStudents(env),
    getTimelineContent(env, CALL_CHARGE_ANCHOR_TIMELINE_UID, { ctx }),
  ]);
  if (!recruitmentGroup) throw new Response("Not Found", { status: 404 });
  if (!callChargeAnchor) {
    throw new Error(`call-charge anchor timeline is missing: ${CALL_CHARGE_ANCHOR_TIMELINE_UID}`);
  }

  const snapshot = buildRecruitmentPoolSnapshotFromBaql({ recruitmentGroup, students });
  const ruleSet = getRecruitmentRuleSet(snapshot.startAt, callChargeAnchor.startAt);
  if (ruleSet === "call_charge_v1") {
    const unscoped = snapshot.pickupStudents.find((student) => !getRecruitmentChargeScope(student.recruitmentType));
    if (unscoped) {
      throw new Error(`pickup ${unscoped.uid} has no call-charge scope for type ${unscoped.recruitmentType}`);
    }
  }

  return { eventName: content.name, snapshot, ruleSet };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const title = loaderData?.eventName ? `${loaderData.eventName} - 모집 시뮬레이션` : "모집 시뮬레이션";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: "블루 아카이브 모집 결과를 저장 없이 시뮬레이션해보세요." },
  ];
};

const LEGACY_EXCHANGE_INTERVAL = 200;
const UNTIL_TARGET_INTERVAL_MS = 500;
const REVEAL_DELAY_MS = 450;

function chargeScopeOf(student: RecruitmentPoolSnapshot["pickupStudents"][number]): RecruitmentChargeScope {
  const scope = getRecruitmentChargeScope(student.recruitmentType);
  // The loader rejects call-charge periods with an unscoped pickup, so this only guards the type.
  if (!scope) throw new Error(`pickup ${student.uid} has no call-charge scope`);
  return scope;
}

function calculatePyroxeneCost(totalRecruitmentCount: number) {
  return Math.floor(totalRecruitmentCount / 10) * 1200;
}

function formatTier3Rate(tier3Count: number, totalRecruitmentCount: number) {
  return totalRecruitmentCount === 0 ? "0.00%" : `${((tier3Count / totalRecruitmentCount) * 100).toFixed(2)}%`;
}

function getNonPickupPoolStudents(snapshot: RecruitmentPoolSnapshot) {
  const pickupStudentUids = new Set(snapshot.pickupStudents.map((student) => student.uid));
  return [
    ...snapshot.nonPickupStudentsByTier.tier3,
    ...snapshot.nonPickupStudentsByTier.tier2,
    ...snapshot.nonPickupStudentsByTier.tier1,
  ].filter((student) => !pickupStudentUids.has(student.uid));
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function EventRecruitmentSimulator() {
  const { snapshot, ruleSet } = useLoaderData<typeof loader>();
  const [selectedPickupStudentUid, setSelectedPickupStudentUid] = useState<string | null>(null);
  const [targetChooserOpen, setTargetChooserOpen] = useState(false);
  const [targetStudentUid, setTargetStudentUid] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<TargetStatus | null>(null);
  const [targetSearchText, setTargetSearchText] = useState("");
  const [rows, setRows] = useState<SimulatorRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tier3Count, setTier3Count] = useState(0);
  const [charge, setCharge] = useState(0);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  // The repeat timer reads the latest totals synchronously, so they live in a ref beside the rendered state.
  const simulationRef = useRef({ total: 0, tier3: 0, charge: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const nonPickupPoolStudents = useMemo(() => getNonPickupPoolStudents(snapshot), [snapshot]);
  const callCharge = ruleSet === "call_charge_v1";
  const pickupScopes = useMemo(
    () => (callCharge ? new Set(snapshot.pickupStudents.map(chargeScopeOf)) : new Set<RecruitmentChargeScope>()),
    [callCharge, snapshot],
  );
  const mixedScopes = pickupScopes.size > 1;
  const selectedPickup = snapshot.pickupStudents.find((student) => student.uid === selectedPickupStudentUid) ?? null;
  const stackScope: RecruitmentChargeScope | null = !callCharge
    ? null
    : selectedPickup
      ? chargeScopeOf(selectedPickup)
      : mixedScopes
        ? null
        : ([...pickupScopes][0] ?? null);
  const stackLabel = selectedPickup && callCharge ? RECRUITMENT_STACK_LABELS[chargeScopeOf(selectedPickup)] : null;

  const clearRepeatTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const resetSimulation = () => {
    clearRepeatTimer();
    simulationRef.current = { total: 0, tier3: 0, charge: 0 };
    setRows([]);
    setTotalCount(0);
    setTier3Count(0);
    setCharge(0);
    setTargetStudentUid(null);
    setTargetStatus(null);
    setTargetChooserOpen(false);
    setTargetSearchText("");
  };

  // Draws ten slots and appends them. Returns the position of the target student when one appeared.
  const appendTenPull = (pickupUid: string, targetUid: string | null): number | null => {
    const current = simulationRef.current;
    let drawn: Omit<SimulatedResult, "index">[];
    let nextCharge = current.charge;
    if (callCharge) {
      const pull = simulateCallChargeTenPull({
        snapshot,
        activePickupStudentUid: pickupUid,
        startingCharge: current.charge,
      });
      drawn = pull.results;
      nextCharge = pull.charge;
    } else {
      drawn = drawRecruitmentTenPull({ snapshot, activePickupStudentUid: pickupUid }).map((result) => ({
        ...result,
        adjustment: null,
        resetCharge: false,
      }));
    }

    const startCount = current.total + 1;
    const results = drawn.map((result, offset) => ({ ...result, index: startCount + offset }));
    const nextTotal = current.total + results.length;
    const newRows: SimulatorRow[] = [{ id: `pull-${startCount}`, type: "pull", startCount, results }];
    if (!callCharge && nextTotal % LEGACY_EXCHANGE_INTERVAL === 0) {
      newRows.push({ id: `exchange-${nextTotal}`, type: "exchange", count: nextTotal, selectedStudentUid: null });
    }

    simulationRef.current = {
      total: nextTotal,
      tier3: current.tier3 + results.filter((result) => result.rarity === 3).length,
      charge: nextCharge,
    };
    setRows((currentRows) => [...currentRows, ...newRows]);
    setTotalCount(simulationRef.current.total);
    setTier3Count(simulationRef.current.tier3);
    setCharge(simulationRef.current.charge);

    if (!targetUid) return null;
    return results.find((result) => result.student.uid === targetUid)?.index ?? null;
  };

  const handleTenPull = () => {
    if (!selectedPickupStudentUid || intervalRef.current) return;
    const foundIndex = appendTenPull(selectedPickupStudentUid, targetStudentUid);
    // A target that shows up in a manual pull after stopping still counts as drawn.
    if (foundIndex !== null && targetStatus?.kind === "stopped") setTargetStatus({ kind: "found", index: foundIndex });
    trackGoogleAnalyticsEvent("recruitment_simulated", { mode: "ten_pull" });
  };

  const handleRunUntilTarget = (studentUid: string) => {
    if (!selectedPickupStudentUid) return;
    clearRepeatTimer();
    setTargetStudentUid(studentUid);
    setTargetChooserOpen(false);
    setTargetSearchText("");
    trackGoogleAnalyticsEvent("recruitment_simulated", { mode: "until_target" });

    const pickupUid = selectedPickupStudentUid;
    const firstFound = appendTenPull(pickupUid, studentUid);
    if (firstFound !== null) {
      setTargetStatus({ kind: "found", index: firstFound });
      return;
    }

    setTargetStatus({ kind: "running" });
    intervalRef.current = setInterval(() => {
      const foundIndex = appendTenPull(pickupUid, studentUid);
      if (foundIndex === null) return;
      clearRepeatTimer();
      setTargetStatus({ kind: "found", index: foundIndex });
    }, UNTIL_TARGET_INTERVAL_MS);
  };

  const handleStop = () => {
    if (!intervalRef.current) return;
    clearRepeatTimer();
    setTargetStatus({ kind: "stopped" });
  };

  const handleResetRequest = () => {
    handleStop();
    setResetDialogOpen(true);
  };

  const handleResetConfirm = () => {
    resetSimulation();
    setResetDialogOpen(false);
  };

  const handleSelectPickupStudent = (studentUid: string) => {
    resetSimulation();
    setSelectedPickupStudentUid(studentUid);
  };

  const selectExchangeStudent = (rowId: string, studentUid: string) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId && row.type === "exchange" ? { ...row, selectedStudentUid: studentUid } : row,
      ),
    );
  };

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  // As in 1.0, every pull brings the recruit buttons back into view under the newest results.
  useLayoutEffect(() => {
    if (totalCount === 0) return;
    const actions = actionsRef.current;
    if (!actions) return;
    // The floating summary bar covers the bottom of the viewport, so the buttons stop just above it.
    const bar = actionBarRef.current;
    const barCover = bar ? bar.offsetHeight + (Number.parseFloat(getComputedStyle(bar).bottom) || 0) : 0;
    actions.style.scrollMarginBottom = `${barCover + 12}px`;
    actions.scrollIntoView({ block: "end", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [totalCount]);

  if (snapshot.pickupStudents.length === 0) {
    return (
      <PageMain>
        <div className="w-full max-w-3xl">
          <div className="rounded-lg bg-v2-surface p-v2-block-p text-center">
            <SparklesIcon className="mx-auto size-8 text-v2-fg-tertiary" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-v2-fg">시뮬레이션할 픽업 학생이 없어요</h2>
            <p className="mt-1 text-sm text-v2-fg-secondary">
              이 모집 기간에는 모집 시뮬레이션에 사용할 픽업 학생 정보가 없어요.
            </p>
          </div>
        </div>
      </PageMain>
    );
  }

  const running = targetStatus?.kind === "running";
  const pullDisabled = selectedPickupStudentUid === null || running;
  const targetStudent =
    targetStudentUid && targetStatus
      ? (snapshot.pickupStudents.find((student) => student.uid === targetStudentUid) ??
        nonPickupPoolStudents.find((student) => student.uid === targetStudentUid) ??
        null)
      : null;
  const highlightedIndex = targetStatus?.kind === "found" ? targetStatus.index : null;

  return (
    <PageMain>
      <div className="w-full max-w-3xl space-y-v2-section-gap">
        <section className="space-y-v2-block-gap">
          <h2 className="text-base font-semibold text-v2-fg">픽업 학생</h2>
          <div className="-mx-v2-block-p flex gap-2 overflow-x-auto px-v2-block-p pb-1">
            {snapshot.pickupStudents.map((student) => {
              const selected = selectedPickupStudentUid === student.uid;
              return (
                <div key={student.uid} className="w-20 shrink-0">
                  <RecruitmentStudentThumb
                    student={student}
                    selected={selected}
                    dimUnselected={selectedPickupStudentUid !== null}
                    onSelect={() => handleSelectPickupStudent(student.uid)}
                    accessibleDetail={mixedScopes ? RECRUITMENT_STACK_LABELS[chargeScopeOf(student)] : undefined}
                  />
                  {mixedScopes ? (
                    <p
                      className={cn(
                        "mt-1 text-center text-[0.6875rem] leading-4",
                        selected ? "font-semibold text-v2-accent" : "text-v2-fg-tertiary",
                      )}
                    >
                      {RECRUITMENT_STACK_LABELS[chargeScopeOf(student)]}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <RecruitmentRuleLine ruleSet={ruleSet} stackScope={stackScope} />
        </section>

        <section className="space-y-v2-block-gap">
          <div>
            <h2 className="text-base font-semibold text-v2-fg">모집 결과</h2>
            <p className="mt-1 text-sm text-v2-fg-secondary tabular-nums">총 {totalCount.toLocaleString()}회 모집</p>
          </div>
          {!selectedPickupStudentUid ? (
            <div className="rounded-lg bg-v2-surface px-v2-block-p py-7 text-center text-sm text-v2-fg-secondary">
              픽업 학생을 선택해주세요
            </div>
          ) : (
            <>
              {rows.length > 0 ? (
                <div className="space-y-v2-block-gap">
                  {rows.map((row) =>
                    row.type === "exchange" ? (
                      <RecruitmentPointExchangeRow
                        key={row.id}
                        row={row}
                        pickupStudents={snapshot.pickupStudents}
                        onSelect={selectExchangeStudent}
                      />
                    ) : (
                      <RecruitmentPullRow
                        key={row.id}
                        row={row}
                        activePickupStudentUid={selectedPickupStudentUid}
                        stackLabel={stackLabel}
                        targetStudentUid={targetStudentUid}
                        highlightedIndex={highlightedIndex}
                      />
                    ),
                  )}
                </div>
              ) : null}
              <div ref={actionsRef} className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleTenPull} disabled={pullDisabled}>
                  10회 모집
                </Button>
                <Button onClick={() => setTargetChooserOpen((open) => !open)} disabled={pullDisabled}>
                  특정 학생을 뽑을 때까지 모집
                </Button>
              </div>
              {targetChooserOpen ? (
                <TargetStudentChooser
                  pickupStudents={snapshot.pickupStudents}
                  poolStudents={nonPickupPoolStudents}
                  selectedStudentUid={targetStudentUid}
                  searchText={targetSearchText}
                  onSearchTextChange={setTargetSearchText}
                  onSelect={handleRunUntilTarget}
                  onClose={() => setTargetChooserOpen(false)}
                />
              ) : null}
            </>
          )}
        </section>

        {selectedPickupStudentUid && totalCount > 0 ? (
          <PageActionBar
            ref={actionBarRef}
            tone="elevated"
            className="bottom-[calc(var(--mobile-nav-height)+0.5rem)] gap-y-3 lg:bottom-4"
            summary={
              <div className="flex flex-col">
                <span className="font-semibold text-v2-fg">총 {totalCount.toLocaleString()}회 모집</span>
                <span className="inline-flex items-center gap-1 text-xs font-normal text-v2-fg-tertiary">
                  소비한 청휘석
                  <ResourceIcon resource="pyroxene" className="size-4" />
                  {calculatePyroxeneCost(totalCount).toLocaleString()}개
                </span>
                <span className="text-xs font-normal text-v2-fg-tertiary">
                  3성 학생 비율 {formatTier3Rate(tier3Count, totalCount)}
                </span>
              </div>
            }
            details={
              stackLabel || targetStudent ? (
                <div className="flex min-w-0 items-center gap-3 border-t border-v2-divider pt-3 sm:gap-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                  {stackLabel ? (
                    <ChargeStatus
                      stackLabel={stackLabel}
                      charge={charge}
                      compact={targetStudent !== null}
                      className={cn(targetStudent && "border-r border-v2-divider pr-3 sm:pr-4")}
                    />
                  ) : null}
                  {targetStudent && targetStatus ? (
                    <TargetStatusCell student={targetStudent} status={targetStatus} />
                  ) : null}
                </div>
              ) : null
            }
          >
            <Button onClick={handleStop} disabled={!running}>
              중지
            </Button>
            <Button variant="danger" onClick={handleResetRequest}>
              초기화
            </Button>
          </PageActionBar>
        ) : null}
      </div>

      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)} title="결과를 모두 지울까요?" size="sm">
        <p className="text-sm text-v2-fg-secondary">지금까지의 모집 결과 {totalCount.toLocaleString()}회가 사라져요.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setResetDialogOpen(false)}>취소</Button>
          <Button variant="danger" onClick={handleResetConfirm}>
            초기화
          </Button>
        </div>
      </Dialog>
    </PageMain>
  );
}

const chipClassName = "mr-2 inline-flex h-5.5 items-center rounded-full px-2 align-top text-xs font-semibold";
const callChargeRuleSentence =
  "스택이 100이 되는 모집에서 50% 확률로, 200이 되는 모집에서 반드시 선택한 픽업 학생을 얻어요.";

function RecruitmentRuleLine({
  ruleSet,
  stackScope,
}: {
  ruleSet: RecruitmentRuleSet;
  stackScope: RecruitmentChargeScope | null;
}) {
  if (ruleSet === "legacy_points") {
    return (
      <p className="text-xs leading-5.5 text-v2-fg-secondary">
        <span className={cn(chipClassName, "bg-v2-inset text-v2-fg-secondary")}>개편 전 규칙</span>
        200회마다 모집 포인트로 픽업 학생 한 명을 고를 수 있어요.
      </p>
    );
  }

  if (!stackScope) {
    return (
      <p className="text-xs text-v2-fg-secondary">
        픽업 학생에 따라 모집 스택이나 특별 스택이 쌓여요. {callChargeRuleSentence}
      </p>
    );
  }

  return (
    <p className="text-xs leading-5.5 text-v2-fg-secondary">
      <span className={cn(chipClassName, "bg-v2-accent-subtle text-v2-accent")}>
        {RECRUITMENT_STACK_LABELS[stackScope]}
      </span>
      {callChargeRuleSentence}
    </p>
  );
}

function ChargeStatus({
  stackLabel,
  charge,
  compact,
  className,
}: {
  stackLabel: string;
  charge: number;
  compact: boolean;
  className?: string;
}) {
  const beforeMidpoint = charge < CALL_CHARGE_MIDPOINT;
  const nextAdjustment = beforeMidpoint ? CALL_CHARGE_MIDPOINT : CALL_CHARGE_CEILING;
  const remaining = nextAdjustment - charge;
  const outcome = beforeMidpoint ? "50% 확률로 픽업" : "픽업 확정";
  return (
    <div className={cn("shrink-0", className)}>
      <p className="text-sm font-semibold text-v2-fg tabular-nums">
        {stackLabel} {charge.toLocaleString()}
      </p>
      <p className={cn("text-xs tabular-nums", remaining <= 10 ? "text-v2-accent" : "text-v2-fg-tertiary")}>
        {nextAdjustment}까지 {remaining}회
        {/* With a target beside it, the mobile row keeps only the count before the midpoint. */}
        <span className={cn(compact && beforeMidpoint && "hidden sm:inline")}> · {outcome}</span>
      </p>
    </div>
  );
}

function TargetStatusCell({ student, status }: { student: SimulationStudent; status: TargetStatus }) {
  const { name, variant } = splitVisibleStudentName(student.name);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="w-8 shrink-0">
        <StudentThumb
          studentUid={student.uid}
          name={name}
          variant={variant}
          showCaption={false}
          showRecruitmentLabel={false}
          fluid
        />
      </div>
      <div className="min-w-0">
        <p className="sr-only text-[0.6875rem] leading-4 text-v2-fg-tertiary sm:not-sr-only">목표 학생</p>
        <p className="truncate text-sm font-semibold text-v2-fg">{student.name}</p>
        {status.kind === "running" ? (
          <p className="flex items-center gap-1 text-xs text-v2-fg-secondary">
            <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            뽑을 때까지 모집 중
          </p>
        ) : status.kind === "stopped" ? (
          <p className="text-xs text-v2-fg-secondary">뽑기 전에 중지했어요</p>
        ) : (
          <p className="flex items-center gap-1 text-xs font-semibold text-v2-success tabular-nums">
            <CheckCircleIcon className="size-3.5" aria-hidden="true" />
            {status.index.toLocaleString()}회째에 뽑았어요
          </p>
        )}
      </div>
    </div>
  );
}

const emptyFavorite: FavoriteLabelState = {
  visible: false,
  icon: "unfavorited",
  countText: null,
  accessibleName: "관심 학생",
};

function getTierAccentClassName(rarity: number) {
  if (rarity <= 1) return "bg-v2-recruitment-tier-1";
  if (rarity === 2) return "bg-v2-recruitment-tier-2";
  return "bg-v2-recruitment-tier-3";
}

function RecruitmentStudentThumb({
  student,
  selected = false,
  dimUnselected = false,
  onSelect,
  accessibleDetail,
}: {
  student: SimulationStudent;
  selected?: boolean;
  dimUnselected?: boolean;
  onSelect?: () => void;
  // Joins the button's accessible name, for information shown outside the thumbnail.
  accessibleDetail?: string;
}) {
  const { name, variant } = splitVisibleStudentName(student.name);
  return (
    <StudentThumb
      studentUid={student.uid}
      name={name}
      variant={variant}
      recruitmentLabel=""
      isNew={false}
      favorite={emptyFavorite}
      showRecruitmentLabel={false}
      onSelect={onSelect}
      selected={selected}
      selectionActionLabel="선택"
      grayscaleWhenUnselected={dimUnselected}
      scrimAriaLabel={accessibleDetail}
      captionPlacement="overlay"
      overlayOnMobile
      fluid
    />
  );
}

function TargetStudentChooser({
  pickupStudents,
  poolStudents,
  selectedStudentUid,
  searchText,
  onSearchTextChange,
  onSelect,
  onClose,
}: {
  pickupStudents: SimulationStudent[];
  poolStudents: SimulationStudent[];
  selectedStudentUid: string | null;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelect: (studentUid: string) => void;
  onClose: () => void;
}) {
  const normalizedSearchText = normalizeSearchText(searchText);
  const searchedStudents = normalizedSearchText
    ? poolStudents.filter(
        (student) =>
          normalizeSearchText(student.name).includes(normalizedSearchText) ||
          normalizeSearchText(student.uid).includes(normalizedSearchText),
      )
    : [];

  return (
    <section
      className="space-y-v2-block-gap rounded-lg bg-v2-accent-subtle p-v2-block-p"
      aria-labelledby="target-student-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="target-student-title" className="text-sm font-semibold text-v2-fg">
            목표 학생을 선택해주세요
          </h3>
          <p className="mt-1 text-xs text-v2-fg-secondary">
            픽업 학생을 바로 고르거나, 픽업 외 학생을 검색할 수 있어요.
          </p>
        </div>
        <Button size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pickupStudents.map((student) => (
          <div key={student.uid} className="w-20 shrink-0">
            <RecruitmentStudentThumb
              student={student}
              selected={selectedStudentUid === student.uid}
              dimUnselected={selectedStudentUid !== null}
              onSelect={() => onSelect(student.uid)}
            />
          </div>
        ))}
      </div>
      <SearchInput
        aria-label="픽업 외 목표 학생 검색"
        placeholder="픽업 외 학생 검색"
        value={searchText}
        onChange={onSearchTextChange}
      />
      {normalizedSearchText ? (
        searchedStudents.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {searchedStudents.map((student) => (
              <div key={student.uid} className="w-20 shrink-0">
                <RecruitmentStudentThumb
                  student={student}
                  selected={selectedStudentUid === student.uid}
                  dimUnselected={selectedStudentUid !== null}
                  onSelect={() => onSelect(student.uid)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-v2-fg-secondary">검색 결과가 없어요.</p>
        )
      ) : null}
    </section>
  );
}

function RecruitmentPointExchangeRow({
  row,
  pickupStudents,
  onSelect,
}: {
  row: ExchangeRow;
  pickupStudents: SimulationStudent[];
  onSelect: (rowId: string, studentUid: string) => void;
}) {
  return (
    <div className="space-y-v2-block-gap rounded-lg bg-v2-accent-subtle p-v2-block-p">
      <div>
        <h3 className="text-sm font-semibold text-v2-fg">{row.count.toLocaleString()}회 모집 포인트 교환</h3>
        <p className="mt-1 text-xs text-v2-fg-secondary">픽업 학생 중 한 명을 선택할 수 있어요.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pickupStudents.map((student) => (
          <div key={student.uid} className="w-20 shrink-0">
            <RecruitmentStudentThumb
              student={student}
              selected={row.selectedStudentUid === student.uid}
              dimUnselected={row.selectedStudentUid !== null}
              onSelect={() => onSelect(row.id, student.uid)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function describeChargeEvent(result: SimulatedResult, stackLabel: string): string | null {
  const position = `${result.index.toLocaleString()}회째`;
  if (result.adjustment === CALL_CHARGE_MIDPOINT) {
    return result.resetCharge
      ? `${position}: ${stackLabel} 100에서 선택한 픽업 학생이 나와 스택이 0이 됐어요`
      : `${position}: ${stackLabel} 100에서 선택한 픽업 학생 대신 다른 ★3 학생이 나왔어요`;
  }
  if (result.adjustment === CALL_CHARGE_CEILING) {
    return `${position}: ${stackLabel} 200에서 선택한 픽업 학생이 확정으로 나와 스택이 0이 됐어요`;
  }
  if (result.resetCharge) return `${position}: 선택한 픽업 학생이 나와 ${stackLabel}이 0이 됐어요`;
  return null;
}

function RecruitmentPullRow({
  row,
  activePickupStudentUid,
  stackLabel,
  targetStudentUid,
  highlightedIndex,
}: {
  row: PullRow;
  activePickupStudentUid: string;
  stackLabel: string | null;
  targetStudentUid: string | null;
  highlightedIndex: number | null;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const notes = stackLabel
    ? row.results.map((result) => describeChargeEvent(result, stackLabel)).filter((note) => note !== null)
    : [];
  const endCount = row.startCount + row.results.length - 1;

  return (
    <div className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="mb-v2-list-gap flex flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-baseline">
        <h3 className="text-xs font-semibold text-v2-fg-secondary tabular-nums">
          {row.startCount.toLocaleString()}회 ~ {endCount.toLocaleString()}회
        </h3>
        {revealed
          ? notes.map((note) => (
              <p key={note} className="text-xs text-v2-accent">
                {note}
              </p>
            ))
          : null}
      </div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {row.results.map((result) => (
          <RecruitmentResultCard
            key={result.index}
            result={result}
            revealed={revealed}
            selectedPickup={result.pickup && result.student.uid === activePickupStudentUid}
            target={result.index === highlightedIndex && result.student.uid === targetStudentUid}
          />
        ))}
      </div>
    </div>
  );
}

function RecruitmentResultCard({
  result,
  revealed,
  selectedPickup,
  target,
}: {
  result: SimulatedResult;
  revealed: boolean;
  selectedPickup: boolean;
  target: boolean;
}) {
  const { name, variant } = splitVisibleStudentName(result.student.name);
  const label = [
    `★${result.rarity} ${result.student.name}`,
    selectedPickup ? "픽업" : null,
    result.adjustment ? `스택 ${result.adjustment} 보정` : null,
    target ? "목표 학생" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div role="img" aria-label={label} className="min-w-0 space-y-1">
      <div
        className={cn(
          "relative rounded-md",
          revealed && target && "ring-2 ring-v2-accent ring-offset-1 ring-offset-v2-surface",
        )}
      >
        <div
          className={cn(
            "transition-opacity duration-v2-base motion-reduce:transition-none",
            revealed ? "opacity-100" : "opacity-0",
          )}
        >
          <StudentThumb
            studentUid={result.student.uid}
            name={name}
            variant={variant}
            recruitmentLabel={selectedPickup ? "픽업" : ""}
            isNew={false}
            favorite={emptyFavorite}
            showRecruitmentLabel={selectedPickup}
            captionPlacement="overlay"
            overlayOnMobile
            fluid
          />
        </div>
        {revealed && (target || result.adjustment) ? (
          <div aria-hidden="true" className="absolute top-0.5 left-0.5 flex flex-col items-start gap-0.5">
            {target ? (
              <span className="rounded-sm bg-v2-accent px-1 text-[0.5625rem] leading-4 font-semibold text-v2-canvas">
                목표
              </span>
            ) : null}
            {result.adjustment ? (
              <span className="rounded-sm bg-v2-accent-subtle px-1 text-[0.5625rem] leading-4 font-semibold text-v2-accent">
                스택 {result.adjustment}
              </span>
            ) : null}
          </div>
        ) : null}
        {!revealed ? (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-md border border-v2-control-border bg-v2-inset",
              getEnvelopeColorClassName(result.rarity),
            )}
          >
            <EnvelopeIcon className="size-8" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className={cn("h-1.5 rounded-full", getTierAccentClassName(result.rarity))} />
    </div>
  );
}

function getEnvelopeColorClassName(rarity: 1 | 2 | 3) {
  if (rarity === 1) return "text-v2-recruitment-tier-1";
  if (rarity === 2) return "text-v2-recruitment-tier-2";
  return "text-v2-recruitment-tier-3";
}
