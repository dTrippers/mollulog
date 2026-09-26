import { type ReactNode, useState } from "react";
import { Button } from "~/components/primitives";
import type { PlannerPeriod, PlannerPeriodStudent } from "~/domain/integrated-planner";
import { formatInstant } from "~/lib/date-time";
import { studentImageUrl } from "~/models/assets";

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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

function formatEventRange(period: PlannerPeriod, referenceDateKey: string, timeZone: string): ReactNode {
  const start = formatPeriodEndpoint(period.startDate, period.startAt, referenceDateKey, timeZone);
  if (period.endless) {
    return (
      <>
        <span className="whitespace-nowrap">{start}</span>부터
      </>
    );
  }
  if (!period.endAt) return <span className="whitespace-nowrap">{start}</span>;
  const end = formatPeriodEndpoint(period.endDate, period.endAt, referenceDateKey, timeZone);
  return (
    <>
      <span className="whitespace-nowrap">{start}</span> – <span className="whitespace-nowrap">{end}</span>
    </>
  );
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

export function PlannerEventThumbnail({
  period,
  size = "default",
}: {
  period?: PlannerPeriod;
  size?: "small" | "default";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === "small" ? "size-10" : "size-16 sm:size-20";
  return period?.imageUrl && !imageFailed ? (
    <img
      src={period.imageUrl}
      alt=""
      className={`${sizeClass} shrink-0 rounded-md object-cover`}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <div aria-hidden="true" className={`${sizeClass} shrink-0 rounded-md bg-muted`} />
  );
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

export function PlannerRecruitmentPortraits({ students }: { students: readonly PlannerPeriodStudent[] }) {
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

export function PlannerRecruitmentRow({
  students,
  eventName,
  status,
  deadline,
  actionText,
  actionFocusKey,
  onAction,
  showEmptyStudentText = true,
}: {
  students: readonly PlannerPeriodStudent[];
  eventName?: string;
  status: string;
  deadline: ReactNode;
  actionText?: string;
  actionFocusKey?: string;
  onAction?: () => void;
  showEmptyStudentText?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <div className="flex min-w-0 grow basis-64 items-center gap-3">
        {students.length > 0 ? <PlannerRecruitmentPortraits students={students} /> : null}
        <div className="min-w-0 flex-1">
          {eventName ? <p className="text-xs text-muted-foreground">{eventName}</p> : null}
          {students.length > 0 || showEmptyStudentText ? (
            <p className="break-keep wrap-anywhere text-sm font-medium text-foreground">
              {students.length > 0 ? students.map(({ name }) => name).join(", ") : "관심 학생을 선택하지 않았어요."}
            </p>
          ) : null}
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

export function PlannerEventDates({
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

export function PlannerEventCardActions({
  eventPeriod,
  shopCalculatorHref,
  editableShopPlans = [],
  shopEditFocusKey,
  onEditShop,
  className,
}: {
  eventPeriod?: PlannerPeriod;
  shopCalculatorHref?: string;
  editableShopPlans?: readonly { shopStateUid: string | null; timelineUid: string }[];
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
