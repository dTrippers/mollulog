import { ArrowPathIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { PyroxeneCalculationMethodContent } from "~/components/features/futures";
import { BottomSheet, Button } from "~/components/primitives";
import type { EventShopState } from "~/domain/event-shop-state";
import { isDefaultEventShopState } from "~/domain/guest-event-shop-planner";
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
import type { PyroxeneCalculationAssumptions as PyroxeneCalculationAssumptionsData } from "~/domain/pyroxene-assumptions";
import PlannerCalendarWeek, { DailyResourceChanges, type PlannerForecastStatus } from "./PlannerCalendarWeek";
import PlannerDateScheduleRow from "./PlannerDateScheduleRow";
import PlannerMonthHeader from "./PlannerMonthHeader";
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
  month: string;
  onMonthChange: (month: string) => void;
  todayDateKey: string;
  periods: PlannerPeriod[];
  scheduleAvailability: { dateFacts: boolean; ongoing: boolean };
  calendarResources: Record<string, PlannerDayResources>;
  raidScheduleFacts: readonly PlannerRaidScheduleFact[];
  pyroxeneAssumptions: PyroxeneCalculationAssumptionsData | null;
  forecastStatus: PlannerForecastStatus;
  statusMessages: string[];
  progressMessages: string[];
  isSignedIn: boolean;
  timeZone: string;
  oneOffEntries: PlannerQuickEditEntry[];
  guestStorageStatus: "ready" | "memory" | "conflict" | "corrupt" | "unavailable" | "loading";
  recruitmentSavedStates: PlannerRecruitmentSavedState[];
  recruitmentIsSaving: boolean;
  recruitmentSaveResult: PlannerRecruitmentSaveResult | null;
  onSaveRecruitment: (input: PlannerRecruitmentSaveInput) => void;
  shopPlans: PlannerCalendarShopPlan[];
  hasPreviousCalendarResources: boolean;
};

