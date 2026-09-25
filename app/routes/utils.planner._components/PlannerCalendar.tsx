import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/16/solid";
import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/primitives";
import { type EventShopState, eventShopStatesEqual } from "~/domain/event-shop-state";
import type {
  PlannerDayResources,
  PlannerMonthLayout,
  PlannerPeriod,
  PlannerPeriodStudent,
} from "~/domain/integrated-planner";
import {
  buildPlannerMonthLayout,
  buildPlannerRecruitmentCandidatesForDate,
  getPlannerPeriodsForDate,
  groupPlannerPeriods,
  groupPlannerPeriodsWithEventMetadata,
  hasPlannerExactEventHandoff,
  mergePlannerEventScheduleGroups,
  partitionPlannerDayResources,
  shiftPlannerMonth,
} from "~/domain/integrated-planner";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import { formatInstant } from "~/lib/date-time";
import { resourceImageUrl, studentImageUrl } from "~/models/assets";
import PlannerCalendarWeek, {
  formatSignedQuantity,
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
};

type PlannerCalendarProps = {
  initialMonth: string;
  todayDateKey: string;
  periods: PlannerPeriod[];
  publicPeriods: PlannerPeriod[];
  dailyResources: Record<string, PlannerDayResources>;
  calendarResources: Record<string, PlannerDayResources>;
  forecastStatus: PlannerForecastStatus;
  statusMessages: string[];
  isSignedIn: boolean;
  timeZone: string;
  oneOffEntries: PlannerQuickEditEntry[];
  guestStorageStatus: "ready" | "memory" | "corrupt" | "loading";
  recruitmentSavedStates: PlannerRecruitmentSavedState[];
  completedRecruitmentEventUids: string[];
  recruitmentPickupChance: PyroxenePickupChance;
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

function isOnDate(period: PlannerPeriod, dateKey: string): boolean {
  return period.startDate <= dateKey && period.endDate >= dateKey;
}

function formatPeriodEndpoint(
  dateKey: string,
  instant: string | null | undefined,
  referenceDateKey: string,
  timeZone: string,
) {
  const endpointYear = instant
    ? Number(formatInstant(instant, { timeZone, format: "YYYY" }))
    : parseDateKey(dateKey)?.year;
  const referenceYear = parseDateKey(referenceDateKey)?.year;
  const includeYear = endpointYear !== undefined && referenceYear !== undefined && endpointYear !== referenceYear;
  if (instant) {
    return formatInstant(instant, { timeZone, format: includeYear ? "YYYY/M/D HH:mm" : "M/D HH:mm" });
  }
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return includeYear ? `${date.year}/${date.month}/${date.day}` : `${date.month}/${date.day}`;
}

function formatDateOnly(dateKey: string, referenceDateKey: string): string {
  const date = parseDateKey(dateKey);
  const referenceYear = parseDateKey(referenceDateKey)?.year;
  if (!date) return dateKey;
  return date.year !== referenceYear ? `${date.year}/${date.month}/${date.day}` : `${date.month}/${date.day}`;
}

function formatEventRange(period: PlannerPeriod, referenceDateKey: string, timeZone: string): string {
  const start = formatPeriodEndpoint(period.startDate, period.startAt, referenceDateKey, timeZone);
  if (period.endless) return `${start}부터`;
  if (!period.endAt) return `${start} · 종료 미정`;
  const end = formatPeriodEndpoint(period.endDate, period.endAt, referenceDateKey, timeZone);
  return `${start} – ${end}`;
}

function plannerRunTypeLabel(period: PlannerPeriod): string | null {
  if (period.runType === "first") return "최초";
  if (period.runType === "rerun") return "복각";
  if (period.runType === "permanent") return "상설";
  return null;
}

function formatShopDeadline(period: PlannerPeriod, referenceDateKey: string): string {
  return `${formatDateOnly(period.endDate, referenceDateKey)}까지`;
}

function formatRecruitmentEnd(period: PlannerPeriod, referenceDateKey: string, timeZone: string): string {
  return period.endAt
    ? `${formatPeriodEndpoint(period.endDate, period.endAt, referenceDateKey, timeZone)} 종료`
    : "종료 시각을 확인할 수 없어요";
}

function recruitmentBasisLabel(
  eventUid: string | undefined,
  savedStates: readonly PlannerRecruitmentSavedState[],
  completedEventUids: ReadonlySet<string>,
  pickupChance: PyroxenePickupChance,
): string {
  if (eventUid && completedEventUids.has(eventUid)) return "모집 완료";
  const expectedTrials = savedStates.find((state) => state.eventUid === eventUid)?.expectedTrials;
  if (expectedTrials != null) return `직접 입력 ${expectedTrials.toLocaleString("ko-KR")}회`;
  if (pickupChance === "ceil") return "모두 천장";
  return "자동 추정";
}

function hasExactEventHandoff(period: PlannerPeriod, dateKey: string, periods: readonly PlannerPeriod[]): boolean {
  return periods.some((other) => {
    return isOnDate(other, dateKey) && hasPlannerExactEventHandoff(period, other);
  });
}

function PlannerRecruitmentAvatar({ student }: { student: PlannerPeriodStudent }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted ring-2 ring-popover">
      {!imageFailed ? (
        <img
          src={studentImageUrl(student.imageUid ?? student.uid)}
          alt=""
          aria-hidden="true"
          className="size-full object-cover object-top"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </span>
  );
}

function PlannerRecruitmentPortraits({ students }: { students: readonly PlannerPeriodStudent[] }) {
  const visibleStudents = students.slice(0, 3);
  return (
    <span className="inline-flex shrink-0 items-center pl-1" aria-hidden="true">
      {visibleStudents.map((student, index) => (
        <span key={student.uid} className={index > 0 ? "-ml-2.5" : ""}>
          <PlannerRecruitmentAvatar student={student} />
        </span>
      ))}
      {students.length > visibleStudents.length ? (
        <span className="-ml-2.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground ring-2 ring-popover">
          +{students.length - visibleStudents.length}
        </span>
      ) : null}
    </span>
  );
}

function PlannerRecruitmentRow({
  students,
  eventName,
  status,
  deadline,
  actionText,
  actionFocusKey,
  onAction,
}: {
  students: readonly PlannerPeriodStudent[];
  eventName?: string;
  status: string;
  deadline: string;
  actionText?: string;
  actionFocusKey?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <div className="flex min-w-0 grow basis-64 items-center gap-3">
        {students.length > 0 ? <PlannerRecruitmentPortraits students={students} /> : null}
        <div className="min-w-0 flex-1">
          {eventName ? <p className="text-xs text-muted-foreground">{eventName}</p> : null}
          <p className="break-keep wrap-anywhere text-sm font-medium text-foreground">
            {students.length > 0 ? students.map(({ name }) => name).join(", ") : "관심 학생을 선택하지 않았어요."}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{status}</span> · {deadline}
          </p>
        </div>
      </div>
      {actionText && actionFocusKey && onAction ? (
        <span className="inline-flex shrink-0" data-planner-focus-key={actionFocusKey}>
          <Button
            text={actionText}
            size="xs"
            variant="secondary"
            className="bg-muted shadow-xs hover:bg-muted/70 dark:shadow-none"
            onClick={onAction}
          />
        </span>
      ) : null}
    </div>
  );
}

function shopPlanHasInput(plan: PlannerCalendarShopPlan): boolean {
  if (!plan.state || !plan.defaultState) return false;
  return !eventShopStatesEqual(plan.state, plan.defaultState);
}

function sourceChangesForDetail(source: PlannerDayResources["sources"][number]) {
  if (source.changes.length > 0) return source.changes;
  return source.type === "event" ? [{ key: "pyroxene" as const, quantity: 0 }] : [];
}

function recruitmentCostExplanation(
  eventUid: string | undefined,
  savedStates: readonly PlannerRecruitmentSavedState[],
  completedEventUids: ReadonlySet<string>,
  pickupChance: PyroxenePickupChance,
): string {
  if (eventUid && completedEventUids.has(eventUid)) {
    return "모집 완료로 처리되어 향후 소비를 0으로 계산했어요.";
  }
  const expectedTrials = savedStates.find((state) => state.eventUid === eventUid)?.expectedTrials;
  if (expectedTrials != null) {
    return `직접 입력 기준이에요. 입력한 모집 횟수는 ${expectedTrials.toLocaleString("ko-KR")}회예요.`;
  }
  if (pickupChance === "ceil") {
    return "모두 천장까지 진행한다는 가정으로 계산했어요.";
  }
  return pickupChance === "average_pity"
    ? "픽업 확률과 천장 규칙을 반영한 평균 예상치예요. 실제 결과에 따라 달라질 수 있어요."
    : "픽업 확률을 반영한 평균 예상치예요. 실제 결과에 따라 달라질 수 있어요.";
}

function headingIdForShopPlan(groupKey: string, plan: PlannerCalendarShopPlan): string {
  const value = `${groupKey}-${plan.shopStateUid ?? plan.timelineUid}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `planner-shop-summary-${value}`;
}

function PlannerEventThumbnail({ period }: { period?: PlannerPeriod }) {
  const [imageFailed, setImageFailed] = useState(false);
  return period?.imageUrl && !imageFailed ? (
    <img
      src={period.imageUrl}
      alt=""
      className="size-16 shrink-0 rounded-md object-cover sm:size-20"
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <div aria-hidden="true" className="size-16 shrink-0 rounded-md bg-muted sm:size-20" />
  );
}

function PlannerEventDates({
  eventPeriod,
  shopPeriod,
  referenceDateKey,
  timeZone,
}: {
  eventPeriod?: PlannerPeriod;
  shopPeriod?: PlannerPeriod;
  referenceDateKey: string;
  timeZone: string;
}) {
  if (!eventPeriod && !shopPeriod) return null;
  const eventRange = eventPeriod ? formatEventRange(eventPeriod, referenceDateKey, timeZone) : null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
      {eventPeriod && eventRange ? (
        <>
          <dt className="text-muted-foreground">{plannerRunTypeLabel(eventPeriod) ?? "이벤트"}</dt>
          <dd className="min-w-0 tabular-nums">{eventRange}</dd>
        </>
      ) : null}
      {shopPeriod ? (
        <>
          <dt className="text-muted-foreground">상점 교환</dt>
          <dd className="tabular-nums">{formatShopDeadline(shopPeriod, referenceDateKey)}</dd>
        </>
      ) : null}
    </dl>
  );
}

function PlannerEventCardActions({
  eventPeriod,
  shopCalculatorHref,
  editableShopPlans = [],
  shopEditFocusKey,
  onEditShop,
  className,
}: {
  eventPeriod?: PlannerPeriod;
  shopCalculatorHref?: string;
  editableShopPlans?: readonly PlannerCalendarShopPlan[];
  shopEditFocusKey?: string;
  onEditShop?: () => void;
  className?: string;
}) {
  if (!eventPeriod && !shopCalculatorHref && editableShopPlans.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 max-[359px]:flex-nowrap max-[359px]:gap-1 ${className ?? ""}`.trim()}>
      {eventPeriod ? (
        <Button
          text="이벤트 상세"
          size="xs"
          variant="secondary"
          className="shadow-xs dark:shadow-none"
          to={eventPeriod.href}
        />
      ) : null}
      {shopCalculatorHref ? (
        <Button
          text="상점 계산기"
          size="xs"
          variant="secondary"
          className="shadow-xs dark:shadow-none"
          to={shopCalculatorHref}
        />
      ) : null}
      {editableShopPlans.length > 0 && shopEditFocusKey && onEditShop ? (
        <span className="inline-flex shrink-0" data-planner-focus-key={shopEditFocusKey}>
          <Button
            text="보유 재화 수정"
            size="xs"
            variant="secondary"
            className="shadow-xs dark:shadow-none"
            onClick={onEditShop}
          />
        </span>
      ) : null}
    </div>
  );
}

