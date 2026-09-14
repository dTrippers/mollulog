import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type {
  PlannerCalendarDay,
  PlannerDayResources,
  PlannerPeriod,
  PlannerPeriodGroup,
} from "~/domain/integrated-planner";
import { groupPlannerPeriods, splitPlannerPeriodsForWeek } from "~/domain/integrated-planner";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import { resourceImageUrl, studentImageUrl } from "~/models/assets";

export type PlannerForecastStatus = "ready" | "pending" | "input-needed" | "unavailable";

export const RESOURCE_PRESENTATION = {
  pyroxene: { label: "청휘석", uid: PYROXENE_RESOURCE_UIDS.pyroxene },
  oneTimeTicket: { label: "1회 모집 티켓", uid: PYROXENE_RESOURCE_UIDS.oneTimeTicket },
  tenTimeTicket: { label: "10회 모집 티켓", uid: PYROXENE_RESOURCE_UIDS.tenTimeTicket },
} as const;

export function formatSignedQuantity(quantity: number): string {
  if (quantity === 0) return "0";
  const sign = quantity > 0 ? "+" : "−";
  return `${sign}${new Intl.NumberFormat("ko-KR").format(Math.abs(quantity))}`;
}

export function DailyResourceChanges({
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

type PlannerPeriodGroupLayout = PlannerPeriodGroup & {
  segments: ReturnType<typeof splitPlannerPeriodsForWeek>;
  conflictPeriodKey: string | null;
  headerRow: number;
  phaseRow: number;
  startColumn: number;
  endColumn: number;
  selectedDate: string;
  selectedPeriod: PlannerPeriod;
};

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

function phaseLabel(period: PlannerPeriod): string {
  if (period.kind === "recruitment") return "모집";
  if (period.kind === "shop") return "상점";
  return "플레이";
}

function phaseClasses(period: PlannerPeriod): string {
  if (period.kind === "recruitment") {
    return "bg-primary/15 text-primary hover:bg-primary/20";
  }
  if (period.kind === "shop") {
    return "bg-secondary text-secondary-foreground hover:bg-secondary/80";
  }
  return "bg-muted text-foreground hover:bg-muted/80";
}

function recruitmentStudents(periods: readonly PlannerPeriod[], dateKey: string) {
  const students = periods
    .filter((period) => period.kind === "recruitment" && period.startDate === dateKey)
    .flatMap((period) => period.students ?? []);
  return students.filter((student, index) => students.findIndex((other) => other.uid === student.uid) === index);
}

function PlannerRecruitmentAvatars({
  students,
  maxVisible,
}: {
  students: ReturnType<typeof recruitmentStudents>;
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

function buildGroupLayouts(
  periods: readonly PlannerPeriod[],
  week: readonly PlannerCalendarDay[],
): { layouts: PlannerPeriodGroupLayout[]; rowCount: number } {
  const weekStart = week[0].dateKey;
  const weekEnd = week[6].dateKey;
  let nextRow = 2;
  const layouts: PlannerPeriodGroupLayout[] = [];
  for (const group of groupPlannerPeriods(periods)) {
    const activePeriods = group.periods.filter((period) => period.startDate <= weekEnd && period.endDate >= weekStart);
    if (activePeriods.length === 0) continue;
    const segments = splitPlannerPeriodsForWeek(activePeriods, week);
    if (segments.length === 0) continue;
    const firstSegment = [...segments].sort(
      (left, right) =>
        left.startColumn - right.startColumn || left.period.startDate.localeCompare(right.period.startDate),
    )[0];
    const selectedDate = firstSegment.period.startDate < weekStart ? weekStart : firstSegment.period.startDate;
    const conflictPeriodKey = activePeriods.find((period) => period.kind === "shop" && period.conflict)?.key ?? null;
    const trackCount = Math.max(...segments.map(({ track }) => track + 1));
    layouts.push({
      ...group,
      segments,
      conflictPeriodKey,
      headerRow: nextRow,
      phaseRow: nextRow + 1,
      startColumn: Math.min(...segments.map(({ startColumn }) => startColumn)),
      endColumn: Math.max(...segments.map(({ endColumn }) => endColumn)),
      selectedDate,
      selectedPeriod: firstSegment.period,
    });
    nextRow += trackCount + 1;
  }
  return { layouts, rowCount: nextRow - 2 };
}

export default function PlannerCalendarWeek({
  week,
  periods,
  dailyResources,
  forecastStatus,
  selectedDate,
  onSelectDate,
  onSelectPeriod,
}: {
  week: PlannerCalendarDay[];
  periods: PlannerPeriod[];
  dailyResources: Record<string, PlannerDayResources>;
  forecastStatus: PlannerForecastStatus;
  selectedDate: string | null;
  onSelectDate: (dateKey: string, trigger: HTMLButtonElement) => void;
  onSelectPeriod: (dateKey: string, trigger: HTMLButtonElement, period: PlannerPeriod) => void;
}) {
  const { layouts, rowCount } = buildGroupLayouts(periods, week);
  const gridTemplateRows = rowCount
    ? `minmax(6rem, auto) repeat(${rowCount}, minmax(1.5rem, auto))`
    : "minmax(6rem, auto)";

  return (
    <div
      className="relative isolate grid grid-cols-7 gap-x-0 gap-y-1 overflow-visible border-y border-border/40"
      style={{ gridTemplateRows }}
    >
      {week.map((day, index) => {
        const dayPeriods = periods.filter((period) => period.startDate === day.dateKey);
        const students = recruitmentStudents(periods, day.dateKey);
        const daySummary = dailyResources[day.dateKey];
        const eventNames = [...new Set(dayPeriods.map((period) => period.name))];
        const accessibleSummary = [
          formatDate(day.dateKey),
          ...eventNames,
          ...students.map(({ name }) => `모집 ${name}`),
          ...(daySummary?.changes.map(
            ({ key, quantity }) => `${RESOURCE_PRESENTATION[key].label} ${formatSignedQuantity(quantity)}`,
          ) ?? []),
        ].join(", ");
        return (
          <button
            key={day.dateKey}
            type="button"
            aria-label={`${accessibleSummary} 일정 보기`}
            aria-pressed={selectedDate === day.dateKey}
            className={`relative z-0 flex min-h-24 min-w-0 flex-col items-stretch justify-start border-b border-border/30 px-2 pb-2 pt-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
              index < 6 ? "border-r border-r-border/50" : ""
            } ${
              day.inMonth
                ? "bg-card text-foreground hover:bg-muted/60"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
            }`}
            style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
            onClick={(event) => onSelectDate(day.dateKey, event.currentTarget)}
          >
            <span className="block w-full text-right text-xs leading-none tabular-nums">
              {Number(day.dateKey.slice(-2))}
            </span>
            {forecastStatus === "ready" && daySummary ? (
              <DailyResourceChanges changes={daySummary.changes} compact />
            ) : null}
          </button>
        );
      })}
      {layouts.map((group) => (
        <button
          key={`${group.key}:title:${week[0].dateKey}`}
          type="button"
          aria-label={`${group.name} 계획 열기`}
          title={group.name}
          className="relative z-10 flex min-w-0 items-center rounded-sm bg-card px-2 py-1 text-left text-xs font-semibold text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          style={{ gridColumn: `${group.startColumn + 1} / ${group.endColumn + 2}`, gridRow: group.headerRow }}
          onClick={(event) => onSelectPeriod(group.selectedDate, event.currentTarget, group.selectedPeriod)}
        >
          <span className="min-w-0 truncate">{group.name}</span>
        </button>
      ))}
      {layouts.flatMap((group) =>
        group.segments.map(({ period, startColumn, endColumn, track, continuesBefore, continuesAfter }) => {
          const phase = phaseLabel(period);
          const hasShopConflict = period.key === group.conflictPeriodKey;
          const hasRecruitmentAvatars =
            period.kind === "recruitment" &&
            !continuesBefore &&
            period.startDate >= week[0].dateKey &&
            period.startDate <= week[6].dateKey &&
            period.key ===
              [...group.periods]
                .filter(({ kind, startDate }) => kind === "recruitment" && startDate === period.startDate)
                .sort(
                  (left, right) => left.endDate.localeCompare(right.endDate) || left.key.localeCompare(right.key),
                )[0]?.key;
          const students = hasRecruitmentAvatars ? recruitmentStudents(group.periods, period.startDate) : [];
          const endsThisWeek = period.endDate >= week[0].dateKey && period.endDate <= week[6].dateKey;
          const compactEndLabel = endColumn - startColumn >= 1;
          const targetNames = students.length > 0 ? ` · 모집 목표: ${students.map(({ name }) => name).join(", ")}` : "";
          const conflictLabel = hasShopConflict ? " · 상점 계획 비교 필요" : "";
          const periodLabel = `${group.name} · ${phase} · ${formatDate(period.startDate)}부터 ${formatDate(period.endDate)}${targetNames}${conflictLabel}${continuesBefore ? " · 이전 주부터 이어짐" : ""}${continuesAfter ? " · 다음 주까지 이어짐" : ""}`;
          return (
            <button
              key={`${period.key}:${week[0].dateKey}`}
              type="button"
              aria-label={periodLabel}
              title={periodLabel}
              className={`relative z-10 flex min-w-0 items-center gap-1 overflow-hidden rounded-sm px-1 py-1 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${phaseClasses(period)}`}
              style={{ gridColumn: `${startColumn + 1} / ${endColumn + 2}`, gridRow: group.phaseRow + track }}
              onClick={(event) => {
                const dateKey = period.startDate < week[0].dateKey ? week[0].dateKey : period.startDate;
                onSelectPeriod(dateKey, event.currentTarget, period);
              }}
            >
              {continuesBefore ? <span aria-hidden="true">←</span> : null}
              <span className="shrink-0">{phase}</span>
              {hasShopConflict ? (
                <ExclamationTriangleIcon
                  className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300"
                  aria-hidden="true"
                />
              ) : null}
              {students.length > 0 ? (
                <PlannerRecruitmentAvatars students={students} maxVisible={endColumn - startColumn < 1 ? 1 : 2} />
              ) : null}
              {continuesAfter ? (
                <span className="ml-auto shrink-0" aria-hidden="true">
                  →
                </span>
              ) : null}
              {endsThisWeek ? (
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-normal opacity-75">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                  {compactEndLabel ? <span>{formatShortDate(period.endDate)}</span> : null}
                </span>
              ) : null}
            </button>
          );
        }),
      )}
    </div>
  );
}
