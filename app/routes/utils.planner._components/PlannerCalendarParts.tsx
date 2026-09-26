import { HeartIcon } from "@heroicons/react/16/solid";
import { Fragment, type ReactNode, useState } from "react";
import { Button } from "~/components/primitives";
import type {
  PlannerPeriod,
  PlannerPeriodBoldEndpoint,
  PlannerPeriodRangeParts,
  PlannerPeriodStudent,
} from "~/domain/integrated-planner";
import { studentImageUrl } from "~/models/assets";

/**
 * Shared rendering of the "M/D HH:mm ~ M/D HH:mm" (or "M/D HH:mm ~" when endless) period
 * range text, with the endpoint that occurs on the selected date bolded. Each endpoint chunk
 * stays glued together (`whitespace-nowrap`) even when the whole line wraps at narrow widths.
 */
export function PlannerPeriodRange({
  parts,
  boldEndpoint,
}: {
  parts: PlannerPeriodRangeParts;
  boldEndpoint: PlannerPeriodBoldEndpoint;
}) {
  return (
    <>
      <span className={`whitespace-nowrap ${boldEndpoint === "start" ? "font-semibold text-foreground" : ""}`}>
        {parts.start}
      </span>
      {parts.end !== null ? (
        <>
          {" ~ "}
          <span className={`whitespace-nowrap ${boldEndpoint === "end" ? "font-semibold text-foreground" : ""}`}>
            {parts.end}
          </span>
        </>
      ) : (
        " ~"
      )}
    </>
  );
}

export function PlannerEventThumbnail({ period }: { period?: PlannerPeriod }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="relative size-10 shrink-0 overflow-hidden rounded-md">
      <div aria-hidden="true" className="absolute inset-0 rounded-md bg-muted ring-1 ring-border" />
      {period?.imageUrl && !imageFailed ? (
        <img
          src={period.imageUrl}
          alt=""
          className="relative size-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </div>
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

function PlannerFavoriteMarkerBadge() {
  return (
    <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-red-500 text-white ring-2 ring-popover">
      <HeartIcon aria-hidden="true" className="size-2.5" />
    </span>
  );
}

export function PlannerRecruitmentPortraits({
  students,
  favoriteMarker = false,
}: {
  students: readonly PlannerPeriodStudent[];
  favoriteMarker?: boolean;
}) {
  const visibleStudents = students.slice(0, 3);
  const hasOverflow = students.length > visibleStudents.length;
  return (
    <span className="inline-flex shrink-0 items-center pl-1" aria-hidden="true">
      {visibleStudents.map((student, index) => {
        const isLastAvatar = !hasOverflow && index === visibleStudents.length - 1;
        return (
          <span key={student.uid} className={`${index > 0 ? "-ml-2.5" : ""} ${isLastAvatar ? "relative" : ""}`.trim()}>
            <PlannerRecruitmentAvatar student={student} />
            {isLastAvatar && favoriteMarker ? <PlannerFavoriteMarkerBadge /> : null}
          </span>
        );
      })}
      {hasOverflow ? (
        <span className="relative -ml-2.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground ring-2 ring-popover">
          +{students.length - visibleStudents.length}
          {favoriteMarker ? <PlannerFavoriteMarkerBadge /> : null}
        </span>
      ) : null}
    </span>
  );
}

export function PlannerRecruitmentRow({
  students,
  periodRange,
  accessiblePeriodRange,
  showEmptyStudentText = true,
  favoriteMarker = false,
}: {
  students: readonly PlannerPeriodStudent[];
  periodRange?: ReactNode;
  accessiblePeriodRange?: string;
  showEmptyStudentText?: boolean;
  favoriteMarker?: boolean;
}) {
  const accessibleName = [
    students.length > 0 ? students.map(({ name }) => name).join(", ") : undefined,
    accessiblePeriodRange,
  ]
    .filter(Boolean)
    .join(", ");
  const prefixedAccessibleName = favoriteMarker && accessibleName ? `관심 학생 ${accessibleName}` : accessibleName;

  return (
    <fieldset
      aria-label={prefixedAccessibleName || undefined}
      className="m-0 flex min-w-0 items-center gap-3 border-0 p-0"
    >
      {students.length > 0 ? <PlannerRecruitmentPortraits students={students} favoriteMarker={favoriteMarker} /> : null}
      <div className="min-w-0 flex-1">
        {students.length > 0 || showEmptyStudentText ? (
          <p className="break-keep text-sm font-medium text-foreground">
            {students.length > 0
              ? students.map(({ uid, name }, index) => (
                  <Fragment key={uid}>
                    {index > 0 ? ", " : ""}
                    <span className="whitespace-nowrap">{name}</span>
                  </Fragment>
                ))
              : "관심 학생을 선택하지 않았어요."}
          </p>
        ) : null}
        {periodRange ? <p className="text-xs text-muted-foreground">{periodRange}</p> : null}
      </div>
    </fieldset>
  );
}

export type PlannerEventCardRecruitmentAction = {
  key: string;
  text: string;
  focusKey: string;
  onClick: () => void;
};

export function PlannerEventCardActions({
  eventPeriod,
  shopCalculatorHref,
  recruitmentActions = [],
  className,
}: {
  eventPeriod?: PlannerPeriod;
  shopCalculatorHref?: string;
  recruitmentActions?: readonly PlannerEventCardRecruitmentAction[];
  className?: string;
}) {
  if (!eventPeriod && !shopCalculatorHref && recruitmentActions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`.trim()}>
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
      {recruitmentActions.map((action) => (
        <span key={action.key} className="inline-flex shrink-0" data-planner-focus-key={action.focusKey}>
          <Button
            text={action.text}
            size="xs"
            variant="secondary"
            className="bg-muted shadow-xs hover:bg-muted/70 dark:shadow-none"
            onClick={action.onClick}
          />
        </span>
      ))}
    </div>
  );
}