function PlannerDetailResourceValues({
  changes,
  emphasized = false,
}: {
  changes: PlannerDayResources["changes"];
  emphasized?: boolean;
}) {
  if (changes.length === 0) return null;
  return (
    <span className={`flex flex-col items-end ${emphasized ? "gap-1" : "gap-0.5"}`}>
      {changes.map(({ key, quantity }) => {
        const resource = RESOURCE_PRESENTATION[key];
        return (
          <span
            key={key}
            className={`grid w-24 grid-cols-[1rem_4.75rem] items-center gap-1 ${emphasized ? "leading-6" : "leading-5"}`}
          >
            <img
              src={resourceImageUrl(resource.imageType, resource.uid)}
              alt={resource.label}
              className="size-4 shrink-0 object-contain"
              loading="lazy"
            />
            <span
              className={`text-right tabular-nums ${
                emphasized ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"
              }`}
            >
              {formatSignedQuantity(quantity)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function PlannerCalendar({
  initialMonth,
  todayDateKey,
  periods,
  publicPeriods,
  dailyResources,
  calendarResources,
  forecastStatus,
  statusMessages,
  isSignedIn,
  timeZone,
  oneOffEntries,
  guestStorageStatus,
  recruitmentSavedStates,
  completedRecruitmentEventUids,
  recruitmentPickupChance,
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
  const [isOtherExpanded, setIsOtherExpanded] = useState(false);
  const [recruitmentHelpKey, setRecruitmentHelpKey] = useState<string | null>(null);
  const [pinnedRecruitmentHelpKey, setPinnedRecruitmentHelpKey] = useState<string | null>(null);
  const [hoveredRecruitmentHelpKey, setHoveredRecruitmentHelpKey] = useState<string | null>(null);
  const [focusedRecruitmentHelpKey, setFocusedRecruitmentHelpKey] = useState<string | null>(null);
  const [dismissedRecruitmentHelpKey, setDismissedRecruitmentHelpKey] = useState<string | null>(null);
  const [quickEditKind, setQuickEditKind] = useState<PlannerQuickEditKind>("buy");
  const [editingEntry, setEditingEntry] = useState<PlannerQuickEditEntry | null>(null);
  const [editingShopPlanKey, setEditingShopPlanKey] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const calendarRootRef = useRef<HTMLDivElement>(null);
  const todayCellRef = useRef<HTMLButtonElement | null>(null);
  const monthRefs = useRef(new Map<string, HTMLElement>());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousSelectedDateRef = useRef<string | null>(null);
  const summaryScopeRef = useRef<{
    focusedPeriodKey: string | null;
    eventContextUid: string | null;
  } | null>(null);
  const summaryFocusTargetKeyRef = useRef("planner-add-plan");
  const restoreSummaryFocusRef = useRef(false);
  const [activeMonth, setActiveMonth] = useState(initialMonth);
  const [showMonthToolbar, setShowMonthToolbar] = useState(false);
  const isRecruitmentHelpOpen = Boolean(
    recruitmentHelpKey &&
      (pinnedRecruitmentHelpKey === recruitmentHelpKey ||
        (dismissedRecruitmentHelpKey !== recruitmentHelpKey &&
          (hoveredRecruitmentHelpKey === recruitmentHelpKey || focusedRecruitmentHelpKey === recruitmentHelpKey))),
  );

  function resetRecruitmentHelp() {
    setRecruitmentHelpKey(null);
    setPinnedRecruitmentHelpKey(null);
    setHoveredRecruitmentHelpKey(null);
    setFocusedRecruitmentHelpKey(null);
    setDismissedRecruitmentHelpKey(null);
  }

  function dismissRecruitmentHelp(helpKey = recruitmentHelpKey) {
    if (!helpKey) return;
    setPinnedRecruitmentHelpKey(null);
    setHoveredRecruitmentHelpKey((current) => (current === helpKey ? null : current));
    setFocusedRecruitmentHelpKey((current) => (current === helpKey ? null : current));
    setDismissedRecruitmentHelpKey(helpKey);
  }

  useEffect(() => {
    if (!isRecruitmentHelpOpen || !recruitmentHelpKey) return;
    const activeKey = recruitmentHelpKey;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-planner-recruitment-help]")) return;
      setPinnedRecruitmentHelpKey(null);
      setDismissedRecruitmentHelpKey(activeKey);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [isRecruitmentHelpOpen, recruitmentHelpKey]);

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
  const datePeriods = selectedDate ? getPlannerPeriodsForDate(periods, selectedDate, todayDateKey) : [];
  const selectedPeriods = eventContextUid
    ? periods.filter((period) => period.eventUid === eventContextUid)
    : datePeriods;
  const datePublicPeriods = selectedDate ? getPlannerPeriodsForDate(publicPeriods, selectedDate, todayDateKey) : [];
  const publicCandidates = selectedDate
    ? datePublicPeriods.filter(
        (period) => !plannedPeriodKeys.has(period.key) && (!eventContextUid || period.eventUid === eventContextUid),
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
  const selectedResourceBreakdown = selectedResources ? partitionPlannerDayResources(selectedResources) : null;
  const calendarSourceRows = selectedResourceBreakdown?.calendarSources.filter(
    (source) => source.changes.length > 0 || source.type === "event",
  );
  const otherSourceRows = selectedResourceBreakdown?.otherSources ?? [];
  const completedRecruitmentEventUidSet = useMemo(
    () => new Set(completedRecruitmentEventUids),
    [completedRecruitmentEventUids],
  );
  const representedOneOffIds = new Set(selectedResources?.sources.map((source) => source.key) ?? []);
  const unrepresentedOneOffEntries = selectedOneOffEntries.filter((entry) => !representedOneOffIds.has(entry.id));
  const hasLedgerEditActions = selectedOneOffEntries.length > 0;
  const resourceRowGridClass = hasLedgerEditActions
    ? "grid-cols-[minmax(0,1fr)_auto_3.25rem]"
    : "grid-cols-[minmax(0,1fr)_auto]";
  const recruitmentHelpPopoverWidthClass = hasLedgerEditActions
    ? "w-[min(20rem,calc(100%_-_10.5rem))]"
    : "w-[min(20rem,calc(100%_-_7.25rem))]";
  const summaryGroups = useMemo(() => groupPlannerPeriods(selectedPeriods), [selectedPeriods]);
  const personalRecruitments = useMemo(
    () =>
      summaryGroups.flatMap((group) =>
        group.periods
          .filter((period) => period.kind === "recruitment")
          .map((period) => ({ eventName: group.name, period })),
      ),
    [summaryGroups],
  );
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
  const publicGroups = useMemo(
    () => groupPlannerPeriodsWithEventMetadata(publicCandidates, publicPeriods),
    [publicCandidates, publicPeriods],
  );
  const eventScheduleGroups = useMemo(
    () => mergePlannerEventScheduleGroups(summaryGroups, publicGroups),
    [publicGroups, summaryGroups],
  );
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
    resetRecruitmentHelp();
    setIsOtherExpanded(false);
    triggerRef.current = trigger;
    summaryFocusTargetKeyRef.current = "planner-add-plan";
    restoreSummaryFocusRef.current = false;
    setSelectedDate(dateKey);
    const nextFocusedPeriodKey = period?.key ?? null;
    const nextEventContextUid =
      period && !hasExactEventHandoff(period, dateKey, periods) ? (period.eventUid ?? null) : null;
    summaryScopeRef.current = {
      focusedPeriodKey: nextFocusedPeriodKey,
      eventContextUid: nextEventContextUid,
    };
    setFocusedPeriodKey(nextFocusedPeriodKey);
    setEventContextUid(nextEventContextUid);
    setDialogView("summary");
    setSavedNotice(null);
  }

  function closeDialog() {
    resetRecruitmentHelp();
    setIsOtherExpanded(false);
    summaryFocusTargetKeyRef.current = "planner-add-plan";
    restoreSummaryFocusRef.current = false;
    setSelectedDate(null);
    setFocusedPeriodKey(null);
    setEventContextUid(null);
    summaryScopeRef.current = null;
    setDialogView("summary");
    setEditingEntry(null);
    setEditingShopPlanKey(null);
    setSavedNotice(null);
  }

  function returnToSummary() {
    resetRecruitmentHelp();
    restoreSummaryFocusRef.current = true;
    const summaryScope = summaryScopeRef.current;
    if (summaryScope) {
      setFocusedPeriodKey(summaryScope.focusedPeriodKey);
      setEventContextUid(summaryScope.eventContextUid);
    }
    setDialogView("summary");
    setEditingEntry(null);
    setEditingShopPlanKey(null);
  }

  function rememberSummaryFocusTarget(targetKey: string) {
    if (dialogView === "summary") summaryFocusTargetKeyRef.current = targetKey;
  }

  function beginActionChoice() {
    resetRecruitmentHelp();
    rememberSummaryFocusTarget("planner-add-plan");
    setDialogView("actions");
  }

  function beginQuickEdit(kind: PlannerQuickEditKind, entry?: PlannerQuickEditEntry, focusTargetKey?: string) {
    resetRecruitmentHelp();
    rememberSummaryFocusTarget(focusTargetKey ?? "planner-add-plan");
    setQuickEditKind(kind);
    setEditingEntry(entry ?? null);
    setSavedNotice(null);
    setDialogView("quick-edit");
  }

  function beginRecruitmentEdit(period?: PlannerPeriod, focusTargetKey?: string) {
    resetRecruitmentHelp();
    rememberSummaryFocusTarget(focusTargetKey ?? "planner-add-plan");
    if (period) {
      setFocusedPeriodKey(period.key);
      setEventContextUid(period.eventUid ?? null);
    }
    setSavedNotice(null);
    setDialogView("recruitment-edit");
  }

  function beginShopEdit(plan?: PlannerCalendarShopPlan, focusTargetKey?: string) {
    resetRecruitmentHelp();
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

  function renderSourceRows(sources: PlannerDayResources["sources"], groupKey: string) {
    if (sources.length === 0) return null;
    return (
      <ul className="space-y-0">
        {sources.map((source, index) => {
          const editEntry = selectedOneOffEntries.find((entry) => entry.id === source.key);
          const focusTargetKey = editEntry ? `quick-edit-${editEntry.id}` : undefined;
          const helpKey = `${groupKey}:${source.key}`;
          const helpId = `planner-recruitment-help-${groupKey}-${index}`;
          const isHelpOpen = source.type === "event" && isRecruitmentHelpOpen && recruitmentHelpKey === helpKey;
          const helpText = recruitmentCostExplanation(
            source.eventUid,
            recruitmentSavedStates,
            completedRecruitmentEventUidSet,
            recruitmentPickupChance,
          );

          return (
            <li
              key={source.key}
              className={`relative grid ${resourceRowGridClass} min-h-8 items-start gap-x-2 py-1 text-sm text-muted-foreground`}
              onMouseLeave={
                source.type === "event"
                  ? () => {
                      setHoveredRecruitmentHelpKey((current) => (current === helpKey ? null : current));
                      if (focusedRecruitmentHelpKey !== helpKey && pinnedRecruitmentHelpKey !== helpKey) {
                        setRecruitmentHelpKey((current) => (current === helpKey ? null : current));
                        setDismissedRecruitmentHelpKey((current) => (current === helpKey ? null : current));
                      }
                    }
                  : undefined
              }
            >
              <div
                className={`flex min-w-0 flex-wrap items-center gap-x-1 leading-5 ${groupKey === "other" ? "pl-7" : "pl-3"}`}
              >
                <span className="min-w-0 break-keep">{source.label ?? "예상 항목 이름을 확인할 수 없어요"}</span>
                {source.type === "event" ? (
                  <span className="inline-flex shrink-0" data-planner-recruitment-help>
                    <button
                      type="button"
                      aria-label="모집 소비 계산 안내"
                      aria-expanded={isHelpOpen}
                      aria-describedby={isHelpOpen ? helpId : undefined}
                      aria-controls={isHelpOpen ? helpId : undefined}
                      className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      onMouseEnter={() => {
                        setRecruitmentHelpKey(helpKey);
                        setDismissedRecruitmentHelpKey(null);
                        setHoveredRecruitmentHelpKey(helpKey);
                      }}
                      onFocus={() => {
                        setRecruitmentHelpKey(helpKey);
                        setDismissedRecruitmentHelpKey(null);
                        setFocusedRecruitmentHelpKey(helpKey);
                      }}
                      onBlur={() => {
                        setFocusedRecruitmentHelpKey((current) => (current === helpKey ? null : current));
                        if (hoveredRecruitmentHelpKey !== helpKey && pinnedRecruitmentHelpKey !== helpKey) {
                          setRecruitmentHelpKey((current) => (current === helpKey ? null : current));
                          setDismissedRecruitmentHelpKey((current) => (current === helpKey ? null : current));
                        }
                      }}
                      onClick={() => {
                        if (pinnedRecruitmentHelpKey === helpKey) {
                          dismissRecruitmentHelp(helpKey);
                          return;
                        }
                        setRecruitmentHelpKey(helpKey);
                        setPinnedRecruitmentHelpKey(helpKey);
                        setDismissedRecruitmentHelpKey(null);
                      }}
                    >
                      <span
                        className={`grid size-4 place-items-center rounded-full bg-muted text-[11px] font-semibold leading-none ${
                          isHelpOpen ? "ring-1 ring-inset ring-muted-foreground/30" : ""
                        }`}
                      >
                        ?
                      </span>
                    </button>
                  </span>
                ) : null}
              </div>
              <PlannerDetailResourceValues changes={sourceChangesForDetail(source)} />
              {hasLedgerEditActions ? (
                <span className="-mt-1 flex min-h-8 items-start justify-center">
                  {editEntry && focusTargetKey ? (
                    <span className="inline-flex" data-planner-focus-key={focusTargetKey}>
                      <Button
                        text="수정"
                        size="xs"
                        variant="secondary"
                        className="bg-muted shadow-xs hover:bg-muted/70 dark:shadow-none"
                        onClick={() => beginQuickEdit(editEntry.kind, editEntry, focusTargetKey)}
                      />
                    </span>
                  ) : null}
                </span>
              ) : null}
              {isHelpOpen ? (
                <div
                  id={helpId}
                  role="tooltip"
                  data-planner-recruitment-help
                  className={`absolute left-3 top-full z-20 mt-0.5 ${recruitmentHelpPopoverWidthClass} min-w-28 max-w-[20rem] break-words rounded-md bg-popover px-2.5 py-2 text-[13px] font-normal leading-normal text-popover-foreground shadow-lg dark:bg-muted dark:shadow-md dark:shadow-black/20`}
                >
                  {helpText}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderUnrepresentedOneOffEntries() {
    if (unrepresentedOneOffEntries.length === 0) return null;
    return (
      <div className="max-w-md">
        <h4 className="mb-1 text-xs font-semibold text-muted-foreground">직접 입력한 계획</h4>
        <ul className="space-y-0">
          {unrepresentedOneOffEntries.map((entry) => {
            const entryChanges = (Object.keys(RESOURCE_PRESENTATION) as (keyof typeof RESOURCE_PRESENTATION)[])
              .filter((key) => entry.resources[key] !== 0)
              .map((key) => ({ key, quantity: entry.resources[key] }));
            const focusTargetKey = `quick-edit-${entry.id}`;
            return (
              <li
                key={entry.id}
                className={`grid ${resourceRowGridClass} min-h-8 items-start gap-x-2 py-1 text-sm text-muted-foreground`}
              >
                <span className="min-w-0 break-keep pl-3 leading-5">{entry.description || "직접 입력"}</span>
                <PlannerDetailResourceValues changes={entryChanges} />
                <span className="-mt-1 flex min-h-8 items-start justify-center">
                  <span className="inline-flex" data-planner-focus-key={focusTargetKey}>
                    <Button
                      text="수정"
                      size="xs"
                      variant="secondary"
                      className="bg-muted shadow-xs hover:bg-muted/70 dark:shadow-none"
                      onClick={() => beginQuickEdit(entry.kind, entry, focusTargetKey)}
                    />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  function finishSavedEdit(message: string) {
    setSavedNotice(message);
    returnToSummary();
  }

  function scrollToToday() {
    const todayCell = todayCellRef.current;
    if (!todayCell) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    todayCell.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    requestAnimationFrame(() => todayCell.focus());
  }

  function renderMonth(monthLayout: PlannerMonthLayout) {
    const { monthKey, weeks, weekLayouts, maxEventLaneCount, laneHeights } = monthLayout;
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
                publicPeriods={publicPeriods}
                plannedPeriodKeys={plannedPeriodKeys}
                calendarResources={calendarResources}
                forecastStatus={forecastStatus}
                weekLayout={weekLayouts[index]}
                maxEventLaneCount={maxEventLaneCount}
                laneHeights={laneHeights}
                timeZone={timeZone}
                todayDateKey={todayDateKey}
                selectedDate={selectedDate}
                isFirstWeek={index === 0}
                isLastWeek={index === weeks.length - 1}
                onSelectDate={(dateKey, trigger) => openDate(dateKey, trigger)}
                onSelectPeriod={(dateKey, trigger, period) => openDate(dateKey, trigger, period)}
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
        onCancel={(event) => {
          if (!isRecruitmentHelpOpen) return;
          event.preventDefault();
          dismissRecruitmentHelp();
        }}
      >
        {selectedDate ? (
          <div className="flex max-h-[85dvh] flex-col lg:max-h-[80vh]">
            <header className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3 pt-5 lg:px-6 lg:pt-6">
              <div className="min-w-0">
                <h2 ref={dialogHeadingRef} id="planner-day-title" tabIndex={-1} className="text-lg font-semibold">
                  {dialogView === "summary" ? (
                    <>
                      <span aria-hidden="true">{formatDetailHeadingDateKey(selectedDate)}</span>
                      <span className="sr-only">{formatDateKey(selectedDate)}</span>
                    </>
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {`${formatDateKey(selectedDate)}${contextEventName ? ` · ${contextEventName}` : ""}`}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dialogView === "actions" || dialogView === "shop-choice" ? (
                  <Button text="뒤로" size="sm" variant="secondary" onClick={returnToSummary} />
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
                  <section aria-labelledby="planner-day-resources" className="max-w-md">
                    <h3 id="planner-day-resources" className="mb-2 text-base font-semibold">
                      예상 재화 증감
                    </h3>
                    {forecastStatus === "ready" && selectedResources ? (
                      <div className="space-y-0">
                        {calendarSourceRows && calendarSourceRows.length > 0
                          ? renderSourceRows(calendarSourceRows, "calendar")
                          : null}
                        {otherSourceRows.length > 0 ? (
                          <>
                            <div className={`grid ${resourceRowGridClass} min-h-9 items-center gap-x-2 text-sm`}>
                              <button
                                type="button"
                                aria-expanded={isOtherExpanded}
                                aria-controls="planner-other-resource-sources"
                                className="flex min-h-9 min-w-0 items-center gap-1 rounded-md pl-3 pr-1 text-left text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                onClick={() => setIsOtherExpanded((expanded) => !expanded)}
                              >
                                <span>기타</span>
                                <span className="text-xs">{otherSourceRows.length}건</span>
                                <ChevronDownSolidIcon
                                  aria-hidden="true"
                                  className={`size-4 shrink-0 transition-transform ${isOtherExpanded ? "rotate-180" : ""}`}
                                />
                              </button>
                              <PlannerDetailResourceValues changes={selectedResourceBreakdown?.otherChanges ?? []} />
                              {hasLedgerEditActions ? <span aria-hidden="true" /> : null}
                            </div>
                            <div id="planner-other-resource-sources" hidden={!isOtherExpanded}>
                              {renderSourceRows(otherSourceRows, "other")}
                            </div>
                          </>
                        ) : null}
                        {(!calendarSourceRows || calendarSourceRows.length === 0) && otherSourceRows.length === 0 ? (
                          <p className="min-h-8 py-1 text-sm text-muted-foreground">예상 재화 변동이 없어요.</p>
                        ) : null}
                        {renderUnrepresentedOneOffEntries()}
                        <div
                          className={`mt-1.5 grid ${resourceRowGridClass} min-h-10 items-start gap-x-2 border-t border-border pt-1.5 text-foreground`}
                        >
                          <span className="pl-3 pt-0.5 text-sm font-semibold leading-6">이 날 전체 증감</span>
                          <PlannerDetailResourceValues
                            emphasized
                            changes={
                              selectedResources.changes.length > 0
                                ? selectedResources.changes
                                : [{ key: "pyroxene", quantity: 0 }]
                            }
                          />
                          {hasLedgerEditActions ? <span aria-hidden="true" /> : null}
                        </div>
                      </div>
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
                    {!selectedResources || forecastStatus !== "ready" ? renderUnrepresentedOneOffEntries() : null}
                  </section>

                  {personalRecruitments.length > 0 ? (
                    <section aria-labelledby="planner-recruitment-summary">
                      <h3 id="planner-recruitment-summary" className="mb-2 text-base font-semibold">
                        관심 학생 모집
                      </h3>
                      <ul className="space-y-3">
                        {personalRecruitments.map(({ eventName, period }) => {
                          const focusTargetKey = `recruitment-edit-${period.key}`;
                          return (
                            <li key={period.key}>
                              <PlannerRecruitmentRow
                                students={period.students ?? []}
                                eventName={personalRecruitments.length > 1 ? eventName : undefined}
                                status={recruitmentBasisLabel(
                                  period.eventUid,
                                  recruitmentSavedStates,
                                  completedRecruitmentEventUidSet,
                                  recruitmentPickupChance,
                                )}
                                deadline={formatRecruitmentEnd(period, selectedDate ?? period.startDate, timeZone)}
                                actionText="모집 수정"
                                actionFocusKey={focusTargetKey}
                                onAction={() => beginRecruitmentEdit(period, focusTargetKey)}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {eventScheduleGroups.length > 0 ? (
                    <section aria-labelledby="planner-event-summary">
                      <h3 id="planner-event-summary" className="mb-2 text-base font-semibold">
                        이벤트 일정
                      </h3>
                      <div className="space-y-2">
                        {eventScheduleGroups.map(({ group, isPersonal, publicRecruitmentPeriods }) => {
                          const eventPeriod = group.periods.find((period) => period.kind === "event");
                          const shopPeriod = group.periods.find((period) => period.kind === "shop");
                          const groupShopPlans =
                            isPersonal && group.eventUid
                              ? shopPlans.filter(
                                  (plan) => plan.timelineUid === group.eventUid && shopPlanHasInput(plan),
                                )
                              : [];
                          const editableShopPlans = groupShopPlans.filter((plan) => plan.shopStateUid !== null);
                          const shopEditFocusKey = `shop-edit-${editableShopPlans[0]?.shopStateUid ?? group.eventUid ?? group.key}`;
                          const shopCalculatorHref = groupShopPlans[0]
                            ? `/events/${encodeURIComponent(groupShopPlans[0].timelineUid)}/shop`
                            : shopPeriod?.href;
                          return (
                            <div key={group.key} className="rounded-lg bg-muted/50 p-3 dark:bg-card">
                              <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
                                <div className="row-span-2">
                                  <PlannerEventThumbnail
                                    key={eventPeriod?.imageUrl ?? group.key}
                                    period={eventPeriod}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="break-keep text-sm font-semibold">{group.name}</p>
                                  <PlannerEventDates
                                    eventPeriod={eventPeriod}
                                    shopPeriod={shopPeriod}
                                    referenceDateKey={
                                      selectedDate ?? eventPeriod?.startDate ?? shopPeriod?.startDate ?? ""
                                    }
                                    timeZone={timeZone}
                                  />
                                </div>
                                <PlannerEventCardActions
                                  eventPeriod={eventPeriod}
                                  shopCalculatorHref={shopCalculatorHref}
                                  editableShopPlans={editableShopPlans}
                                  shopEditFocusKey={shopEditFocusKey}
                                  onEditShop={() =>
                                    beginShopEdit(
                                      editableShopPlans.length === 1 ? editableShopPlans[0] : undefined,
                                      shopEditFocusKey,
                                    )
                                  }
                                  className="col-span-2 min-[360px]:col-start-2 min-[360px]:col-span-1"
                                />
                              </div>
                              {groupShopPlans.map((plan) => {
                                const headingId = headingIdForShopPlan(group.key, plan);
                                return (
                                  <div key={plan.shopStateUid ?? plan.timelineUid} className="mt-2">
                                    {plan.state && plan.defaultState ? (
                                      <PlannerShopSummary
                                        content={plan.content}
                                        state={plan.state}
                                        defaultState={plan.defaultState}
                                        headingId={headingId}
                                      />
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        이벤트 상점의 기본 입력을 확인할 수 없어요.
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                              {publicRecruitmentPeriods.length > 0 ? (
                                <div className="mt-3 space-y-3">
                                  {publicRecruitmentPeriods.map((period, index) => {
                                    const firstRecruitmentPeriod = publicRecruitmentPeriods[0];
                                    const recruitmentFocusKey = `recruitment-add-${group.key}`;
                                    const isFirstRecruitment = index === 0;
                                    return (
                                      <PlannerRecruitmentRow
                                        key={period.key}
                                        students={period.students ?? []}
                                        status="모집"
                                        deadline={formatRecruitmentEnd(
                                          period,
                                          selectedDate ?? period.startDate,
                                          timeZone,
                                        )}
                                        actionText={isFirstRecruitment ? "모집 계획 추가" : undefined}
                                        actionFocusKey={isFirstRecruitment ? recruitmentFocusKey : undefined}
                                        onAction={
                                          isFirstRecruitment
                                            ? () => beginRecruitmentEdit(firstRecruitmentPeriod, recruitmentFocusKey)
                                            : undefined
                                        }
                                      />
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {selectedResources === undefined &&
                  selectedOneOffEntries.length === 0 &&
                  eventScheduleGroups.length === 0 &&
                  selectedShopPlans.length === 0 ? (
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
                    timeZone={timeZone}
                    savedStates={recruitmentSavedStates}
                    preferredEventUid={preferredRecruitmentEventUid}
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
                      {eventScheduleGroups.flatMap(({ group }) =>
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
