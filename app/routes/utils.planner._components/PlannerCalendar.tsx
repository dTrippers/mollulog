import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/primitives";
import type { EventShopState } from "~/domain/event-shop-state";
import type {
  PlannerDateScheduleItem,
  PlannerDayResources,
  PlannerMonthLayout,
  PlannerPeriod,
} from "~/domain/integrated-planner";
import {
  buildPlannerMonthLayout,
  buildPlannerRecruitmentCandidatesForDate,
  getPlannerDateScheduleForDate,
  getPlannerPeriodsForDate,
  shiftPlannerMonth,
} from "~/domain/integrated-planner";
import PlannerCalendarWeek, { type PlannerForecastStatus } from "./PlannerCalendarWeek";
import PlannerDateScheduleRow from "./PlannerDateScheduleRow";
import PlannerEventSubview from "./PlannerEventSubview";
import PlannerQuickEdit, { type PlannerQuickEditEntry, type PlannerQuickEditKind } from "./PlannerQuickEdit";
import PlannerRecruitmentEditor, {
  type PlannerRecruitmentSavedState,
  type PlannerRecruitmentSaveInput,
  type PlannerRecruitmentSaveResult,
} from "./PlannerRecruitmentEditor";
import PlannerShopOwnedQuantityEditor, { type PlannerShopContent } from "./PlannerShopOwnedQuantityEditor";

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
};

type PlannerCalendarProps = {
  initialMonth: string;
  todayDateKey: string;
  periods: PlannerPeriod[];
  scheduleAvailability: { dateFacts: boolean; ongoing: boolean };
  calendarResources: Record<string, PlannerDayResources>;
  forecastStatus: PlannerForecastStatus;
  statusMessages: string[];
  isSignedIn: boolean;
  timeZone: string;
  oneOffEntries: PlannerQuickEditEntry[];
  guestStorageStatus: "ready" | "memory" | "corrupt" | "loading";
  recruitmentSavedStates: PlannerRecruitmentSavedState[];
  completedRecruitmentEventUids: string[];
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
  | "event"
  | "actions"
  | "quick-edit"
  | "recruitment-edit"
  | "shop-choice"
  | "shop-edit";
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const WEEKDAYS_SUNDAY_FIRST = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatDateKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return date ? `${date.year}년 ${date.month}월 ${date.day}일` : dateKey;
}

function formatDetailHeadingDateKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  const weekday = WEEKDAYS_SUNDAY_FIRST[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  return `${date.month}월 ${date.day}일 ${weekday}`;
}

function recruitmentBasisLabel(
  eventUid: string | undefined,
  savedStates: readonly PlannerRecruitmentSavedState[],
  completedEventUids: ReadonlySet<string>,
): string {
  if (eventUid && completedEventUids.has(eventUid)) return "모집 완료";
  const expectedTrials = savedStates.find((state) => state.eventUid === eventUid)?.expectedTrials;
  if (expectedTrials != null) return `직접 입력 ${expectedTrials.toLocaleString("ko-KR")}회`;
  return "자동 추정";
}

