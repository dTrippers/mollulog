import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/primitives";
import type { EventShopState } from "~/domain/event-shop-state";
import type { PlannerDayResources, PlannerPeriod } from "~/domain/integrated-planner";
import {
  buildPlannerMonthDays,
  buildPlannerRecruitmentCandidatesForDate,
  groupPlannerPeriods,
  shiftPlannerMonth,
} from "~/domain/integrated-planner";
import PlannerCalendarWeek, {
  DailyResourceChanges,
  type PlannerForecastStatus,
  RESOURCE_PRESENTATION,
} from "./PlannerCalendarWeek";
import PlannerQuickEdit, { type PlannerQuickEditEntry, type PlannerQuickEditKind } from "./PlannerQuickEdit";
import PlannerRecruitmentEditor, {
  type PlannerRecruitmentSavedState,
  type PlannerRecruitmentSaveInput,
  type PlannerRecruitmentSaveResult,
} from "./PlannerRecruitmentEditor";
import PlannerShopOwnedQuantityEditor, { type PlannerShopContent } from "./PlannerShopOwnedQuantityEditor";
import PlannerShopSummary from "./PlannerShopSummary";

export type PlannerCalendarShopPlan = {
  timelineUid: string;
  shopStateUid: string | null;
  name: string;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDate: string | null;
  content: PlannerShopContent | null;
  state: EventShopState | null;
  defaultState: EventShopState | null;
  conflict: boolean;
};

type PlannerCalendarProps = {
  initialMonth: string;
  periods: PlannerPeriod[];
  publicPeriods: PlannerPeriod[];
  dailyResources: Record<string, PlannerDayResources>;
  forecastStatus: PlannerForecastStatus;
  statusMessages: string[];
  isSignedIn: boolean;
  timeZone: string;
  oneOffEntries: PlannerQuickEditEntry[];
  guestStorageStatus: "ready" | "memory" | "corrupt" | "loading";
  recruitmentSavedStates: PlannerRecruitmentSavedState[];
  recruitmentIsSaving: boolean;
  recruitmentSaveResult: PlannerRecruitmentSaveResult | null;
  onSaveRecruitment: (input: PlannerRecruitmentSaveInput) => void;
  shopPlans: PlannerCalendarShopPlan[];
  onShopSaved: (shopStateUid: string, state: EventShopState) => void;
  monthCount: number;
  onLoadMore: () => void;
};

type PlannerCalendarDialogView =
  | "summary"
  | "actions"
  | "quick-edit"
  | "recruitment-edit"
  | "shop-choice"
  | "shop-edit";
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function isOnDate(period: PlannerPeriod, dateKey: string): boolean {
  return period.startDate <= dateKey && period.endDate >= dateKey;
}

function phaseName(period: PlannerPeriod): string {
  if (period.kind === "recruitment") return "모집";
  if (period.kind === "shop") return "상점 교환";
  return "이벤트 플레이";
}

function formatPeriodRange(period: PlannerPeriod): string {
  return `${formatDate(period.startDate)}–${formatDate(period.endDate)}`;
}

