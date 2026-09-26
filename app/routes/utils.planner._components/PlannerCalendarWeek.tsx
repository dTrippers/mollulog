import { BookmarkIcon } from "@heroicons/react/16/solid";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import {
  getPlannerEventScheduleGroupsForDate,
  type PlannerCalendarDay,
  type PlannerCalendarStrip,
  type PlannerDayResources,
  type PlannerPeriod,
  type PlannerWeekLayout,
} from "~/domain/integrated-planner";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import { formatInstant, getInstantTime } from "~/lib/date-time";
import { resourceImageUrl, studentImageUrl } from "~/models/assets";

export type PlannerForecastStatus = "ready" | "pending" | "input-needed" | "unavailable";

export const RESOURCE_PRESENTATION = {
  pyroxene: { label: "청휘석", uid: PYROXENE_RESOURCE_UIDS.pyroxene, imageType: "currency" },
  oneTimeTicket: { label: "1회 모집 티켓", uid: PYROXENE_RESOURCE_UIDS.oneTimeTicket, imageType: "item" },
  tenTimeTicket: { label: "10회 모집 티켓", uid: PYROXENE_RESOURCE_UIDS.tenTimeTicket, imageType: "item" },
} as const;

export function formatSignedQuantity(quantity: number): string {
  if (quantity === 0) return "0";
  const sign = quantity > 0 ? "+" : "−";
  return `${sign}${new Intl.NumberFormat("ko-KR").format(Math.abs(quantity))}`;
}

export function formatCompactSignedQuantity(quantity: number): string {
  if (Math.abs(quantity) < 10_000) return formatSignedQuantity(quantity);
  const sign = quantity > 0 ? "+" : "−";
  const compactValue = new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.abs(quantity));
  return `${sign}${compactValue}`;
}