export default function PlannerCalendar({
  initialMonth,
  todayDateKey,
  periods,
  scheduleAvailability,
  calendarResources,
  forecastStatus,
  statusMessages,
  isSignedIn,
  timeZone,
  oneOffEntries,
  guestStorageStatus,
  recruitmentSavedStates,
  completedRecruitmentEventUids,
  recruitmentIsSaving,
  recruitmentSaveResult,
  onSaveRecruitment,
  shopPlans,
  onShopSaved,
  monthCount,
  onLoadMore,
}: PlannerCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEventUid, setSelectedEventUid] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<PlannerCalendarDialogView>("summary");
  const [quickEditKind, setQuickEditKind] = useState<PlannerQuickEditKind>("buy");
  const [editingEntry, setEditingEntry] = useState<PlannerQuickEditEntry | null>(null);
  const [editingShopPlanKey, setEditingShopPlanKey] = useState<string | null>(null);
  const [preferredRecruitmentEventUid, setPreferredRecruitmentEventUid] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const calendarRootRef = useRef<HTMLDivElement>(null);
  const todayCellRef = useRef<HTMLButtonElement | null>(null);
  const monthRefs = useRef(new Map<string, HTMLElement>());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousSelectedDateRef = useRef<string | null>(null);
  const parentViewRef = useRef<"summary" | "event">("summary");
  const parentFocusTargetKeyRef = useRef("planner-add-plan");
  const restoreParentFocusRef = useRef(false);
  const [activeMonth, setActiveMonth] = useState(initialMonth);
  const [showMonthToolbar, setShowMonthToolbar] = useState(false);

  const months = useMemo(
    () => Array.from({ length: monthCount }, (_, index) => shiftPlannerMonth(initialMonth, index)),
    [initialMonth, monthCount],
  );
  const monthLayouts = useMemo(
    () => months.map((monthKey) => buildPlannerMonthLayout(monthKey, periods, timeZone)),
    [months, periods, timeZone],
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
    const scrollContainer = document.querySelector<HTMLElement>(".mllg-content-area");
    if (!scrollContainer) return;

    const updateViewportState = () => {
      const rootRect = scrollContainer.getBoundingClientRect();
      const calendarRect = calendarRootRef.current?.getBoundingClientRect();
      setShowMonthToolbar(Boolean(calendarRect && calendarRect.top < rootRect.top - 8));

      const marker = rootRect.top + 72;
      const visibleMonth = months
        .filter((monthKey) => {
          const element = monthRefs.current.get(monthKey);
          return element && element.getBoundingClientRect().top <= marker;
        })
        .at(-1);
      if (visibleMonth) setActiveMonth(visibleMonth);
    };

    const observer = new IntersectionObserver(updateViewportState, {
      root: scrollContainer,
      rootMargin: "-72px 0px -55% 0px",
      threshold: [0, 0.25, 0.5, 1],
    });
    for (const element of monthRefs.current.values()) observer.observe(element);
    scrollContainer.addEventListener("scroll", updateViewportState, { passive: true });
    window.addEventListener("resize", updateViewportState);
    updateViewportState();
    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener("scroll", updateViewportState);
      window.removeEventListener("resize", updateViewportState);
    };
  }, [months]);

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

  // Focus the heading whenever the date detail changes view; the dependency triggers this transition.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dialog view changes must move focus to its heading.
  useEffect(() => {
    if (!selectedDate) return;

    if (restoreParentFocusRef.current) {
      restoreParentFocusRef.current = false;
      const targets = dialogRef.current?.querySelectorAll<HTMLElement>("[data-planner-focus-key]");
      const wrapper = Array.from(targets ?? []).find(
        (target) => target.dataset.plannerFocusKey === parentFocusTargetKeyRef.current,
      );
      const trigger = wrapper?.matches("button, a[href]")
        ? wrapper
        : wrapper?.querySelector<HTMLElement>("button, a[href]");
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
    }

    dialogHeadingRef.current?.focus();
  }, [dialogView, selectedDate]);

  const dateSchedule = useMemo(
    () => (selectedDate ? getPlannerDateScheduleForDate(periods, selectedDate, timeZone) : { onDate: [], ongoing: [] }),
    [periods, selectedDate, timeZone],
  );
  const datePeriods = useMemo(
    () => (selectedDate ? getPlannerPeriodsForDate(periods, selectedDate, todayDateKey) : []),
    [periods, selectedDate, todayDateKey],
  );
  const dateRecruitmentCandidates = useMemo(
    () => (selectedDate ? buildPlannerRecruitmentCandidatesForDate(periods, selectedDate) : []),
    [periods, selectedDate],
  );
  const eventRecruitmentCandidates = useMemo(
    () =>
      selectedEventUid
        ? buildPlannerRecruitmentCandidatesForDate(periods).filter(
            (candidate) => candidate.eventUid === selectedEventUid,
          )
        : [],
    [periods, selectedEventUid],
  );
  const recruitmentCandidates = selectedEventUid ? eventRecruitmentCandidates : dateRecruitmentCandidates;
  const selectedOneOffEntries = selectedDate ? oneOffEntries.filter((entry) => entry.date === selectedDate) : [];
  const completedRecruitmentEventUidSet = useMemo(
    () => new Set(completedRecruitmentEventUids),
    [completedRecruitmentEventUids],
  );
  const eventPeriod = selectedEventUid
    ? periods.find((period) => period.kind === "event" && period.eventUid === selectedEventUid)
    : undefined;
  const eventShopPeriod = selectedEventUid
    ? periods.find((period) => period.kind === "shop" && period.eventUid === selectedEventUid)
    : undefined;
  const selectedDateEventUids = new Set(datePeriods.flatMap((period) => (period.eventUid ? [period.eventUid] : [])));
  const selectedShopPlans = selectedDate
    ? shopPlans.filter(
        (plan) =>
          (selectedEventUid && plan.timelineUid === selectedEventUid) ||
          (!selectedEventUid &&
            (selectedDateEventUids.has(plan.timelineUid) ||
              (plan.startDate !== null &&
                plan.endDate !== null &&
                plan.startDate <= selectedDate &&
                plan.endDate >= selectedDate))),
      )
    : [];
  const editingShopPlan = editingShopPlanKey
    ? selectedShopPlans.find(
        (plan) => plan.shopStateUid === editingShopPlanKey || plan.timelineUid === editingShopPlanKey,
      )
    : null;
  const editingShopStateUid = editingShopPlan?.shopStateUid;
  const dateFactItems = dateSchedule.onDate;
  const ongoingItems = dateSchedule.ongoing;

  function openDate(dateKey: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    parentViewRef.current = "summary";
    parentFocusTargetKeyRef.current = "planner-add-plan";
    restoreParentFocusRef.current = false;
    setSelectedDate(dateKey);
    setSelectedEventUid(null);
    setDialogView("summary");
    setSavedNotice(null);
  }

  function openPeriod(dateKey: string, trigger: HTMLButtonElement, period: PlannerPeriod) {
    openDate(dateKey, trigger);
    if (!period.eventUid) return;
    const schedule = getPlannerDateScheduleForDate(periods, dateKey, timeZone);
    const items = schedule.onDate.concat(schedule.ongoing);
    const item =
      items.find((candidate) => candidate.period === period) ??
      items.find((candidate) => candidate.period.eventUid === period.eventUid);
    parentFocusTargetKeyRef.current = item?.key ?? "planner-add-plan";
    parentViewRef.current = "summary";
    setSelectedEventUid(period.eventUid);
    setPreferredRecruitmentEventUid(period.eventUid);
    setDialogView("event");
  }

  function openEventView(item: PlannerDateScheduleItem, _trigger: HTMLButtonElement) {
    if (!item.period.eventUid) return;
    parentViewRef.current = "summary";
    parentFocusTargetKeyRef.current = item.key;
    restoreParentFocusRef.current = false;
    setSelectedEventUid(item.period.eventUid);
    setPreferredRecruitmentEventUid(item.period.eventUid);
    setSavedNotice(null);
    setDialogView("event");
  }

  function backFromEvent() {
    parentViewRef.current = "summary";
    restoreParentFocusRef.current = true;
    setSelectedEventUid(null);
    setDialogView("summary");
  }

  function closeDialog() {
    parentFocusTargetKeyRef.current = "planner-add-plan";
    restoreParentFocusRef.current = false;
    setSelectedDate(null);
    setSelectedEventUid(null);
    setPreferredRecruitmentEventUid(null);
    setDialogView("summary");
    setEditingEntry(null);
    setEditingShopPlanKey(null);
    setSavedNotice(null);
  }

  function returnToParentView() {
    restoreParentFocusRef.current = true;
    if (parentViewRef.current === "summary") setSelectedEventUid(null);
    setDialogView(parentViewRef.current);
    setEditingEntry(null);
    setEditingShopPlanKey(null);
  }

  function rememberParentFocusTarget(targetKey: string) {
    parentViewRef.current = dialogView === "event" ? "event" : "summary";
    parentFocusTargetKeyRef.current = targetKey;
  }

  function beginActionChoice() {
    rememberParentFocusTarget("planner-add-plan");
    setDialogView("actions");
  }

  function beginQuickEdit(kind: PlannerQuickEditKind, entry?: PlannerQuickEditEntry, focusTargetKey?: string) {
    rememberParentFocusTarget(focusTargetKey ?? "planner-add-plan");
    setQuickEditKind(kind);
    setEditingEntry(entry ?? null);
    setSavedNotice(null);
    setDialogView("quick-edit");
  }

  function beginRecruitmentEdit(period?: PlannerPeriod, focusTargetKey?: string) {
    rememberParentFocusTarget(focusTargetKey ?? "planner-add-plan");
    const eventUid = period?.eventUid ?? selectedEventUid;
    setPreferredRecruitmentEventUid(eventUid ?? null);
    if (eventUid) setSelectedEventUid(eventUid);
    setSavedNotice(null);
    setDialogView("recruitment-edit");
  }

  function beginShopEdit(plan?: PlannerCalendarShopPlan, focusTargetKey?: string) {
    if (dialogView !== "shop-choice") {
      rememberParentFocusTarget(focusTargetKey ?? "planner-add-plan");
    }
    setSavedNotice(null);
    if (selectedShopPlans.length > 1 && !plan) {
      setDialogView("shop-choice");
      return;
    }
    const targetPlan = plan ?? selectedShopPlans[0];
    setEditingShopPlanKey(targetPlan?.shopStateUid ?? targetPlan?.timelineUid ?? null);
    setDialogView("shop-edit");
  }

  function renderDirectPlanEntries() {
    if (selectedOneOffEntries.length === 0) return null;
    return (
      <section aria-labelledby="planner-direct-plans-title" className="space-y-2">
        <h3 id="planner-direct-plans-title" className="text-base font-semibold">
          직접 입력한 계획
        </h3>
        <ul className="space-y-1">
          {selectedOneOffEntries.map((entry) => {
            const focusTargetKey = `planner-quick-edit-${entry.id}`;
            const entryName = entry.description?.trim() || (entry.kind === "buy" ? "청휘석 구매" : "직접 재화");
            return (
              <li key={entry.id} className="flex min-h-10 items-center justify-between gap-3">
                <span className="min-w-0 break-keep text-sm">{entryName}</span>
                <span className="inline-flex shrink-0" data-planner-focus-key={focusTargetKey}>
                  <Button
                    text="수정"
                    size="xs"
                    variant="secondary"
                    onClick={() => beginQuickEdit(entry.kind, entry, focusTargetKey)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function finishSavedEdit(message: string) {
    setSavedNotice(message);
    returnToParentView();
  }

  function scrollToToday() {
    const todayCell = todayCellRef.current;
    if (!todayCell) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    todayCell.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    requestAnimationFrame(() => todayCell.focus());
  }

  function renderMonth(monthLayout: PlannerMonthLayout) {
    const { monthKey, weeks, weekLayouts } = monthLayout;
    return (
      <section
        key={monthKey}
        ref={(element) => {
          if (element) monthRefs.current.set(monthKey, element);
          else monthRefs.current.delete(monthKey);
        }}
        data-planner-month={monthKey}
        aria-labelledby={`planner-month-${monthKey}`}
        className="space-y-3"
      >
        <h2 id={`planner-month-${monthKey}`} className="text-lg font-semibold text-foreground">
          {formatMonth(monthKey)}
        </h2>
        <div className="space-y-2 max-sm:-mx-4">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                {weekday}
              </div>
            ))}
          </div>
          <div className="space-y-0">
            {weeks.map((week, index) => (
              <PlannerCalendarWeek
                key={week[0].dateKey}
                week={week}
                periods={periods}
                calendarResources={calendarResources}
                forecastStatus={forecastStatus}
                weekLayout={weekLayouts[index]}
                timeZone={timeZone}
                todayDateKey={todayDateKey}
                selectedDate={selectedDate}
                isFirstWeek={index === 0}
                isLastWeek={index === weeks.length - 1}
                onSelectDate={(dateKey, trigger) => openDate(dateKey, trigger)}
                onSelectPeriod={(dateKey, trigger, period) => openPeriod(dateKey, trigger, period)}
                onTodayCellRef={(element) => {
                  todayCellRef.current = element;
                }}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div ref={calendarRootRef} className="space-y-5">
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

      {showMonthToolbar ? (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-md bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-sm font-semibold text-foreground">{formatMonth(activeMonth)}</span>
          <Button text="오늘 보기" size="sm" variant="secondary" onClick={scrollToToday} />
        </div>
      ) : null}

      {monthLayouts.map(renderMonth)}
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
                <h2
                  ref={dialogHeadingRef}
                  id="planner-day-title"
                  tabIndex={-1}
                  className="break-keep text-lg font-semibold"
                >
                  {dialogView === "summary" ? (
                    <>
                      <span aria-hidden="true">{formatDetailHeadingDateKey(selectedDate)}</span>
                      <span className="sr-only">{formatDateKey(selectedDate)}</span>
                    </>
                  ) : dialogView === "event" ? (
                    (eventPeriod?.name ?? "일정 정보를 확인할 수 없어요.")
                  ) : dialogView === "actions" ? (
                    "계획 추가"
                  ) : dialogView === "quick-edit" ? (
                    quickEditKind === "buy" ? (
                      "청휘석 구매"
                    ) : quickEditKind === "package" ? (
                      "패키지 계획"
                    ) : (
                      "직접 재화 등록"
                    )
                  ) : dialogView === "recruitment-edit" ? (
                    "모집 계획"
                  ) : dialogView === "shop-choice" ? (
                    "상점 선택"
                  ) : (
                    `${editingShopPlan?.name ?? "상점"} 보유량 수정`
                  )}
                </h2>
                {dialogView !== "summary" && dialogView !== "recruitment-edit" ? (
                  <p className="mt-1 text-sm text-muted-foreground">{formatDateKey(selectedDate)}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dialogView === "event" ? (
                  <Button text="뒤로" size="sm" variant="secondary" onClick={backFromEvent} />
                ) : dialogView === "actions" || dialogView === "shop-choice" ? (
                  <Button text="뒤로" size="sm" variant="secondary" onClick={returnToParentView} />
                ) : null}
                {dialogView === "summary" ? (
                  <span className="inline-flex" data-planner-focus-key="planner-add-plan">
                    <Button text="＋ 계획 추가" variant="primary" size="sm" onClick={beginActionChoice} />
                  </span>
                ) : null}
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={
                    dialogView === "recruitment-edit"
                      ? "모집 계획 닫기"
                      : dialogView === "summary"
                        ? "날짜 상세 닫기"
                        : dialogView === "event"
                          ? "이벤트 화면 닫기"
                          : "계획 입력 닫기"
                  }
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
                  <section aria-labelledby="planner-day-schedule-title" className="space-y-2">
                    <h3 id="planner-day-schedule-title" className="text-base font-semibold">
                      {selectedDate === todayDateKey ? "오늘" : "이 날"}
                    </h3>
                    <ul className="space-y-1">
                      {dateFactItems.map((item) => (
                        <PlannerDateScheduleRow
                          key={item.key}
                          item={item}
                          allPeriods={periods}
                          timeZone={timeZone}
                          mode="on-date"
                          onOpen={openEventView}
                        />
                      ))}
                      {!scheduleAvailability.dateFacts ? (
                        <li role="status" className="py-1 text-sm text-muted-foreground">
                          일정 정보를 확인할 수 없어요.
                        </li>
                      ) : dateFactItems.length === 0 ? (
                        <li className="py-1 text-sm text-muted-foreground">
                          {selectedDate === todayDateKey
                            ? "오늘은 시작하거나 끝나는 일정이 없어요."
                            : "이 날 시작하거나 끝나는 일정이 없어요."}
                        </li>
                      ) : null}
                    </ul>
                  </section>

                  {renderDirectPlanEntries()}

                  <section aria-labelledby="planner-ongoing-title" className="space-y-2">
                    <h3 id="planner-ongoing-title" className="text-base font-semibold">
                      진행 중
                    </h3>
                    <ul className="space-y-1">
                      {ongoingItems.map((item) => (
                        <PlannerDateScheduleRow
                          key={item.key}
                          item={item}
                          allPeriods={periods}
                          timeZone={timeZone}
                          mode="ongoing"
                          onOpen={openEventView}
                        />
                      ))}
                      {!scheduleAvailability.ongoing ? (
                        <li role="status" className="py-1 text-sm text-muted-foreground">
                          일정 정보를 확인할 수 없어요.
                        </li>
                      ) : ongoingItems.length === 0 ? (
                        <li className="py-1 text-sm text-muted-foreground">진행 중인 다른 일정이 없어요.</li>
                      ) : null}
                    </ul>
                  </section>
                </>
              ) : null}

              {dialogView === "event" && eventPeriod && selectedDate ? (
                <PlannerEventSubview
                  eventPeriod={eventPeriod}
                  shopPeriod={eventShopPeriod}
                  periods={periods}
                  shopPlans={selectedShopPlans}
                  recruitmentStatus={recruitmentBasisLabel(
                    selectedEventUid ?? undefined,
                    recruitmentSavedStates,
                    completedRecruitmentEventUidSet,
                  )}
                  recruitmentUnavailable={!scheduleAvailability.ongoing}
                  referenceDateKey={selectedDate}
                  timeZone={timeZone}
                  onAddRecruitment={(focusKey) => beginRecruitmentEdit(undefined, focusKey)}
                  onEditRecruitment={(focusKey) => beginRecruitmentEdit(undefined, focusKey)}
                  onEditShop={(focusKey) => beginShopEdit(undefined, focusKey)}
                />
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
                  onCancel={returnToParentView}
                />
              ) : null}

              {dialogView === "recruitment-edit" && selectedDate ? (
                recruitmentCandidates.length > 0 ? (
                  <PlannerRecruitmentEditor
                    key={`${selectedDate}:${selectedEventUid ?? "date"}`}
                    selectedDate={selectedDate}
                    candidates={recruitmentCandidates}
                    timeZone={timeZone}
                    savedStates={recruitmentSavedStates}
                    preferredEventUid={preferredRecruitmentEventUid ?? undefined}
                    isSaving={recruitmentIsSaving}
                    saveResult={recruitmentSaveResult}
                    onSave={onSaveRecruitment}
                    onSaved={() => finishSavedEdit("모집 계획을 저장했어요.")}
                    onCancel={returnToParentView}
                  />
                ) : (
                  <section role="status" className="space-y-3 rounded-md bg-muted/50 p-4">
                    <p className="text-sm text-muted-foreground">
                      {!scheduleAvailability.ongoing
                        ? "일정 정보를 확인할 수 없어요."
                        : "이 날짜에 선택할 수 있는 모집 일정이 없어요. 관련 공개 일정을 확인해주세요."}
                    </p>
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
                    <Button text="취소" size="sm" variant="secondary" onClick={returnToParentView} />
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
                    <Button text="뒤로" size="sm" variant="secondary" onClick={returnToParentView} />
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