export default function PlannerCalendar({
  initialMonth,
  periods,
  publicPeriods,
  dailyResources,
  forecastStatus,
  statusMessages,
  isSignedIn,
  timeZone,
  oneOffEntries,
  guestStorageStatus,
  recruitmentSavedStates,
  recruitmentIsSaving,
  recruitmentSaveResult,
  onSaveRecruitment,
  shopPlans,
  onShopSaved,
  monthCount,
  onLoadMore,
}: PlannerCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [focusedPeriodKey, setFocusedPeriodKey] = useState<string | null>(null);
  const [eventContextUid, setEventContextUid] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<PlannerCalendarDialogView>("summary");
  const [quickEditKind, setQuickEditKind] = useState<PlannerQuickEditKind>("buy");
  const [editingEntry, setEditingEntry] = useState<PlannerQuickEditEntry | null>(null);
  const [editingShopPlanKey, setEditingShopPlanKey] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousSelectedDateRef = useRef<string | null>(null);
  const summaryFocusTargetKeyRef = useRef("planner-add-plan");
  const restoreSummaryFocusRef = useRef(false);

  const months = useMemo(
    () => Array.from({ length: monthCount }, (_, index) => shiftPlannerMonth(initialMonth, index)),
    [initialMonth, monthCount],
  );

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || monthCount < 1) return;
    const scrollContainer = document.querySelector(".mllg-content-area");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { root: scrollContainer, rootMargin: "240px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [monthCount, onLoadMore]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedDate && !dialog.open) dialog.showModal();
    if (!selectedDate && dialog.open) dialog.close();

    if (previousSelectedDateRef.current && !selectedDate) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
    previousSelectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;

    if (dialogView === "summary" && restoreSummaryFocusRef.current) {
      restoreSummaryFocusRef.current = false;
      const targets = dialogRef.current?.querySelectorAll<HTMLElement>("[data-planner-focus-key]");
      const wrapper = Array.from(targets ?? []).find(
        (target) => target.dataset.plannerFocusKey === summaryFocusTargetKeyRef.current,
      );
      const trigger = wrapper?.querySelector<HTMLElement>("button, a[href]");
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
    }

    dialogHeadingRef.current?.focus();
  }, [dialogView, selectedDate]);

  const plannedPeriodKeys = useMemo(() => new Set(periods.map((period) => period.key)), [periods]);
  const datePeriods = selectedDate ? periods.filter((period) => isOnDate(period, selectedDate)) : [];
  const selectedPeriods = eventContextUid
    ? periods.filter((period) => period.eventUid === eventContextUid)
    : datePeriods;
  const publicCandidates = selectedDate
    ? publicPeriods.filter(
        (period) =>
          isOnDate(period, selectedDate) &&
          !plannedPeriodKeys.has(period.key) &&
          (!eventContextUid || period.eventUid === eventContextUid),
      )
    : [];
  const dateRecruitmentCandidates = useMemo(
    () => (selectedDate ? buildPlannerRecruitmentCandidatesForDate(publicPeriods, selectedDate) : []),
    [publicPeriods, selectedDate],
  );
  const recruitmentCandidates = useMemo(() => {
    if (!eventContextUid) return dateRecruitmentCandidates;
    const firstRecruitmentPeriod = publicPeriods
      .filter((period) => period.kind === "recruitment" && period.eventUid === eventContextUid)
      .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
    return firstRecruitmentPeriod
      ? buildPlannerRecruitmentCandidatesForDate(publicPeriods, firstRecruitmentPeriod.startDate).filter(
          (candidate) => candidate.eventUid === eventContextUid,
        )
      : [];
  }, [dateRecruitmentCandidates, eventContextUid, publicPeriods]);
  const preferredRecruitmentEventUid =
    eventContextUid ?? periods.find((period) => period.key === focusedPeriodKey)?.eventUid;
  const selectedResources = selectedDate ? dailyResources[selectedDate] : undefined;
  const selectedOneOffEntries = selectedDate ? oneOffEntries.filter((entry) => entry.date === selectedDate) : [];
  const summaryGroups = useMemo(() => groupPlannerPeriods(selectedPeriods), [selectedPeriods]);
  const summaryEventUids = useMemo(
    () => new Set(summaryGroups.flatMap((group) => (group.eventUid ? [group.eventUid] : []))),
    [summaryGroups],
  );
  const selectedShopPlans = selectedDate
    ? shopPlans.filter(
        (plan) =>
          (eventContextUid && plan.timelineUid === eventContextUid) ||
          (!eventContextUid &&
            (summaryEventUids.has(plan.timelineUid) ||
              (plan.startDate !== null &&
                plan.endDate !== null &&
                plan.startDate <= selectedDate &&
                plan.endDate >= selectedDate))),
      )
    : [];
  const publicGroups = useMemo(() => groupPlannerPeriods(publicCandidates), [publicCandidates]);
  const editingShopPlan = editingShopPlanKey
    ? selectedShopPlans.find(
        (plan) => plan.shopStateUid === editingShopPlanKey || plan.timelineUid === editingShopPlanKey,
      )
    : null;
  const editingShopStateUid = editingShopPlan?.shopStateUid;
  const contextEventName = eventContextUid
    ? (selectedPeriods.find((period) => period.kind === "event")?.name ?? selectedPeriods[0]?.name)
    : undefined;

  function openDate(dateKey: string, trigger: HTMLButtonElement, period?: PlannerPeriod) {
    triggerRef.current = trigger;
    summaryFocusTargetKeyRef.current = "planner-add-plan";
    restoreSummaryFocusRef.current = false;
    setSelectedDate(dateKey);
    setFocusedPeriodKey(period?.key ?? null);
    setEventContextUid(period?.eventUid ?? null);
    setDialogView("summary");
    setSavedNotice(null);
  }

  function closeDialog() {
    summaryFocusTargetKeyRef.current = "planner-add-plan";
    restoreSummaryFocusRef.current = false;
    setSelectedDate(null);
    setFocusedPeriodKey(null);
    setEventContextUid(null);
    setDialogView("summary");
    setEditingEntry(null);
    setEditingShopPlanKey(null);
    setSavedNotice(null);
  }

  function returnToSummary() {
    restoreSummaryFocusRef.current = true;
    setDialogView("summary");
    setEditingEntry(null);
    setEditingShopPlanKey(null);
  }

  function rememberSummaryFocusTarget(targetKey: string) {
    if (dialogView === "summary") summaryFocusTargetKeyRef.current = targetKey;
  }

  function beginActionChoice() {
    rememberSummaryFocusTarget("planner-add-plan");
    setDialogView("actions");
  }

  function beginQuickEdit(kind: PlannerQuickEditKind, entry?: PlannerQuickEditEntry, focusTargetKey?: string) {
    rememberSummaryFocusTarget(focusTargetKey ?? "planner-add-plan");
    setQuickEditKind(kind);
    setEditingEntry(entry ?? null);
    setSavedNotice(null);
    setDialogView("quick-edit");
  }

  function beginRecruitmentEdit(period?: PlannerPeriod, focusTargetKey?: string) {
    rememberSummaryFocusTarget(focusTargetKey ?? "planner-add-plan");
    if (period) {
      setFocusedPeriodKey(period.key);
      setEventContextUid(period.eventUid ?? null);
    }
    setSavedNotice(null);
    setDialogView("recruitment-edit");
  }

  function beginShopEdit(plan?: PlannerCalendarShopPlan, focusTargetKey?: string) {
    rememberSummaryFocusTarget(focusTargetKey ?? "planner-add-plan");
    setSavedNotice(null);
    if (selectedShopPlans.length > 1 && !plan) {
      setDialogView("shop-choice");
      return;
    }
    const targetPlan = plan ?? selectedShopPlans[0];
    setEditingShopPlanKey(targetPlan?.shopStateUid ?? targetPlan?.timelineUid ?? null);
    setDialogView("shop-edit");
  }

  function finishSavedEdit(message: string) {
    setSavedNotice(message);
    returnToSummary();
  }

  function renderMonth(monthKey: string) {
    const weeks = buildPlannerMonthDays(monthKey);
    return (
      <section key={monthKey} aria-labelledby={`planner-month-${monthKey}`} className="space-y-3">
        <h2 id={`planner-month-${monthKey}`} className="text-lg font-semibold text-foreground">
          {formatMonth(monthKey)}
        </h2>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="pb-1 text-center text-xs font-medium text-muted-foreground">
              {weekday}
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {weeks.map((week) => (
            <PlannerCalendarWeek
              key={week[0].dateKey}
              week={week}
              periods={periods}
              dailyResources={dailyResources}
              forecastStatus={forecastStatus}
              selectedDate={selectedDate}
              onSelectDate={(dateKey, trigger) => openDate(dateKey, trigger)}
              onSelectPeriod={(dateKey, trigger, period) => openDate(dateKey, trigger, period)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {statusMessages.map((message) => (
        <div key={message} role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ))}
      {forecastStatus === "input-needed" ? (
        <div role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          예상 재화 변동을 보려면 현재 보유 재화를 먼저 입력해주세요. 입력 전에는 0으로 계산하지 않습니다.
        </div>
      ) : null}
      {forecastStatus === "pending" ? (
        <div role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          같은 입력 기준의 예상 재화를 계산하고 있어요.
        </div>
      ) : null}
      {forecastStatus === "unavailable" ? (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          예상 재화 변동을 계산할 수 없어요. 입력을 확인하거나 다시 시도해주세요.
        </div>
      ) : null}

      {months.map(renderMonth)}
      <div ref={loadMoreRef} aria-hidden="true" className="h-px" />
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onLoadMore}
      >
        다음 달 이어보기 <ChevronRightIcon className="size-4" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="planner-day-title"
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-3xl overflow-hidden rounded-t-lg border-0 bg-popover p-0 text-popover-foreground shadow-t-xl backdrop:bg-black/50 lg:inset-0 lg:m-auto lg:max-h-[80vh] lg:rounded-lg"
        onClose={closeDialog}
      >
        {selectedDate ? (
          <div className="flex max-h-[85dvh] flex-col lg:max-h-[80vh]">
            <header className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3 pt-5 lg:px-6 lg:pt-6">
              <div className="min-w-0">
                <h2 ref={dialogHeadingRef} id="planner-day-title" tabIndex={-1} className="text-lg font-semibold">
                  {dialogView === "summary"
                    ? formatDate(selectedDate)
                    : dialogView === "actions"
                      ? "계획 추가"
                      : dialogView === "quick-edit"
                        ? quickEditKind === "buy"
                          ? "청휘석 구매"
                          : quickEditKind === "package"
                            ? "패키지 계획"
                            : "직접 재화 등록"
                        : dialogView === "recruitment-edit"
                          ? "모집 계획"
                          : dialogView === "shop-choice"
                            ? "상점 선택"
                            : `${editingShopPlan?.name ?? "상점"} 보유량 수정`}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dialogView === "summary"
                    ? (contextEventName ??
                      (isSignedIn ? "계정에 저장된 계획과 예상 변동" : "이 브라우저에 저장된 계획과 예상 변동"))
                    : `${formatDate(selectedDate)}${contextEventName ? ` · ${contextEventName}` : ""}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dialogView === "actions" || dialogView === "shop-choice" ? (
                  <Button text="뒤로" size="sm" variant="secondary" onClick={returnToSummary} />
                ) : null}
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="날짜 상세 닫기"
                  onClick={closeDialog}
                >
                  <XMarkIcon className="size-5" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 lg:px-6">
              {savedNotice ? (
                <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {savedNotice}
                </p>
              ) : null}

              {dialogView === "summary" ? (
                <>
                  <section aria-labelledby="planner-day-resources" className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 id="planner-day-resources" className="text-sm font-semibold">
                        예상 재화 증감
                      </h3>
                      <span className="inline-flex" data-planner-focus-key="planner-add-plan">
                        <Button text="＋ 계획 추가" variant="primary" size="sm" onClick={beginActionChoice} />
                      </span>
                    </div>
                    {forecastStatus === "ready" && selectedResources ? (
                      <>
                        {selectedResources.changes.length > 0 ? (
                          <DailyResourceChanges changes={selectedResources.changes} />
                        ) : (
                          <p className="text-sm text-muted-foreground">예상 재화 변동이 없어요.</p>
                        )}
                        {selectedResources.sources.length > 0 ? (
                          <details className="rounded-md bg-muted/50 px-3 py-2">
                            <summary className="cursor-pointer text-sm font-medium">예상 재화 내역 보기</summary>
                            <ul className="mt-3 space-y-3">
                              {selectedResources.sources.map((source) => (
                                <li key={source.key} className="rounded-md bg-card p-3">
                                  <p className="text-sm font-medium">
                                    {source.label ?? "예상 항목 이름을 확인할 수 없어요"}
                                  </p>
                                  <DailyResourceChanges changes={source.changes} compact />
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </>
                    ) : forecastStatus === "input-needed" ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        현재 보유 재화를 입력하면 예상 변동을 확인할 수 있어요. 입력 전에는 0으로 계산하지 않습니다.
                      </p>
                    ) : forecastStatus === "pending" ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        예상 재화 변동을 계산하고 있어요.
                      </p>
                    ) : forecastStatus === "unavailable" ? (
                      <p role="alert" className="text-sm text-destructive">
                        예상 재화 변동을 계산할 수 없어요. 입력을 확인하거나 다시 시도해주세요.
                      </p>
                    ) : null}
                  </section>

                  {selectedOneOffEntries.length > 0 ? (
                    <section aria-labelledby="planner-day-one-off-plans" className="space-y-2">
                      <h3 id="planner-day-one-off-plans" className="text-sm font-semibold">
                        직접 입력한 계획
                      </h3>
                      {selectedOneOffEntries.map((entry) => {
                        const entryChanges = (
                          Object.keys(RESOURCE_PRESENTATION) as (keyof typeof RESOURCE_PRESENTATION)[]
                        )
                          .filter((key) => entry.resources[key] !== 0)
                          .map((key) => ({ key, quantity: entry.resources[key] }));
                        const focusTargetKey = `quick-edit-${entry.id}`;
                        return (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{entry.description || "직접 입력"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {entry.kind === "buy" ? "청휘석 구매" : "직접 재화"} · {formatDate(entry.date)}
                              </p>
                              {entryChanges.length > 0 ? <DailyResourceChanges changes={entryChanges} compact /> : null}
                            </div>
                            <span className="inline-flex" data-planner-focus-key={focusTargetKey}>
                              <Button
                                text="수정"
                                size="xs"
                                variant="secondary"
                                onClick={() => beginQuickEdit(entry.kind, entry, focusTargetKey)}
                              />
                            </span>
                          </div>
                        );
                      })}
                    </section>
                  ) : null}

                  {summaryGroups.map((group) => {
                    const recruitmentPeriod = group.periods.find((period) => period.kind === "recruitment");
                    const groupShopPlans = group.eventUid
                      ? shopPlans.filter((plan) => plan.timelineUid === group.eventUid)
                      : [];
                    const detailPeriods = group.periods.filter(
                      (period, index) =>
                        group.periods.findIndex((candidate) => candidate.kind === period.kind) === index,
                    );
                    return (
                      <section key={group.key} aria-label={group.name} className="space-y-3 rounded-md bg-muted/50 p-3">
                        <h3 className="text-sm font-semibold">{group.name}</h3>
                        <ul className="space-y-2">
                          {group.periods.map((period) => (
                            <li
                              key={period.key}
                              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
                            >
                              <span>{phaseName(period)}</span>
                              <span className="text-xs text-muted-foreground">{formatPeriodRange(period)}</span>
                            </li>
                          ))}
                        </ul>
                        {groupShopPlans.map((plan) => (
                          <div key={plan.shopStateUid ?? plan.timelineUid} className="space-y-2">
                            {plan.state && plan.defaultState ? (
                              <PlannerShopSummary
                                content={plan.content}
                                state={plan.state}
                                defaultState={plan.defaultState}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                이벤트 상점의 기본 입력을 확인할 수 없어요.
                              </p>
                            )}
                            {plan.conflict ? (
                              <p className="text-sm text-amber-700 dark:text-amber-300">
                                이 브라우저에 다른 상점 계획이 있어요
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              {plan.shopStateUid ? (
                                <span
                                  className="inline-flex"
                                  data-planner-focus-key={`shop-edit-${plan.shopStateUid ?? plan.timelineUid}`}
                                >
                                  <Button
                                    text="보유 재화 수정"
                                    size="xs"
                                    variant="secondary"
                                    onClick={() =>
                                      beginShopEdit(plan, `shop-edit-${plan.shopStateUid ?? plan.timelineUid}`)
                                    }
                                  />
                                </span>
                              ) : null}
                              {plan.conflict ? (
                                <Button
                                  text="비교하기"
                                  size="xs"
                                  variant="secondary"
                                  to={`/utils/planner/import?event=${encodeURIComponent(plan.timelineUid)}`}
                                />
                              ) : null}
                            </div>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          {recruitmentPeriod ? (
                            <span
                              className="inline-flex"
                              data-planner-focus-key={`recruitment-edit-${recruitmentPeriod.key}`}
                            >
                              <Button
                                text="모집 수정"
                                size="xs"
                                variant="secondary"
                                onClick={() =>
                                  beginRecruitmentEdit(recruitmentPeriod, `recruitment-edit-${recruitmentPeriod.key}`)
                                }
                              />
                            </span>
                          ) : null}
                          {detailPeriods.map((period) =>
                            period.kind === "shop" && period.conflict ? (
                              <div key={`${period.kind}:${period.key}`} className="flex flex-wrap gap-2">
                                <Button text="상점 계산기 상세" size="xs" variant="secondary" to={period.href} />
                                {!groupShopPlans.some((plan) => plan.conflict) && period.eventUid ? (
                                  <Button
                                    text="비교하기"
                                    size="xs"
                                    variant="secondary"
                                    to={`/utils/planner/import?event=${encodeURIComponent(period.eventUid)}`}
                                  />
                                ) : null}
                              </div>
                            ) : (
                              <Button
                                key={`${period.kind}:${period.key}`}
                                text={`${phaseName(period)} 상세`}
                                size="xs"
                                variant="secondary"
                                to={period.href}
                              />
                            ),
                          )}
                        </div>
                      </section>
                    );
                  })}

                  {publicGroups.length > 0 ? (
                    <section aria-labelledby="planner-related-schedules" className="space-y-2">
                      <h3 id="planner-related-schedules" className="text-sm font-semibold">
                        관련 공개 일정
                      </h3>
                      {publicGroups.map((group) => {
                        const recruitmentPeriod = group.periods.find((period) => period.kind === "recruitment");
                        const detailPeriods = group.periods.filter(
                          (period, index) =>
                            group.periods.findIndex((candidate) => candidate.kind === period.kind) === index,
                        );
                        return (
                          <div key={group.key} className="rounded-md bg-muted/50 p-3">
                            <p className="text-sm font-medium">{group.name}</p>
                            <ul className="mt-2 space-y-1">
                              {group.periods.map((period) => (
                                <li key={period.key} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
                                  <span>{phaseName(period)}</span>
                                  <span className="text-muted-foreground">{formatPeriodRange(period)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {recruitmentPeriod ? (
                                <span
                                  className="inline-flex"
                                  data-planner-focus-key={`recruitment-add-${recruitmentPeriod.key}`}
                                >
                                  <Button
                                    text="모집 계획 추가"
                                    size="xs"
                                    variant="primary"
                                    onClick={() =>
                                      beginRecruitmentEdit(
                                        recruitmentPeriod,
                                        `recruitment-add-${recruitmentPeriod.key}`,
                                      )
                                    }
                                  />
                                </span>
                              ) : null}
                              {detailPeriods.map((period) => (
                                <Button
                                  key={`${period.kind}:${period.key}`}
                                  text={`${phaseName(period)} 상세`}
                                  size="xs"
                                  variant="secondary"
                                  to={period.href}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  ) : null}

                  {selectedResources === undefined &&
                  selectedOneOffEntries.length === 0 &&
                  summaryGroups.length === 0 &&
                  publicGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">이 날짜에 표시할 계획이나 공개 일정이 없어요.</p>
                  ) : null}
                </>
              ) : null}

              {dialogView === "actions" ? (
                <section aria-labelledby="planner-add-actions" className="space-y-3">
                  <h3 id="planner-add-actions" className="text-sm font-semibold">
                    추가할 계획 선택
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Button text="모집" variant="secondary" fullWidth onClick={() => beginRecruitmentEdit()} />
                    <Button text="청휘석 구매" variant="secondary" fullWidth onClick={() => beginQuickEdit("buy")} />
                    <Button text="패키지" variant="secondary" fullWidth onClick={() => beginQuickEdit("package")} />
                    <Button text="직접 재화" variant="secondary" fullWidth onClick={() => beginQuickEdit("other")} />
                    {selectedShopPlans.length > 0 ? (
                      <Button text="상점 보유량" variant="secondary" fullWidth onClick={() => beginShopEdit()} />
                    ) : null}
                  </div>
                </section>
              ) : null}

              {dialogView === "quick-edit" && selectedDate ? (
                <PlannerQuickEdit
                  key={`${selectedDate}:${editingEntry?.id ?? quickEditKind}`}
                  date={selectedDate}
                  timeZone={timeZone}
                  entries={selectedOneOffEntries}
                  isSignedIn={isSignedIn}
                  guestStorageStatus={guestStorageStatus}
                  initialKind={quickEditKind}
                  initialEntry={editingEntry ?? undefined}
                  onSaved={() => finishSavedEdit("계획을 저장했어요.")}
                  onCancel={returnToSummary}
                />
              ) : null}

              {dialogView === "recruitment-edit" && selectedDate ? (
                recruitmentCandidates.length > 0 ? (
                  <PlannerRecruitmentEditor
                    key={`${selectedDate}:${eventContextUid ?? "date"}`}
                    selectedDate={selectedDate}
                    candidates={recruitmentCandidates}
                    savedStates={recruitmentSavedStates}
                    preferredEventUid={preferredRecruitmentEventUid}
                    isSignedIn={isSignedIn}
                    isSaving={recruitmentIsSaving}
                    saveResult={recruitmentSaveResult}
                    onSave={onSaveRecruitment}
                    onSaved={() => finishSavedEdit("모집 계획을 저장했어요.")}
                    onCancel={returnToSummary}
                  />
                ) : (
                  <section role="status" className="space-y-3 rounded-md bg-muted/50 p-4">
                    <p className="text-sm text-muted-foreground">
                      {contextEventName
                        ? "선택한 이벤트의 모집 대상을 확인할 수 없어요. 이벤트 상세에서 일정을 확인해주세요."
                        : "이 날짜에 선택할 수 있는 모집 일정이 없어요. 관련 공개 일정을 확인해주세요."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {summaryGroups.flatMap((group) =>
                        group.periods
                          .filter((period) => period.kind === "event")
                          .slice(0, 1)
                          .map((period) => (
                            <Button
                              key={period.key}
                              text="이벤트 상세"
                              size="xs"
                              variant="secondary"
                              to={period.href}
                            />
                          )),
                      )}
                      {publicGroups.flatMap((group) =>
                        group.periods
                          .filter((period) => period.kind === "event")
                          .slice(0, 1)
                          .map((period) => (
                            <Button
                              key={`public:${period.key}`}
                              text="이벤트 상세"
                              size="xs"
                              variant="secondary"
                              to={period.href}
                            />
                          )),
                      )}
                    </div>
                  </section>
                )
              ) : null}

              {dialogView === "shop-choice" ? (
                <section aria-labelledby="planner-shop-choice" className="space-y-3">
                  <h3 id="planner-shop-choice" className="text-sm font-semibold">
                    수정할 상점을 선택해주세요
                  </h3>
                  <div className="space-y-2">
                    {selectedShopPlans.map((plan) => (
                      <Button
                        key={plan.shopStateUid ?? plan.timelineUid}
                        text={plan.name}
                        variant="secondary"
                        fullWidth
                        onClick={() => beginShopEdit(plan)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {dialogView === "shop-edit" ? (
                editingShopPlan && editingShopStateUid && editingShopPlan.state && editingShopPlan.defaultState ? (
                  <section className="space-y-3">
                    <Button text="취소" size="sm" variant="secondary" onClick={returnToSummary} />
                    <PlannerShopOwnedQuantityEditor
                      key={editingShopStateUid}
                      timelineUid={editingShopPlan.timelineUid}
                      shopStateUid={editingShopStateUid}
                      content={editingShopPlan.content}
                      state={editingShopPlan.state}
                      defaultState={editingShopPlan.defaultState}
                      signedIn={isSignedIn}
                      onSaved={(state) => {
                        onShopSaved(editingShopStateUid, state);
                        finishSavedEdit("상점 보유량을 저장했어요.");
                      }}
                    />
                  </section>
                ) : (
                  <section className="space-y-3">
                    <p role="status" className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
                      이벤트 상점 입력을 확인하거나 저장할 수 없어요.
                    </p>
                    <Button text="뒤로" size="sm" variant="secondary" onClick={returnToSummary} />
                  </section>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