export function DailyResourceChanges({
  changes,
  compact = false,
  calendarCell = false,
}: {
  changes: PlannerDayResources["changes"];
  compact?: boolean;
  calendarCell?: boolean;
}) {
  if (changes.length === 0) return null;
  return (
    <div
      className={
        compact
          ? calendarCell
            ? "mt-1.5 flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-1 gap-y-0.5 py-1.5 text-xs max-sm:mt-1.5 max-sm:w-full max-sm:flex-col max-sm:items-center max-sm:justify-start max-sm:gap-x-0 max-sm:gap-y-1 max-sm:overflow-visible"
            : "flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs"
          : "flex flex-wrap items-center gap-2"
      }
    >
      {changes.map(({ key, quantity }) => {
        const resource = RESOURCE_PRESENTATION[key];
        return (
          <span
            key={key}
            className={`inline-flex ${
              calendarCell ? "shrink-0 max-sm:flex-col max-sm:items-center max-sm:gap-0" : "min-w-0"
            } items-center gap-0.5 whitespace-nowrap`}
            title={resource.label}
          >
            <img
              src={resourceImageUrl(resource.imageType, resource.uid)}
              alt={resource.label}
              className={compact ? "size-4 shrink-0 object-contain" : "size-5 shrink-0 object-contain"}
              loading="lazy"
            />
            <span className="tabular-nums text-xs leading-none">
              {calendarCell ? (
                <>
                  <span className="max-[380px]:hidden">{formatSignedQuantity(quantity)}</span>
                  <span className="hidden max-[380px]:inline">{formatCompactSignedQuantity(quantity)}</span>
                </>
              ) : (
                formatSignedQuantity(quantity)
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function plannerRunTypeLabel(period: PlannerPeriod): string | null {
  if (period.runType === "first") return "최초";
  if (period.runType === "rerun") return "복각";
  if (period.runType === "permanent") return "상설";
  return null;
}

function stripClasses(timingStatus: PlannerCalendarStrip["timingStatus"]): string {
  return timingStatus === "exact" ? "" : "ring-1 ring-inset ring-amber-500/50";
}

function uniqueStudents(periods: readonly PlannerPeriod[]) {
  const students = periods.flatMap((period) => period.students ?? []);
  return students.filter((student, index) => students.findIndex((other) => other.uid === student.uid) === index);
}

function PlannerRecruitmentAvatars({
  students,
  maxVisible,
}: {
  students: ReturnType<typeof uniqueStudents>;
  maxVisible: number;
}) {
  if (students.length === 0) return null;
  const visibleStudents = students.slice(0, maxVisible);
  return (
    <span className="inline-flex shrink-0 items-center pl-0.5">
      {visibleStudents.map((student, index) => (
        <img
          key={student.uid}
          src={studentImageUrl(student.imageUid ?? student.uid)}
          alt={student.name}
          title={student.name}
          className={`size-5 shrink-0 rounded-full bg-muted object-contain object-top ring-1 ring-card ${index > 0 ? "-ml-1.5" : ""}`}
          loading="lazy"
        />
      ))}
      {students.length > visibleStudents.length ? (
        <span className="ml-1 shrink-0 text-[10px] font-normal text-muted-foreground">
          +{students.length - visibleStudents.length}
        </span>
      ) : null}
    </span>
  );
}

function formatStripInterval(strip: PlannerCalendarStrip, timeZone: string): string {
  if (strip.timingStatus === "exact" && strip.period.startAt && strip.period.endAt) {
    return `${formatInstant(strip.period.startAt, { timeZone, format: "YYYY-MM-DD HH:mm" })}–${formatInstant(strip.period.endAt, { timeZone, format: "YYYY-MM-DD HH:mm" })}`;
  }
  return `${formatDate(strip.period.startDate)}부터 ${formatDate(strip.period.endDate)} · 시간 확인 불가`;
}

function stripAccessibleName(strip: PlannerCalendarStrip, timeZone: string): string {
  const students =
    strip.kind === "combined"
      ? uniqueStudents(strip.recruitmentPeriods.filter((period) => period.hasRecruitmentPlan))
      : strip.period.hasRecruitmentPlan
        ? uniqueStudents([strip.period])
        : [];
  const title =
    strip.kind === "combined"
      ? `${strip.period.name} · 모집`
      : strip.kind === "recruitment"
        ? `모집 · ${strip.period.name}`
        : strip.period.name;
  const studentNames = students.length > 0 ? ` · 모집 목표: ${students.map(({ name }) => name).join(", ")}` : "";
  const timing = strip.timingStatus === "invalid" ? " · 기간을 확인할 수 없어요" : "";
  const continuation = `${strip.continuesBefore ? " · 이전 주부터 이어짐" : ""}${strip.continuesAfter ? " · 다음 주까지 이어짐" : ""}`;
  const plan = strip.period.isPlanned ? "내 계획 · " : "";
  return `${plan}${title} · ${formatStripInterval(strip, timeZone)}${studentNames}${continuation}${timing}`;
}

function visualStripTitle(strip: PlannerCalendarStrip): string {
  if (strip.kind === "combined") return strip.period.name;
  return strip.kind === "recruitment" ? "모집" : strip.period.name;
}

function stripStartOrder(strip: PlannerCalendarStrip): number {
  return strip.timingStatus === "exact" && strip.period.startAt
    ? getInstantTime(strip.period.startAt)
    : Date.parse(`${strip.period.startDate}T00:00:00Z`);
}

export default function PlannerCalendarWeek({
  week,
  periods,
  calendarResources,
  forecastStatus,
  weekLayout,
  timeZone,
  todayDateKey,
  selectedDate,
  isFirstWeek,
  isLastWeek,
  onSelectDate,
  onSelectPeriod,
  onTodayCellRef,
}: {
  week: PlannerCalendarDay[];
  periods: PlannerPeriod[];
  calendarResources: Record<string, PlannerDayResources>;
  forecastStatus: PlannerForecastStatus;
  weekLayout: PlannerWeekLayout;
  timeZone: string;
  todayDateKey: string;
  selectedDate: string | null;
  isFirstWeek: boolean;
  isLastWeek: boolean;
  onSelectDate: (dateKey: string, trigger: HTMLButtonElement) => void;
  onSelectPeriod: (dateKey: string, trigger: HTMLButtonElement, period: PlannerPeriod) => void;
  onTodayCellRef?: (element: HTMLButtonElement | null) => void;
}) {
  const strips: { strip: PlannerCalendarStrip; laneIndex: number }[] = [
    ...weekLayout.eventStrips.map((strip) => ({ strip, laneIndex: strip.track })),
    ...weekLayout.recruitmentStrips.map((strip) => ({ strip, laneIndex: strip.track })),
  ].sort(
    (left, right) =>
      stripStartOrder(left.strip) - stripStartOrder(right.strip) ||
      left.strip.period.name.localeCompare(right.strip.period.name) ||
      left.strip.key.localeCompare(right.strip.key),
  );
  const eventStartMarkers = weekLayout.eventStartMarkers.map((marker) => ({ marker, laneIndex: marker.track }));
  const weekLabel = `${formatDate(week[0].dateKey)}부터 ${formatDate(week[6].dateKey)} 주간 일정`;
  const gridTemplateRows =
    weekLayout.laneCount > 0 ? `minmax(40px, auto) repeat(${weekLayout.laneCount}, 28px)` : "minmax(40px, auto)";
  const boundaryClasses = [
    "relative grid grid-cols-7 border-x border-border/70 max-sm:border-x-0",
    isFirstWeek ? "border-t-2" : "border-t",
    isLastWeek ? "border-b-2" : "",
  ].join(" ");
  const laneRows = Array.from({ length: weekLayout.laneCount }, (_, index) => ({ key: index, gridRow: index + 2 }));

  return (
    <section aria-label={weekLabel} className={boundaryClasses} style={{ gridTemplateRows }}>
      {week.map((day, index) => (
        <div
          key={`background:${day.dateKey}`}
          aria-hidden="true"
          className={`pointer-events-none z-0 ${index < 6 ? "border-r border-border/70" : ""} ${
            day.inMonth ? "bg-card" : "bg-muted/30"
          }`}
          style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
        />
      ))}
      {week.map((day, index) => {
        const daySummary = calendarResources[day.dateKey];
        const isToday = day.inMonth && day.dateKey === todayDateKey;
        const eventDescriptions = getPlannerEventScheduleGroupsForDate(periods, day.dateKey, todayDateKey).flatMap(
          ({ group, isPlanned, recruitmentPeriods }) => {
            const eventPeriod = group.periods.find((period) => period.kind === "event");
            const eventPlanned = eventPeriod ? eventPeriod.isPlanned === true : isPlanned;
            return [
              `${group.name}${eventPlanned ? " · 내 계획" : ""}`,
              ...recruitmentPeriods.map((period) => `모집${period.isPlanned ? " · 내 계획" : ""}`),
            ];
          },
        );
        const accessibleSummary = [
          formatDate(day.dateKey),
          ...eventDescriptions,
          ...(daySummary?.changes.map(
            ({ key, quantity }) => `${RESOURCE_PRESENTATION[key].label} ${formatSignedQuantity(quantity)}`,
          ) ?? []),
        ].join(", ");
        return (
          <button
            key={day.dateKey}
            ref={isToday ? onTodayCellRef : undefined}
            type="button"
            aria-label={`${accessibleSummary} 일정 보기`}
            aria-current={isToday ? "date" : undefined}
            aria-pressed={selectedDate === day.dateKey}
            className={`relative z-10 flex h-auto min-h-10 min-w-0 flex-col items-stretch justify-start bg-transparent px-2 py-0 text-left text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 max-sm:min-h-16 max-sm:px-0 ${
              day.inMonth ? "hover:bg-muted/60" : "text-muted-foreground hover:bg-muted/60"
            }`}
            style={{ gridColumn: index + 1, gridRow: 1 }}
            onClick={(event) => onSelectDate(day.dateKey, event.currentTarget)}
          >
            <span className="flex w-full justify-end px-1.5 pt-1.5 text-xs leading-none tabular-nums">
              <span
                className={
                  isToday
                    ? "grid size-5 place-items-center rounded-full bg-primary font-semibold text-primary-foreground ring-2 ring-primary/30"
                    : "grid size-5 place-items-center"
                }
              >
                {Number(day.dateKey.slice(-2))}
              </span>
            </span>
            {forecastStatus === "ready" && daySummary ? (
              <DailyResourceChanges changes={daySummary.changes} compact calendarCell />
            ) : null}
          </button>
        );
      })}
      {laneRows.map(({ key, gridRow }) => (
        <div key={`lane:${key}`} className="relative col-span-7 h-7" style={{ gridColumn: "1 / -1", gridRow }}>
          {strips
            .filter(({ laneIndex }) => laneIndex === gridRow - 2)
            .map(({ strip }) => {
              const students =
                strip.kind === "combined"
                  ? uniqueStudents(strip.recruitmentPeriods.filter((period) => period.hasRecruitmentPlan))
                  : strip.period.hasRecruitmentPlan
                    ? uniqueStudents([strip.period])
                    : [];
              const isPlanned = strip.period.isPlanned === true;
              const endsThisWeek = strip.period.endDate >= week[0].dateKey && strip.period.endDate <= week[6].dateKey;
              const compactEndLabel = strip.widthPercent >= 28;
              return (
                <button
                  key={`${strip.key}:${week[0].dateKey}`}
                  type="button"
                  aria-label={stripAccessibleName(strip, timeZone)}
                  title={stripAccessibleName(strip, timeZone)}
                  className={`absolute inset-y-0.5 z-10 flex min-h-6 min-w-6 flex-nowrap content-center items-center gap-1 overflow-hidden rounded-sm border px-1.5 py-0.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                    isPlanned
                      ? "border-transparent bg-muted font-semibold text-foreground hover:bg-muted/80"
                      : "border-border bg-transparent font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  } ${
                    strip.continuesBefore ? "rounded-l-none" : ""
                  } ${strip.continuesAfter ? "rounded-r-none" : ""} ${stripClasses(strip.timingStatus)}`}
                  style={{ left: `${strip.leftPercent}%`, width: `${strip.widthPercent}%` }}
                  onClick={(event) => {
                    const dateKey = strip.period.startDate < week[0].dateKey ? week[0].dateKey : strip.period.startDate;
                    onSelectPeriod(dateKey, event.currentTarget, strip.period);
                  }}
                >
                  {strip.continuesBefore ? <span aria-hidden="true">←</span> : null}
                  {isPlanned ? <BookmarkIcon aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span className="min-w-0 flex-[0_1_auto] truncate">{visualStripTitle(strip)}</span>
                  {students.length > 0 ? <PlannerRecruitmentAvatars students={students} maxVisible={3} /> : null}
                  {strip.timingStatus !== "exact" ? (
                    <ExclamationTriangleIcon
                      className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300"
                      aria-hidden="true"
                    />
                  ) : null}
                  {strip.continuesAfter ? (
                    <span className="ml-auto shrink-0" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                  {endsThisWeek ? (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-normal opacity-75">
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {compactEndLabel ? <span>{formatShortDate(strip.period.endDate)}</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          {eventStartMarkers
            .filter(({ laneIndex }) => laneIndex === gridRow - 2)
            .map(({ marker }) => {
              const runType = plannerRunTypeLabel(marker.period);
              const label = `${runType ? `${runType} · ` : ""}${marker.period.name}`;
              const startsAt = marker.period.startAt
                ? formatInstant(marker.period.startAt, { timeZone, format: "M/D HH:mm" })
                : null;
              const isPlanned = marker.period.isPlanned === true;
              const accessibleName = `${isPlanned ? "내 계획 · " : ""}${label}${startsAt ? `, ${startsAt} 시작` : ""}`;
              return (
                <button
                  key={`${marker.key}:${week[0].dateKey}`}
                  type="button"
                  aria-label={accessibleName}
                  title={accessibleName}
                  className={`absolute inset-y-0.5 z-10 flex min-w-0 items-center gap-1 overflow-hidden border-l-2 px-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                    isPlanned
                      ? "border-foreground font-semibold text-foreground"
                      : "border-muted-foreground/50 font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  style={{ left: `${marker.leftPercent}%`, width: `${marker.widthPercent}%` }}
                  onClick={(event) => onSelectPeriod(marker.period.startDate, event.currentTarget, marker.period)}
                >
                  {isPlanned ? <BookmarkIcon aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span className="min-w-0 truncate">{label}</span>
                </button>
              );
            })}
        </div>
      ))}
    </section>
  );
}
