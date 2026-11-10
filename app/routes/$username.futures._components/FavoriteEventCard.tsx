import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { AttributeStripes } from "~/components/v2/features/students/AttributeStripes";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { TrailingIconText } from "~/components/v2/primitives/TrailingIconText";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { equipmentTypeLocale } from "~/locales/ko";
import { equipmentCategoryImageUrl } from "~/models/assets";
import { formatOpenEndedStart } from "~/domain/futures/futures-view-model";
import type { UtcIsoString } from "~/lib/date-time";
import {
  countDaysUntilStart,
  type FavoriteEvent,
  type FavoriteEventOpinion,
  type FavoriteEventStudent,
} from "./favorite-events";

const NO_FAVORITE_LABEL = { visible: false, icon: "unfavorited", countText: null, accessibleName: "" } as const;
const OPINION_PREVIEW_LENGTH = 50;

// One event with the favorite students the profile owner registered for it: each student's attributes and the
// equipment and artifact items they need, then the event's opinion summary.
export function FavoriteEventCard({ event, now }: { event: FavoriteEvent; now: UtcIsoString }) {
  const timeZone = useDisplayTimeZone();
  const start = formatInstant(event.since, { timeZone, format: "YYYY/MM/DD" });
  const daysUntilStart = countDaysUntilStart(event.since, now, timeZone);
  const titleId = `favorite-event-${event.uid}`;

  return (
    <article aria-labelledby={titleId} className="rounded-lg bg-v2-surface p-v2-block-p">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-semibold text-v2-fg">
            <Link
              to={`/events/${event.uid}`}
              prefetch="intent"
              className={cn("whitespace-pre-line hover:underline", v2FocusRing)}
              {...getV2LinkTransitionProps("forward")}
            >
              <TrailingIconText text={event.name}>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="ml-1 inline-block size-4 align-middle text-v2-fg-tertiary"
                />
              </TrailingIconText>
            </Link>
          </h3>
          <p className="mt-1 text-xs tabular-nums text-v2-fg-secondary">
            {event.until === null
              ? formatOpenEndedStart(start, event.contentType)
              : `${start} ~ ${formatInstant(event.until, { timeZone, format: "YYYY/MM/DD" })}`}
          </p>
        </div>
        {daysUntilStart > 0 ? (
          <span className="shrink-0 rounded-md border border-v2-divider px-2 py-1 text-sm font-bold tabular-nums text-v2-fg">
            D-{daysUntilStart}
          </span>
        ) : null}
      </header>

      <ul className="mt-v2-block-gap flex flex-col gap-4">
        {event.students.map((student) => (
          <FavoriteStudentRow key={student.key} student={student} />
        ))}
      </ul>

      <OpinionSummary opinion={event.opinion} />
    </article>
  );
}

function FavoriteStudentRow({ student }: { student: FavoriteEventStudent }) {
  const meta = [student.recruitmentLabel, student.school].filter((text): text is string => Boolean(text));
  const hasResources = student.equipments.length > 0 || student.artifactItems.length > 0;

  return (
    <li className="flex items-start gap-3">
      <span className="w-14 shrink-0 sm:w-16">
        <StudentThumb
          studentUid={student.uid}
          name={student.name}
          variant={null}
          recruitmentLabel=""
          isNew={false}
          favorite={NO_FAVORITE_LABEL}
          showCaption={false}
          fluid
        />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {student.uid ? (
          <Link
            to={`/students/${student.uid}`}
            prefetch="intent"
            className={cn(
              "inline-flex items-center gap-1 text-sm font-semibold text-v2-fg hover:underline",
              v2FocusRing,
            )}
            {...getV2LinkTransitionProps("forward")}
          >
            {student.name}
            <ChevronRightIcon aria-hidden="true" className="size-4 text-v2-fg-tertiary" />
          </Link>
        ) : (
          <p className="text-sm font-semibold text-v2-fg">{student.name}</p>
        )}
        {meta.length > 0 ? <p className="text-xs text-v2-fg-secondary">{meta.join(" · ")}</p> : null}
        <AttributeStripes attackType={student.attackType} defenseType={student.defenseType} role={student.role} />
        {hasResources ? (
          <ul aria-label={`${student.name} 육성 재료`} className="flex flex-wrap gap-1.5 pt-0.5">
            {student.equipments.map((equipment) => (
              <li key={`equipment-${equipment}`}>
                <ResourceThumb
                  itemUid={equipment}
                  name={equipmentTypeLocale[equipment] ?? equipment}
                  imageUrl={equipmentCategoryImageUrl(equipment)}
                  size="drop"
                  nameTooltip
                />
              </li>
            ))}
            {student.artifactItems.map((item) => (
              <li key={`artifact-${item.uid}`}>
                <ResourceThumb itemUid={item.uid} rarity={item.rarity} size="drop" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function OpinionSummary({ opinion }: { opinion: FavoriteEventOpinion }) {
  if (opinion === null) {
    return (
      <p className="mt-v2-block-gap flex items-center gap-2 rounded-md bg-v2-inset px-3 py-2 text-sm text-v2-fg-disabled">
        <ChatBubbleOvalLeftEllipsisIcon className="size-4 shrink-0" aria-hidden="true" />
        의견을 불러오지 못했어요
      </p>
    );
  }

  const preview = opinion.pinnedBody
    ? opinion.pinnedBody.length > OPINION_PREVIEW_LENGTH
      ? `${opinion.pinnedBody.slice(0, OPINION_PREVIEW_LENGTH)}…`
      : opinion.pinnedBody
    : null;

  return (
    <p className="mt-v2-block-gap flex items-center gap-2 rounded-md bg-v2-inset px-3 py-2 text-sm text-v2-fg">
      <ChatBubbleOvalLeftEllipsisIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-v2-fg-tertiary tabular-nums" aria-hidden="true">
          {opinion.count.toLocaleString("ko-KR")}
        </span>
        <span className="sr-only">의견 {opinion.count.toLocaleString("ko-KR")}개</span>
        {opinion.hasRecentOpinion ? (
          <>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-v2-live motion-safe:animate-pulse" />
            <span className="sr-only">최근 3일 내 새 의견 있음</span>
          </>
        ) : null}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", preview ? "text-v2-fg" : "text-v2-fg-tertiary")}>
        {preview ?? "남긴 의견이 없어요"}
      </span>
    </p>
  );
}