type PlannerCalendarDialogView = "summary" | "actions" | "quick-edit" | "recruitment-edit" | "calculation-method";
const WEEKDAYS_SUNDAY_FIRST = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export function getPlannerParentFocusTargetKey(targetKey: string): string {
  return targetKey.startsWith("planner-action-") ? "planner-add-plan" : targetKey;
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
  month,
  onMonthChange,
  todayDateKey,
  periods,
  scheduleAvailability,
  calendarResources,
  raidScheduleFacts,
  pyroxeneAssumptions,
  forecastStatus,
  statusMessages,
  progressMessages,
  isSignedIn,
  timeZone,
  oneOffEntries,
  guestStorageStatus,
  recruitmentSavedStates,
  recruitmentIsSaving,
  recruitmentSaveResult,
  onSaveRecruitment,
  shopPlans,
  hasPreviousCalendarResources,
}: PlannerCalendarProps) {
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEventUid, setSelectedEventUid] = useState<string | null>(null);
  const [highlightedScheduleItemKey, setHighlightedScheduleItemKey] = useState<string | null>(null);
  const [focusScheduleItemKey, setFocusScheduleItemKey] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<PlannerCalendarDialogView>("summary");
  const [quickEditKind, setQuickEditKind] = useState<PlannerQuickEditKind>("buy");
  const [editingEntry, setEditingEntry] = useState<PlannerQuickEditEntry | null>(null);
  const [preferredRecruitmentEventUid, setPreferredRecruitmentEventUid] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const calendarRootRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLElement>(null);
  const todayCellRef = useRef<HTMLButtonElement | null>(null);
  const parentFocusTargetKeyRef = useRef("planner-add-plan");
  const restoreParentFocusRef = useRef(false);
  const previousMonthRef = useRef(month);
  const previousDialogViewRef = useRef(dialogView);
  const previousSheetOpenRef = useRef(sheetOpen);
  const previousFocusMonthRef = useRef(month);
  const suppressDetailFocusRef = useRef(false);

  const monthLayout = useMemo(() => buildPlannerMonthLayout(month, periods, timeZone), [month, periods, timeZone]);
  // Same non-default gate as the shop forecast; kept separate from `isPlanned` (decision A5).
  const shopPlannedEventUids = useMemo(
    () =>
      new Set(
        shopPlans
          .filter(({ state, defaultState }) =>
            Boolean(state && defaultState && !isDefaultEventShopState(state, defaultState)),
          )
          .map(({ timelineUid }) => timelineUid),
      ),
    [shopPlans],
  );

  useEffect(() => {
    const monthChanged = previousMonthRef.current !== month;
    previousMonthRef.current = month;
    if (!monthChanged) return;
    const root = calendarRootRef.current;
    const scrollContainer = document.querySelector<HTMLElement>(".mllg-content-area");
    if (!root || !scrollContainer) return;
    const rootRect = root.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    if (rootRect.top >= containerRect.top) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + rootRect.top - containerRect.top,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [month]);

  useEffect(() => {
    const root = calendarRootRef.current;
    const sidePanel = sidePanelRef.current;
    if (!root || !sidePanel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (getComputedStyle(sidePanel).display !== "none") setSheetOpen(false);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewChanged = previousDialogViewRef.current !== dialogView;
    const sheetOpened = !previousSheetOpenRef.current && sheetOpen;
    const monthChanged = previousFocusMonthRef.current !== month;
    previousDialogViewRef.current = dialogView;
    previousSheetOpenRef.current = sheetOpen;
    previousFocusMonthRef.current = month;
    const suppressDetailFocus = suppressDetailFocusRef.current;
    suppressDetailFocusRef.current = false;
    if (!viewChanged && !sheetOpened) return;
    if (monthChanged || suppressDetailFocus || (sheetOpened && focusScheduleItemKey)) return;

    const frame = requestAnimationFrame(() => {
      const activeContainer = sheetOpen ? document.getElementById("planner-date-sheet") : sidePanelRef.current;
      if (!activeContainer) return;
      if (restoreParentFocusRef.current) {
        restoreParentFocusRef.current = false;
        const targets = activeContainer.querySelectorAll<HTMLElement>("[data-planner-focus-key]");
        const wrapper = Array.from(targets).find(
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
      activeContainer.querySelector<HTMLElement>("h2")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogView, focusScheduleItemKey, month, sheetOpen]);

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
  function hasSideDetail(): boolean {
    const sidePanel = sidePanelRef.current;
    return Boolean(sidePanel && getComputedStyle(sidePanel).display !== "none");
  }

  function openDate(dateKey: string) {
    parentFocusTargetKeyRef.current = "planner-add-plan";
    restoreParentFocusRef.current = false;
    setSelectedDate(dateKey);
    setSelectedEventUid(null);
    setHighlightedScheduleItemKey(null);
    setFocusScheduleItemKey(null);
    setDialogView("summary");
    setSavedNotice(null);
    setSheetOpen(!hasSideDetail());
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
    setSheetOpen(false);
    setSelectedEventUid(null);
    setHighlightedScheduleItemKey(null);
    setFocusScheduleItemKey(null);
    setPreferredRecruitmentEventUid(null);
    setDialogView("summary");
    setEditingEntry(null);
    setSavedNotice(null);
  }

  function returnToParentView() {
    parentFocusTargetKeyRef.current = getPlannerParentFocusTargetKey(parentFocusTargetKeyRef.current);
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

  function beginCalculationMethod() {
    rememberParentFocusTarget("planner-calculation-method");
    setSavedNotice(null);
    setDialogView("calculation-method");
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

  function changeMonth(offset: number) {
    const nextMonth = shiftPlannerMonth(month, offset);
    setSelectedDate(todayDateKey.startsWith(`${nextMonth}-`) ? todayDateKey : `${nextMonth}-01`);
    setSelectedEventUid(null);
    setHighlightedScheduleItemKey(null);
    setFocusScheduleItemKey(null);
    setPreferredRecruitmentEventUid(null);
    setEditingEntry(null);
    setDialogView("summary");
    setSavedNotice(null);
    setSheetOpen(false);
    onMonthChange(nextMonth);
  }

  function selectToday() {
    suppressDetailFocusRef.current = true;
    onMonthChange(todayDateKey.slice(0, 7));
    setSelectedDate(todayDateKey);
    setSelectedEventUid(null);
    setHighlightedScheduleItemKey(null);
    setFocusScheduleItemKey(null);
    setPreferredRecruitmentEventUid(null);
    setEditingEntry(null);
    setDialogView("summary");
    setSavedNotice(null);
    setSheetOpen(false);
    requestAnimationFrame(() => {
      todayCellRef.current?.focus();
      suppressDetailFocusRef.current = false;
    });
  }

  function renderWeek(
    week: PlannerMonthLayout["weeks"][number],
    weekLayout: PlannerMonthLayout["weekLayouts"][number],
    index: number,
  ) {
    return (
      <PlannerCalendarWeek
        key={week[0].dateKey}
        week={week}
        periods={periods}
        calendarResources={calendarResources}
        forecastStatus={forecastStatus}
        hasPreviousCalendarResources={hasPreviousCalendarResources}
        weekLayout={weekLayout}
        raidScheduleFacts={raidScheduleFacts}
        timeZone={timeZone}
        todayDateKey={todayDateKey}
        selectedDate={selectedDate}
        isFirstWeek={index === 0}
        isLastWeek={index === monthLayout.weeks.length - 1}
        onSelectDate={(dateKey) => openDate(dateKey)}
        onSelectPeriod={(dateKey, _trigger, period) => openPeriod(dateKey, period)}
        onTodayCellRef={(element) => {
          todayCellRef.current = element;
        }}
        shopPlannedEventUids={shopPlannedEventUids}
      />
    );
  }

  const showResourceChanges =
    forecastStatus === "ready" || (forecastStatus === "pending" && hasPreviousCalendarResources);
  const resourceChangesStale = forecastStatus === "pending" && hasPreviousCalendarResources;

  function renderForecastChanges(changes: PlannerDayResources["changes"]) {
    return showResourceChanges && changes.length > 0 ? (
      <div className={resourceChangesStale ? "opacity-40" : undefined} aria-busy={resourceChangesStale || undefined}>
        <DailyResourceChanges changes={changes} />
      </div>
    ) : null;
  }

  function renderDetailBody() {
    return (
      <>
        {dialogView === "calculation-method" ? (
          pyroxeneAssumptions ? (
            <PyroxeneCalculationMethodContent
              assumptions={pyroxeneAssumptions}
              showRange={false}
              changePickupChanceTo="/utils/pyroxene"
            />
          ) : null
        ) : (
          <div className="space-y-5">
            {savedNotice ? (
              <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {savedNotice}
              </p>
            ) : null}

            {dialogView === "summary" ? (
              <ul className="space-y-4 p-2">
                {dateSchedule.items.map((item) => (
                  <li key={item.key}>
                    <PlannerDateScheduleRow
                      item={item}
                      allPeriods={periods}
                      timeZone={timeZone}
                      shopPlans={shopPlans}
                      shopPlannedEventUids={shopPlannedEventUids}
                      showResourceChanges={showResourceChanges}
                      resourceChangesStale={resourceChangesStale}
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
                    {renderForecastChanges(source.changes)}
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
                        {renderForecastChanges(changes)}
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
                    <h3 className="whitespace-pre-line break-keep text-sm font-medium text-foreground">
                      {source.label}
                    </h3>
                    {renderForecastChanges(source.changes)}
                  </li>
                ))}
                {dateResourceAttribution?.unmatchedEventRewardSources.map((source) => (
                  <li key={source.key} className="flex min-h-14 items-center justify-between gap-3">
                    <h3 className="whitespace-pre-line break-keep text-sm font-medium text-foreground">
                      {getPlannerUnmatchedEventRewardLabel(source)}
                    </h3>
                    {renderForecastChanges(source.changes)}
                  </li>
                ))}
                {dateResourceAttribution?.unmatchedEventSources.map((source) => (
                  <li key={source.key} className="flex min-h-14 items-center justify-between gap-3">
                    <h3 className="whitespace-pre-line break-keep text-sm font-medium text-foreground">
                      {source.label}
                    </h3>
                    {renderForecastChanges(source.changes)}
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

            {dialogView === "summary" &&
            forecastStatus === "ready" &&
            pyroxeneAssumptions &&
            (calendarResources[selectedDate]?.changes.length ?? 0) > 0 ? (
              <div className="flex justify-end px-2" data-planner-focus-key="planner-calculation-method">
                <Button
                  text="계산 방식"
                  icon={QuestionMarkCircleIcon}
                  size="xs"
                  variant="secondary"
                  onClick={beginCalculationMethod}
                />
              </div>
            ) : null}

            {dialogView === "actions" ? (
              <section aria-labelledby="planner-add-actions" className="space-y-3">
                <h3 id="planner-add-actions" className="text-sm font-semibold">
                  추가할 계획 선택
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <span data-planner-focus-key="planner-action-recruitment">
                    <Button
                      text="모집"
                      variant="secondary"
                      fullWidth
                      onClick={() => beginRecruitmentEdit(undefined, "planner-action-recruitment")}
                    />
                  </span>
                  <span data-planner-focus-key="planner-action-buy">
                    <Button
                      text="청휘석 구매"
                      variant="secondary"
                      fullWidth
                      onClick={() => beginQuickEdit("buy", undefined, "planner-action-buy")}
                    />
                  </span>
                  <span data-planner-focus-key="planner-action-package">
                    <Button
                      text="패키지"
                      variant="secondary"
                      fullWidth
                      onClick={() => beginQuickEdit("package", undefined, "planner-action-package")}
                    />
                  </span>
                  <span data-planner-focus-key="planner-action-other">
                    <Button
                      text="직접 재화"
                      variant="secondary"
                      fullWidth
                      onClick={() => beginQuickEdit("other", undefined, "planner-action-other")}
                    />
                  </span>
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
        )}
      </>
    );
  }

  const detailTitle =
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
          : dialogView === "calculation-method"
            ? "계산 방식"
            : "관심 학생";
  const detailDescription =
    dialogView === "summary"
      ? selectedDate === todayDateKey
        ? `오늘 · 일정 ${dateSchedule.items.length}개`
        : dateSchedule.items.length === 0
          ? "일정 없음"
          : `일정 ${dateSchedule.items.length}개`
      : dialogView === "calculation-method"
        ? "달력의 청휘석 예상 재화를 이렇게 계산해요"
        : formatDateKey(selectedDate);
  const detailHeaderAction =
    dialogView === "summary" ? null : <Button text="뒤로" size="sm" variant="secondary" onClick={returnToParentView} />;
  const detailFooter =
    dialogView === "summary" ? (
      <div className="flex justify-end px-4 pt-3 pb-4">
        <span className="inline-flex" data-planner-focus-key="planner-add-plan">
          <Button text="＋ 계획 추가" variant="primary" size="sm" onClick={beginActionChoice} />
        </span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="contents">
        {progressMessages.length > 0 ? (
          <div className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4">
            <ArrowPathIcon
              className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <div className="space-y-0.5 text-sm font-medium">
              {progressMessages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {statusMessages.map((message) => (
        <div key={message} role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ))}

      {/* 64rem 컨테이너 쿼리는 날짜 칸 너비를 확보하고, 패널 폭은 큰 화면에서도 28rem으로 제한합니다. */}
      <div
        ref={calendarRootRef}
        className="grid grid-cols-1 gap-4 @min-[64rem]/page-available:grid-cols-[minmax(0,1fr)_clamp(20rem,28%,28rem)]"
      >
        <div className="min-w-0">
          <PlannerMonthHeader
            month={month}
            forecastStatus={forecastStatus}
            onPreviousMonth={() => changeMonth(-1)}
            onNextMonth={() => changeMonth(1)}
            onToday={selectToday}
          />
          <div className="space-y-0 max-sm:-mx-4">
            {monthLayout.weeks.map((week, index) => renderWeek(week, monthLayout.weekLayouts[index], index))}
          </div>
        </div>

        <aside
          ref={sidePanelRef}
          aria-label={`${formatDateKey(selectedDate)} 일정 상세`}
          className="hidden min-h-0 self-start rounded-lg border border-border bg-card [--planner-detail-bg:var(--color-card)] @min-[64rem]/page-available:sticky @min-[64rem]/page-available:top-4 @min-[64rem]/page-available:flex @min-[64rem]/page-available:max-h-[calc(100dvh-2rem)] @min-[64rem]/page-available:flex-col"
        >
          {!sheetOpen ? (
            <>
              <header className="shrink-0 space-y-1 p-4">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2
                      id="planner-date-aside-title"
                      tabIndex={-1}
                      className="min-w-0 text-lg font-semibold focus:outline-none"
                    >
                      {detailTitle}
                    </h2>
                    {selectedDate === todayDateKey && dialogView === "summary" ? (
                      <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">
                        오늘
                      </span>
                    ) : null}
                  </div>
                  {detailHeaderAction}
                </div>
                <p className="text-sm text-muted-foreground">{detailDescription}</p>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{renderDetailBody()}</div>
              {detailFooter}
            </>
          ) : null}
        </aside>
      </div>

      {sheetOpen ? (
        <BottomSheet
          id="planner-date-sheet"
          title={detailTitle}
          description={detailDescription}
          headerAction={detailHeaderAction}
          footer={detailFooter}
          onClose={closeDialog}
        >
          <div className="[--planner-detail-bg:var(--color-popover)]">{renderDetailBody()}</div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
