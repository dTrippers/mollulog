import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet, Button } from "~/components/primitives";
import type { EventShopState } from "~/domain/event-shop-state";
import type {
  PlannerDayResources,
  PlannerMonthLayout,
  PlannerPeriod,
  PlannerRaidScheduleFact,
} from "~/domain/integrated-planner";
import {
  attributePlannerDateResources,
  buildPlannerMonthLayout,
  buildPlannerRecruitmentCandidatesForDate,
  getPlannerDateScheduleForDate,
  getPlannerReadOnlyBuySources,
  getPlannerUnmatchedEventRewardLabel,
  shiftPlannerMonth,
} from "~/domain/integrated-planner";
import PlannerCalendarWeek, { DailyResourceChanges, type PlannerForecastStatus } from "./PlannerCalendarWeek";
import PlannerDateScheduleRow from "./PlannerDateScheduleRow";
import PlannerQuickEdit, { type PlannerQuickEditEntry, type PlannerQuickEditKind } from "./PlannerQuickEdit";
import PlannerRecruitmentEditor, {
  type PlannerRecruitmentSavedState,
  type PlannerRecruitmentSaveInput,
  type PlannerRecruitmentSaveResult,
} from "./PlannerRecruitmentEditor";

export type PlannerCalendarShopPlan = {
  timelineUid: string;
  shopStateUid: string | null;
  name: string;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDate: string | null;
  state: EventShopState | null;
  defaultState: EventShopState | null;
};

type PlannerCalendarProps = {
  initialMonth: string;
  todayDateKey: string;
  periods: PlannerPeriod[];
  scheduleAvailability: { dateFacts: boolean; ongoing: boolean };
  calendarResources: Record<string, PlannerDayResources>;
  raidScheduleFacts: readonly PlannerRaidScheduleFact[];
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
  monthCount: number;
  onLoadMore: () => void;
};

type PlannerCalendarDialogView = "summary" | "actions" | "quick-edit" | "recruitment-edit";
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

