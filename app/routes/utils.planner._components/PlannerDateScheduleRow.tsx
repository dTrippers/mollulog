import { BookmarkIcon } from "@heroicons/react/16/solid";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import type {
  PlannerDateScheduleItem,
  PlannerPeriod,
  PlannerPeriodStudent,
  PlannerScheduleFact,
} from "~/domain/integrated-planner";
import { formatInstant } from "~/lib/date-time";
import { studentImageUrl } from "~/models/assets";
import { PlannerEventThumbnail } from "./PlannerCalendarParts";

function runTypeLabel(period?: PlannerPeriod): string | null {
  if (period?.runType === "first") return "최초";
  if (period?.runType === "rerun") return "복각";
  if (period?.runType === "permanent") return "상설";
  return null;
}

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function dateRange(period: PlannerPeriod): string {
  if (period.startDate === period.endDate) return `${shortDate(period.startDate)}부터`;
  return `${shortDate(period.startDate)} – ${shortDate(period.endDate)}`;
}

function eventEndDate(period?: PlannerPeriod): string | null {
  if (!period || period.endless || !period.endAt) return null;
  return `${shortDate(period.endDate)}까지`;
}

function factLabel(fact: PlannerScheduleFact, timeZone: string): string {
  const time = formatInstant(fact.at, { timeZone, format: "HH:mm" });
  switch (fact.kind) {
    case "event-start":
      return `시작 ${time}`;
    case "event-end":
      return `종료 ${time}`;
    case "recruitment-start":
      return `모집 시작 ${time}`;
    case "recruitment-end":
      return `모집 종료 ${time}`;
    case "shop-deadline":
      return `상점 교환 마감 ${time}`;
  }
}

function PlannerSchedulePortraits({ students }: { students: readonly PlannerPeriodStudent[] }) {
  if (students.length === 0) return null;
  const visible = students.slice(0, 3);
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center pl-1">
      {visible.map((student, index) => (
        <img
          key={student.uid}
          src={studentImageUrl(student.imageUid ?? student.uid)}
          alt=""
          className={`size-5 shrink-0 rounded-full bg-muted object-contain object-top ring-1 ring-card ${index > 0 ? "-ml-1.5" : ""}`}
          loading="lazy"
        />
      ))}
      {students.length > visible.length ? (
        <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">+{students.length - visible.length}</span>
      ) : null}
    </span>
  );
}

export default function PlannerDateScheduleRow({
  item,
  allPeriods,
  timeZone,
  mode,
  onOpen,
}: {
  item: PlannerDateScheduleItem;
  allPeriods: readonly PlannerPeriod[];
  timeZone: string;
  mode: "on-date" | "ongoing";
  onOpen: (item: PlannerDateScheduleItem, trigger: HTMLButtonElement) => void;
}) {
  const { period } = item;
  const eventPeriod =
    item.eventPeriod ??
    (period.kind === "event"
      ? period
      : allPeriods.find((candidate) => candidate.kind === "event" && candidate.eventUid === period.eventUid));
  const isRecruitmentPeriod = period.kind === "recruitment";
  const isPlanned = period.isPlanned === true;
  const recruitmentPeriods = period.eventUid
    ? allPeriods.filter((candidate) => candidate.kind === "recruitment" && candidate.eventUid === period.eventUid)
    : [];
  const recruitmentDeadline = !isRecruitmentPeriod
    ? recruitmentPeriods
        .map((candidate) => candidate.endDate)
        .sort()
        .at(-1)
    : undefined;
  const typeLabel = isRecruitmentPeriod ? null : runTypeLabel(eventPeriod);
  const eventDateRange = !isRecruitmentPeriod && eventPeriod ? dateRange(eventPeriod) : null;
  const onDateFacts = item.facts.map((fact) => factLabel(fact, timeZone));
  const ongoingFact = period.kind === "recruitment" && period.endAt ? `모집 · ${shortDate(period.endDate)}까지` : null;
  const eventEnd = isRecruitmentPeriod ? null : eventEndDate(eventPeriod);
  const secondaryParts =
    mode === "on-date"
      ? [
          ...onDateFacts,
          ...(typeLabel ? [typeLabel] : []),
          ...(eventEnd ? [eventEnd] : []),
          ...(recruitmentDeadline ? [`모집 ${shortDate(recruitmentDeadline)}까지`] : []),
        ]
      : [
          ...(ongoingFact ? [ongoingFact] : []),
          ...(typeLabel ? [typeLabel] : []),
          ...(eventDateRange ? [eventDateRange] : []),
          ...(recruitmentDeadline ? [`모집 ${shortDate(recruitmentDeadline)}까지`] : []),
        ];
  const uniqueSecondaryParts = secondaryParts.filter((part, index) => secondaryParts.indexOf(part) === index);
  const factText = mode === "on-date" ? onDateFacts.join("\u00a0·\u00a0") : ongoingFact;
  const metadataText = uniqueSecondaryParts
    .filter((part) => (mode === "on-date" ? !onDateFacts.includes(part) : part !== factText))
    .join("\u00a0·\u00a0");
  const students =
    period.kind === "recruitment"
      ? period.hasRecruitmentPlan
        ? (period.students ?? [])
        : []
      : (item.ongoingRecruitmentPeriods ?? [])
          .filter((candidate) => candidate.hasRecruitmentPlan)
          .flatMap((candidate) => candidate.students ?? [])
          .filter((student, index, students) => students.findIndex((other) => other.uid === student.uid) === index);
  const showStudents =
    students.length > 0 &&
    (mode === "ongoing" || isRecruitmentPeriod || (item.ongoingRecruitmentPeriods?.length ?? 0) > 0);
  const accessibleName = [
    period.name,
    ...(isRecruitmentPeriod ? ["모집"] : []),
    ...(isPlanned ? ["내 계획"] : []),
    ...onDateFacts,
    ...(mode === "ongoing" && ongoingFact ? [ongoingFact] : []),
    ...(typeLabel ? [typeLabel] : []),
    ...(mode === "on-date" ? (eventEnd ? [eventEnd] : []) : eventDateRange ? [eventDateRange] : []),
    ...(recruitmentDeadline ? [`모집 ${shortDate(recruitmentDeadline)}까지`] : []),
    ...(showStudents ? [students.map(({ name }) => name).join(", ")] : []),
    "자세히 보기",
  ].join(", ");

  return (
    <li>
      <button
        type="button"
        data-planner-focus-key={item.key}
        aria-label={accessibleName}
        className="grid min-h-11 w-full grid-cols-[2.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 rounded-md py-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={(event) => onOpen(item, event.currentTarget)}
      >
        <PlannerEventThumbnail period={eventPeriod ?? period} size="small" />
        <span className="min-w-0">
          <span className="flex min-w-0 items-start gap-1 text-sm font-medium text-foreground">
            {isPlanned ? <BookmarkIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
            <span className="break-keep wrap-anywhere">{period.name}</span>
          </span>
          <span
            className={`mt-0.5 flex min-w-0 flex-wrap items-baseline text-xs ${mode === "ongoing" ? "gap-x-1" : ""}`}
          >
            {factText ? (
              <span className={mode === "on-date" ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {factText}
              </span>
            ) : null}
            {metadataText ? (
              <span className="text-muted-foreground">
                {mode === "on-date" && factText ? "\u00a0·\u00a0" : ""}
                {metadataText}
              </span>
            ) : null}
            {showStudents ? <PlannerSchedulePortraits students={students} /> : null}
          </span>
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-5 justify-self-end text-muted-foreground" />
      </button>
    </li>
  );
}
