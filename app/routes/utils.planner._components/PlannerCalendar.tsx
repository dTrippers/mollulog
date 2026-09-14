import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { EventShopState } from "~/domain/event-shop-state";
import type { PlannerDayResources, PlannerPeriod } from "~/domain/integrated-planner";
import {
  buildPlannerMonthDays,
  buildPlannerRecruitmentCandidatesForDate,
  shiftPlannerMonth,
  splitPlannerPeriodsForWeek,
} from "~/domain/integrated-planner";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import { resourceImageUrl, studentImageUrl } from "~/models/assets";
import PlannerQuickEdit, { type PlannerQuickEditEntry } from "./PlannerQuickEdit";
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

type ForecastStatus = "ready" | "pending" | "input-needed" | "unavailable";

type PlannerCalendarProps = {
  initialMonth: string;
  periods: PlannerPeriod[];
  publicPeriods: PlannerPeriod[];
  dailyResources: Record<string, PlannerDayResources>;
  forecastStatus: ForecastStatus;
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

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

const RESOURCE_PRESENTATION = {
  pyroxene: { label: "청휘석", uid: PYROXENE_RESOURCE_UIDS.pyroxene },
  oneTimeTicket: { label: "1회 모집 티켓", uid: PYROXENE_RESOURCE_UIDS.oneTimeTicket },
  tenTimeTicket: { label: "10회 모집 티켓", uid: PYROXENE_RESOURCE_UIDS.tenTimeTicket },
} as const;

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

function formatSignedQuantity(quantity: number): string {
  if (quantity === 0) return "0";
  const sign = quantity > 0 ? "+" : "−";
  return `${sign}${new Intl.NumberFormat("ko-KR").format(Math.abs(quantity))}`;
}

function periodLabel(period: PlannerPeriod): string {
  if (period.kind === "shop") return `상점 · ${period.name}`;
  if (period.kind === "recruitment") return `모집 · ${period.name}`;
  return period.name;
}

function isOnDate(period: PlannerPeriod, dateKey: string): boolean {
  return period.startDate <= dateKey && period.endDate >= dateKey;
}

function PeriodRows({
  periods,
  week,
  onSelect,
}: {
  periods: PlannerPeriod[];
  week: ReturnType<typeof buildPlannerMonthDays>[number];
  onSelect: (dateKey: string, period: PlannerPeriod) => void;
}) {
  const segments = splitPlannerPeriodsForWeek(periods, week);
  if (segments.length === 0) return null;

  return (
    <div className="grid grid-cols-7 gap-x-1 gap-y-1">
      {segments.map(({ period, startColumn, endColumn, track, continuesBefore, continuesAfter }) => (
        <button
          key={`${period.key}:${week[0].dateKey}`}
          type="button"
          title={periodLabel(period)}
          aria-label={`${periodLabel(period)}${continuesBefore ? " · 이전 주부터 이어짐" : ""}${continuesAfter ? " · 다음 주까지 이어짐" : ""}`}
          className={
            period.kind === "shop"
              ? "min-w-0 truncate rounded-sm bg-secondary px-1.5 py-1 text-left text-xs font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : period.kind === "recruitment"
                ? "min-w-0 truncate rounded-sm bg-primary/15 px-1.5 py-1 text-left text-xs font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                : "min-w-0 truncate rounded-sm bg-muted px-1.5 py-1 text-left text-xs font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          }
          style={{ gridColumn: `${startColumn + 1} / ${endColumn + 2}`, gridRow: track + 1 }}
          onClick={() => onSelect(period.startDate, period)}
        >
          <span aria-hidden="true">{continuesBefore ? "← " : ""}</span>
          {period.conflict ? (
            <ExclamationTriangleIcon
              className="mr-1 inline size-3.5 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
          ) : null}
          {periodLabel(period)}
          <span aria-hidden="true">{continuesAfter ? " →" : ""}</span>
        </button>
      ))}
    </div>
  );
}

function DailyResourceChanges({
  changes,
  compact = false,
}: {
  changes: PlannerDayResources["changes"];
  compact?: boolean;
}) {
  if (changes.length === 0) return null;
  return (
    <div
      className={
        compact
          ? "mt-1 flex min-w-0 flex-wrap items-start gap-x-1 gap-y-0.5 text-xs"
          : "flex flex-wrap items-center gap-2"
      }
    >
      {changes.map(({ key, quantity }) => {
        const resource = RESOURCE_PRESENTATION[key];
        return (
          <span key={key} className="inline-flex min-w-0 items-center gap-0.5 whitespace-nowrap" title={resource.label}>
            <img
              src={resourceImageUrl("currency", resource.uid)}
              alt={resource.label}
              className={compact ? "size-3 shrink-0 object-contain" : "size-5 shrink-0 object-contain"}
              loading="lazy"
            />
            <span className="tabular-nums">{formatSignedQuantity(quantity)}</span>
          </span>
        );
      })}
    </div>
  );
}

function RecruitmentMarkers({ periods }: { periods: PlannerPeriod[] }) {
  const students = periods
    .filter((period) => period.kind === "recruitment")
    .flatMap((period) => period.students ?? [])
    .filter((student, index, all) => all.findIndex((candidate) => candidate.uid === student.uid) === index);
  if (periods.every((period) => period.kind !== "recruitment")) return null;

  return (
    <div className="mt-1 flex min-w-0 items-center gap-0.5 overflow-hidden sm:gap-1">
      <span className="shrink-0 text-[10px] font-medium text-primary sm:text-xs">모집</span>
      {students.length > 0 ? (
        <span className="flex min-w-0 max-w-full items-center overflow-hidden sm:pl-0.5">
          {students.slice(0, 4).map((student, index) => (
            <img
              key={student.uid}
              src={studentImageUrl(student.imageUid ?? student.uid)}
              alt={student.name}
              title={student.name}
              className={`size-3 shrink-0 rounded-full bg-muted object-contain object-top ring-1 ring-card sm:size-5 ${index > 0 ? "-ml-2 sm:-ml-1.5" : ""} ${index > 1 ? "hidden sm:block" : ""}`}
              loading="lazy"
            />
          ))}
          {students.length > 4 ? (
            <span className="ml-0.5 hidden text-xs text-muted-foreground sm:block">+{students.length - 4}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousSelectedDateRef = useRef<string | null>(null);

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

  const plannedPeriodKeys = useMemo(() => new Set(periods.map((period) => period.key)), [periods]);
  const selectedPeriods = selectedDate ? periods.filter((period) => isOnDate(period, selectedDate)) : [];
  const publicCandidates = selectedDate
    ? publicPeriods.filter((period) => isOnDate(period, selectedDate) && !plannedPeriodKeys.has(period.key))
    : [];
  const recruitmentCandidates = useMemo(
    () => (selectedDate ? buildPlannerRecruitmentCandidatesForDate(publicPeriods, selectedDate) : []),
    [publicPeriods, selectedDate],
  );
  const preferredRecruitmentEventUid = selectedDate
    ? periods.find((period) => period.key === focusedPeriodKey)?.eventUid
    : undefined;
  const selectedResources = selectedDate ? dailyResources[selectedDate] : undefined;
  const selectedOneOffEntries = selectedDate ? oneOffEntries.filter((entry) => entry.date === selectedDate) : [];
  const selectedShopPlans = selectedDate
    ? shopPlans.filter(
        (plan) =>
          plan.startDate !== null &&
          plan.endDate !== null &&
          plan.startDate <= selectedDate &&
          plan.endDate >= selectedDate,
      )
    : [];

  function openDate(dateKey: string, trigger: HTMLButtonElement, period?: PlannerPeriod) {
    triggerRef.current = trigger;
    setSelectedDate(dateKey);
    setFocusedPeriodKey(period?.key ?? null);
  }

  function closeDialog() {
    setSelectedDate(null);
    setFocusedPeriodKey(null);
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
          {weeks.map((week) => {
            const weekPeriods = periods.filter(
              (period) => period.startDate <= week[6].dateKey && period.endDate >= week[0].dateKey,
            );
            return (
              <div key={week[0].dateKey} className="space-y-1.5">
                <div className="grid grid-cols-7 gap-1">
                  {week.map((day) => {
                    const dayPeriods = periods.filter((period) => period.startDate === day.dateKey);
                    const daySummary = dailyResources[day.dateKey];
                    const students = dayPeriods
                      .filter((period) => period.kind === "recruitment")
                      .flatMap((period) => period.students ?? [])
                      .map((student) => student.name);
                    const accessibleSummary = [
                      formatDate(day.dateKey),
                      ...students.map((name) => `모집 ${name}`),
                      ...(daySummary?.changes.map(
                        ({ key, quantity }) => `${RESOURCE_PRESENTATION[key].label} ${formatSignedQuantity(quantity)}`,
                      ) ?? []),
                    ].join(", ");

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        aria-label={`${accessibleSummary} 일정 보기`}
                        className={`flex min-h-24 min-w-0 flex-col items-stretch justify-start rounded-md p-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 sm:p-2 ${
                          day.inMonth
                            ? "bg-card text-foreground hover:bg-muted/60"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                        }`}
                        onClick={(event) => openDate(day.dateKey, event.currentTarget)}
                      >
                        <span className="block w-full text-right text-xs leading-none tabular-nums">
                          {Number(day.dateKey.slice(-2))}
                        </span>
                        <RecruitmentMarkers periods={dayPeriods} />
                        {forecastStatus === "ready" && daySummary ? (
                          <DailyResourceChanges changes={daySummary.changes} compact />
                        ) : null}
                        {dayPeriods.some((period) => period.kind === "shop" && period.conflict) ? (
                          <span className="sr-only">이벤트 상점 계획 비교가 필요해요</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {weekPeriods.length > 0 ? (
                  <PeriodRows
                    periods={weekPeriods}
                    week={week}
                    onSelect={(dateKey, period) =>
                      openDate(dateKey, document.activeElement as HTMLButtonElement, period)
                    }
                  />
                ) : null}
              </div>
            );
          })}
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
        className="fixed inset-x-0 bottom-0 m-0 max-h-[85dvh] w-full max-w-3xl overflow-hidden rounded-t-lg border-0 bg-popover p-0 text-popover-foreground shadow-t-xl backdrop:bg-black/50 lg:inset-0 lg:m-auto lg:max-h-[80vh] lg:rounded-lg"
        onClose={() => {
          setSelectedDate(null);
          setFocusedPeriodKey(null);
        }}
      >
        {selectedDate ? (
          <div className="flex max-h-[85dvh] flex-col lg:max-h-[80vh]">
            <header className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3 pt-5 lg:px-6 lg:pt-6">
              <div className="min-w-0">
                <h2 id="planner-day-title" className="text-lg font-semibold">
                  {formatDate(selectedDate)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSignedIn ? "계정에 저장된 계획과 예상 변동" : "이 브라우저에 저장된 계획과 예상 변동"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="날짜 상세 닫기"
                onClick={closeDialog}
              >
                <XMarkIcon className="size-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 lg:px-6">
              {selectedResources ? (
                <section aria-labelledby="planner-day-resources">
                  <h3 id="planner-day-resources" className="text-sm font-semibold">
                    예상 재화 증감
                  </h3>
                  <DailyResourceChanges changes={selectedResources.changes} />
                  <ul className="mt-3 space-y-3">
                    {selectedResources.sources.map((source) => (
                      <li key={source.key} className="rounded-md bg-muted/50 p-3">
                        <p className="text-sm font-medium">{source.label ?? "예상 항목 이름을 확인할 수 없어요"}</p>
                        <DailyResourceChanges changes={source.changes} compact />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selectedDate ? (
                <PlannerQuickEdit
                  key={selectedDate}
                  date={selectedDate}
                  timeZone={timeZone}
                  entries={selectedOneOffEntries}
                  isSignedIn={isSignedIn}
                  guestStorageStatus={guestStorageStatus}
                />
              ) : null}

              {selectedDate ? (
                <PlannerRecruitmentEditor
                  selectedDate={selectedDate}
                  candidates={recruitmentCandidates}
                  savedStates={recruitmentSavedStates}
                  preferredEventUid={preferredRecruitmentEventUid}
                  isSignedIn={isSignedIn}
                  isSaving={recruitmentIsSaving}
                  saveResult={recruitmentSaveResult}
                  onSave={onSaveRecruitment}
                />
              ) : null}

              {selectedPeriods.length > 0 ? (
                <section aria-labelledby="planner-day-plans">
                  <h3 id="planner-day-plans" className="text-sm font-semibold">
                    내 계획
                  </h3>
                  <div className="mt-2 space-y-2">
                    {selectedPeriods.map((period) => (
                      <div
                        key={period.key}
                        id={focusedPeriodKey === period.key ? "planner-focused-period" : undefined}
                        className="rounded-md bg-muted/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{periodLabel(period)}</p>
                            {period.students?.length ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {period.students.map((student) => student.name).join(" · ")}
                              </p>
                            ) : null}
                            {period.expectedTrials !== undefined ? (
                              <p className="mt-1 text-sm text-muted-foreground">예상 모집 {period.expectedTrials}회</p>
                            ) : null}
                            {period.conflict ? (
                              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                                이 브라우저에 다른 상점 계획이 있어요
                              </p>
                            ) : null}
                          </div>
                          <Link
                            to={
                              period.conflict && period.eventUid
                                ? `/utils/planner/import?event=${encodeURIComponent(period.eventUid)}`
                                : period.href
                            }
                            className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {period.conflict ? "비교하기" : "상세 보기"}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedShopPlans.length > 0 ? (
                <section aria-labelledby="planner-shop-plans" className="space-y-3">
                  <h3 id="planner-shop-plans" className="text-sm font-semibold">
                    이벤트 상점 계획
                  </h3>
                  {selectedShopPlans.map((plan) => (
                    <div key={plan.shopStateUid ?? plan.timelineUid} className="space-y-3">
                      <p className="text-sm font-medium">{plan.name}</p>
                      {plan.state && plan.defaultState ? (
                        <>
                          <PlannerShopSummary
                            content={plan.content}
                            state={plan.state}
                            defaultState={plan.defaultState}
                          />
                          {plan.shopStateUid ? (
                            <PlannerShopOwnedQuantityEditor
                              timelineUid={plan.timelineUid}
                              shopStateUid={plan.shopStateUid}
                              content={plan.content}
                              state={plan.state}
                              defaultState={plan.defaultState}
                              signedIn={isSignedIn}
                              onSaved={(state) => {
                                const shopStateUid = plan.shopStateUid;
                                if (shopStateUid) onShopSaved(shopStateUid, state);
                              }}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              이벤트 상점 입력을 저장할 위치를 확인할 수 없어요.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">이벤트 상점의 기본 입력을 확인할 수 없어요.</p>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}

              {publicCandidates.length > 0 ? (
                <section aria-labelledby="planner-public-schedules">
                  <h3 id="planner-public-schedules" className="text-sm font-semibold">
                    이 날짜의 공개 일정
                  </h3>
                  <div className="mt-2 space-y-2">
                    {publicCandidates.map((period) => (
                      <div
                        key={period.key}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{periodLabel(period)}</p>
                          {period.students?.length ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {period.students.map((student) => student.name).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <Link
                          to={period.href}
                          className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          상세 보기
                        </Link>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedResources?.sources.length === 0 &&
              selectedPeriods.length === 0 &&
              publicCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">이 날짜에 표시할 계획이나 공개 일정이 없어요.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