export default function PlannerCalendar({
  initialMonth,
  todayDateKey,
  periods,
  scheduleAvailability,
  calendarResources,
  raidScheduleFacts,
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
  monthCount,
  onLoadMore,
}: PlannerCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEventUid, setSelectedEventUid] = useState<string | null>(null);
  const [highlightedScheduleItemKey, setHighlightedScheduleItemKey] = useState<string | null>(null);
  const [focusScheduleItemKey, setFocusScheduleItemKey] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<PlannerCalendarDialogView>("summary");
  const [quickEditKind, setQuickEditKind] = useState<PlannerQuickEditKind>("buy");
  const [editingEntry, setEditingEntry] = useState<PlannerQuickEditEntry | null>(null);
  const [preferredRecruitmentEventUid, setPreferredRecruitmentEventUid] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const calendarRootRef = useRef<HTMLDivElement>(null);
  const todayCellRef = useRef<HTMLButtonElement | null>(null);
  const monthRefs = useRef(new Map<string, HTMLElement>());
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

  // Editors share the date sheet. Restore the invoking control when returning to its list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: view transitions move focus to the updated sheet heading.
  useEffect(() => {
    if (!selectedDate) return;

    if (restoreParentFocusRef.current) {
      restoreParentFocusRef.current = false;
      const targets = document
        .getElementById("planner-date-sheet")
        ?.querySelectorAll<HTMLElement>("[data-planner-focus-key]");
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

    document.getElementById("planner-date-sheet")?.querySelector<HTMLElement>("h2")?.focus();
  }, [dialogView, selectedDate]);

  const dateSchedule = useMemo(
    () =>
      selectedDate
        ? getPlannerDateScheduleForDate(periods, selectedDate, timeZone, raidScheduleFacts)
        : { onDate: [], ongoing: [], items: [] },
    [periods, raidScheduleFacts, selectedDate, timeZone],
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
  const dateResourceAttribution = useMemo(
    () =>
      selectedDate ? attributePlannerDateResources(calendarResources[selectedDate], periods, dateSchedule.items) : null,
    [calendarResources, dateSchedule.items, periods, selectedDate],
  );
  const readOnlyBuySources = getPlannerReadOnlyBuySources(
    dateResourceAttribution?.directSources ?? [],
    new Set(selectedOneOffEntries.map(({ id }) => id)),
  );
  function openDate(dateKey: string) {
    parentFocusTargetKeyRef.current = "planner-add-plan";
    restoreParentFocusRef.current = false;
    setSelectedDate(dateKey);
    setSelectedEventUid(null);
    setHighlightedScheduleItemKey(null);
    setFocusScheduleItemKey(null);
    setDialogView("summary");
    setSavedNotice(null);
  }

  function openPeriod(dateKey: string, period: PlannerPeriod) {
    openDate(dateKey);
    const schedule = getPlannerDateScheduleForDate(periods, dateKey, timeZone, raidScheduleFacts);
    const items = schedule.items;
    const item =
      items.find((candidate) => candidate.period === period) ??
      (period.eventUid ? items.find((candidate) => candidate.period.eventUid === period.eventUid) : undefined) ??
      (period.raidUid ? items.find((candidate) => candidate.period.raidUid === period.raidUid) : undefined);
    setHighlightedScheduleItemKey(item?.key ?? null);
    setFocusScheduleItemKey(item?.key ?? null);
  }

  function closeDialog() {
    parentFocusTargetKeyRef.current = "planner-add-plan";
    restoreParentFocusRef.current = false;
    setSelectedDate(null);
    setSelectedEventUid(null);
    setHighlightedScheduleItemKey(null);
    setFocusScheduleItemKey(null);
    setPreferredRecruitmentEventUid(null);
    setDialogView("summary");
    setEditingEntry(null);
    setSavedNotice(null);
  }

  function returnToParentView() {
    restoreParentFocusRef.current = true;
    setDialogView("summary");
    setSelectedEventUid(null);
    setPreferredRecruitmentEventUid(null);
    setEditingEntry(null);
  }

  function rememberParentFocusTarget(targetKey: string) {
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

  function beginRecruitmentEditForEvent(eventUid: string, focusTargetKey: string) {
    const eventPeriod = periods.find((period) => period.eventUid === eventUid);
    if (eventPeriod) beginRecruitmentEdit(eventPeriod, focusTargetKey);
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
                raidScheduleFacts={raidScheduleFacts}
                timeZone={timeZone}
                todayDateKey={todayDateKey}
                selectedDate={selectedDate}
                isFirstWeek={index === 0}
                isLastWeek={index === weeks.length - 1}
                onSelectDate={(dateKey) => openDate(dateKey)}
                onSelectPeriod={(dateKey, _trigger, period) => openPeriod(dateKey, period)}
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

      {selectedDate ? (
        <BottomSheet
          id="planner-date-sheet"
          title={
            dialogView === "summary"
              ? formatDetailHeadingDateKey(selectedDate)
              : dialogView === "actions"
                ? "계획 추가"
                : dialogView === "quick-edit"
                  ? quickEditKind === "buy"
                    ? "청휘석 구매"
                    : quickEditKind === "package"
                      ? "패키지 계획"
                      : "직접 재화 등록"
                  : "관심 학생"
          }
          description={dialogView === "summary" ? undefined : formatDateKey(selectedDate)}
          headerAction={
            dialogView === "actions" ? (
              <Button text="뒤로" size="sm" variant="secondary" onClick={returnToParentView} />
            ) : undefined
          }
          footer={
            dialogView === "summary" ? (
              <div className="flex justify-end pt-3">
                <span className="inline-flex" data-planner-focus-key="planner-add-plan">
                  <Button text="＋ 계획 추가" variant="primary" size="sm" onClick={beginActionChoice} />
                </span>
              </div>
            ) : undefined
          }
          fitContent
          onClose={closeDialog}
        >
          <div className="space-y-5">
            {savedNotice ? (
              <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {savedNotice}
              </p>
            ) : null}

            {dialogView === "summary" ? (
              <ul className="space-y-4 px-2">
                {dateSchedule.items.map((item) => (
                  <li key={item.key}>
                    <PlannerDateScheduleRow
                      item={item}
                      allPeriods={periods}
                      timeZone={timeZone}
                      shopPlans={shopPlans}
                      showResourceChanges={forecastStatus === "ready"}
                      resourceChanges={
                        item.period.kind === "raid"
                          ? (dateResourceAttribution?.raidChanges[item.period.raidUid ?? ""] ?? [])
                          : (dateResourceAttribution?.eventChanges[
                              item.period.eventUid ?? item.eventPeriod?.eventUid ?? ""
                            ] ?? [])
                      }
                      highlighted={item.key === highlightedScheduleItemKey}
                      focusOnMount={item.key === focusScheduleItemKey}
                      onHighlightedFocusComplete={() => setFocusScheduleItemKey(null)}
                      onAddRecruitment={beginRecruitmentEditForEvent}
                      onEditRecruitment={beginRecruitmentEditForEvent}
                    />
                  </li>
                ))}
                {dateResourceAttribution?.unmatchedRaidSources.map((source) => (
                  <li key={source.key} className="flex min-h-14 items-center justify-between gap-3">
                    <span className="break-keep text-sm font-medium text-foreground">총력전/대결전 보상</span>
                    {forecastStatus === "ready" ? <DailyResourceChanges changes={source.changes} /> : null}
                  </li>
                ))}
                {selectedOneOffEntries.map((entry) => {
                  const focusTargetKey = `planner-quick-edit-${entry.id}`;
                  const entryName = entry.description?.trim() || (entry.kind === "buy" ? "청휘석 구매" : "직접 재화");
                  const changes =
                    dateResourceAttribution?.directSources.find((source) => source.key === entry.id)?.changes ?? [];
                  return (
                    <li key={entry.id} className="flex min-h-14 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-keep text-sm font-medium text-foreground">{entryName}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {forecastStatus === "ready" ? <DailyResourceChanges changes={changes} /> : null}
                        <span className="inline-flex shrink-0" data-planner-focus-key={focusTargetKey}>
                          <Button
                            text="수정"
                            size="xs"
                            variant="secondary"
                            onClick={() => beginQuickEdit(entry.kind, entry, focusTargetKey)}
                          />
                        </span>
                      </div>
                    </li>
                  );
                })}
                {readOnlyBuySources.map((source) => (
                  <li key={source.key} className="flex min-h-14 items-center justify-between gap-3">
                    <h3 className="break-keep text-sm font-medium text-foreground">{source.label}</h3>
                    {forecastStatus === "ready" ? <DailyResourceChanges changes={source.changes} /> : null}
                  </li>
                ))}
                {dateResourceAttribution?.unmatchedEventRewardSources.map((source) => (
                  <li key={source.key} className="flex min-h-14 items-center justify-between gap-3">
                    <h3 className="break-keep text-sm font-medium text-foreground">
                      {getPlannerUnmatchedEventRewardLabel(source)}
                    </h3>
                    {forecastStatus === "ready" ? <DailyResourceChanges changes={source.changes} /> : null}
                  </li>
                ))}
                {dateResourceAttribution?.unmatchedEventSources.map((source) => (
                  <li key={source.key} className="flex min-h-14 items-center justify-between gap-3">
                    <h3 className="break-keep text-sm font-medium text-foreground">{source.label}</h3>
                    {forecastStatus === "ready" ? <DailyResourceChanges changes={source.changes} /> : null}
                  </li>
                ))}
                {!scheduleAvailability.dateFacts || !scheduleAvailability.ongoing ? (
                  <li role="status" className="py-3 text-sm text-muted-foreground">
                    일정 정보를 확인할 수 없어요.
                  </li>
                ) : dateSchedule.items.length === 0 &&
                  (dateResourceAttribution?.unmatchedRaidSources.length ?? 0) === 0 &&
                  selectedOneOffEntries.length === 0 &&
                  readOnlyBuySources.length === 0 &&
                  (dateResourceAttribution?.unmatchedEventRewardSources.length ?? 0) === 0 &&
                  (dateResourceAttribution?.unmatchedEventSources.length ?? 0) === 0 ? (
                  <li className="py-3 text-sm text-muted-foreground">이 날 진행 중인 일정이 없어요.</li>
                ) : null}
              </ul>
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
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
