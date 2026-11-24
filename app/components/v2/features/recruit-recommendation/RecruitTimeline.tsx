import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ClockIcon, EyeIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { groupFutureContents } from "~/domain/futures/content-timeline-grouping";
import {
  formatContentPeriod,
  getDayDividerParts,
  getRemainingTime,
  isOngoingFutureContent,
} from "~/domain/futures/futures-view-model";
import type { RecruitGoal } from "~/domain/recruit-recommendation";
import type { RecruitTimelineContent } from "~/domain/recruit-recommendation-timeline";
import { formatInstantDateKey, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { TrailingIconText } from "../../primitives/TrailingIconText";
import { ContentMedia } from "../futures/ContentMedia";
import { RemainingLabel } from "../futures/RemainingLabel";
import StudentPortrait from "../students/StudentPortrait";
import { StudentThumb } from "../students/StudentThumb";
import { RecruitStudentTile } from "./RecruitStudentTile";
import { FavoriteToggle } from "./RecruitValues";
import type { RecruitContentView, RecruitPickupView } from "./types";

type TimelineContent = RecruitTimelineContent<RecruitContentView, RecruitPickupView>;

// The upcoming pickups by date, each with its recommended students as tiles, then the students without a recommendation
// and the ones not judged yet. One tile's evidence is open at a time.
export function RecruitTimeline({
  goal,
  contents,
  substituteNames,
  now,
  timeZone,
  onRevealSpoiler,
}: {
  goal: RecruitGoal;
  contents: TimelineContent[];
  substituteNames: ReadonlyMap<string, string>;
  now: UtcIsoString;
  timeZone: string;
  onRevealSpoiler: (contentUid: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const groups = groupFutureContents(
    contents.map((entry) => ({
      ...entry,
      since: entry.content.since,
      until: entry.content.until,
      contentType: entry.content.contentType,
      runType: entry.content.runType,
      students: entry.content.pickups,
    })),
    timeZone,
    now,
  );
  return (
    <div className="@container relative">
      {/* Starts at the first content's image, below the first date heading (mt-1, one text-xs line, mb-3). */}
      <span
        aria-hidden="true"
        className="absolute top-8 bottom-0 left-[1.1875rem] hidden w-0.5 bg-v2-inset @md:block"
      />
      {groups.map((group) => (
        <section
          key={group.groupDate ? formatInstantDateKey(group.groupDate, timeZone) : "live"}
          aria-label={group.groupDate ? undefined : "진행 중"}
        >
          <DateDivider groupDate={group.groupDate} now={now} timeZone={timeZone} />
          <ol>
            {group.contents.map((entry) => (
              <li key={entry.content.uid}>
                <TimelineItem
                  goal={goal}
                  entry={entry}
                  substituteNames={substituteNames}
                  now={now}
                  timeZone={timeZone}
                  openKey={openKey}
                  onOpenKeyChange={setOpenKey}
                  onRevealSpoiler={onRevealSpoiler}
                />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function DateDivider({
  groupDate,
  now,
  timeZone,
}: {
  groupDate: UtcIsoString | null;
  now: UtcIsoString;
  timeZone: string;
}) {
  const className = "relative mt-7 mb-3 text-xs first:mt-1 @md:ml-[3.25rem]";
  if (groupDate === null) {
    return (
      <p className={cn(className, "flex items-center gap-1.5 font-semibold text-v2-live")}>
        <span aria-hidden="true" className="size-[0.4375rem] rounded-full bg-v2-live" />
        진행 중
      </p>
    );
  }
  const parts = getDayDividerParts(groupDate, now, timeZone);
  return (
    <p className={cn(className, "flex items-baseline gap-2 text-v2-fg")}>
      <span className="font-semibold tabular-nums">{parts.dateText}</span>
      <span className="text-v2-fg-tertiary tabular-nums">{parts.relativeText}</span>
    </p>
  );
}

function TimelineItem({
  goal,
  entry,
  substituteNames,
  now,
  timeZone,
  openKey,
  onOpenKeyChange,
  onRevealSpoiler,
}: {
  goal: RecruitGoal;
  entry: TimelineContent;
  substituteNames: ReadonlyMap<string, string>;
  now: UtcIsoString;
  timeZone: string;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
  onRevealSpoiler: (contentUid: string) => void;
}) {
  const { content } = entry;
  const ongoing = isOngoingFutureContent(content.since, content.until, now);
  const remaining =
    ongoing && content.until && !content.endless ? getRemainingTime(content.until, now, timeZone) : null;
  const tileKey = (pickup: RecruitPickupView) => `${content.uid}\u0000${pickup.favoriteKey}`;

  return (
    <article className="relative mb-5 grid grid-cols-[minmax(0,1fr)] @md:grid-cols-[2.5rem_minmax(0,1fr)] @md:gap-x-3">
      <div className="relative z-10 hidden self-start rounded-md shadow-[0_0_0_4px_var(--color-v2-canvas)] @md:block">
        <ContentMedia
          source={content.hidden ? { kind: "placeholder" } : content.mediaSource}
          contentType={content.contentType}
          typeLabel={content.typeLabel}
          size="feed"
        />
      </div>
      <div className="min-w-0">
        {content.hidden ? (
          <div className="space-y-1">
            <p className="text-base font-semibold text-v2-fg">스포일러가 포함되어 있어요</p>
            <Button variant="secondary" onClick={() => onRevealSpoiler(content.uid)}>
              <EyeIcon className="size-4" aria-hidden="true" />
              내용 보기
            </Button>
          </div>
        ) : (
          <>
            <ContentTitle content={content} />
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-v2-fg-tertiary">
              <span>{content.typeLabel}</span>
              <Separated>
                <span className="tabular-nums">
                  {formatContentPeriod({
                    since: content.since,
                    until: content.until,
                    endless: content.endless,
                    contentType: content.contentType,
                    timeZone,
                  })}
                </span>
              </Separated>
              {remaining ? (
                <Separated>
                  <RemainingLabel remaining={remaining} />
                </Separated>
              ) : null}
            </p>
            {content.cautionText ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-v2-warning">
                <ClockIcon className="size-3.5" aria-hidden="true" />
                {content.cautionText}
              </p>
            ) : null}
            {entry.recommended.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {entry.recommended.map(({ pickup, student, aiRecommended }) => (
                  <li key={pickup.favoriteKey}>
                    <RecruitStudentTile
                      goal={goal}
                      pickup={pickup}
                      student={student}
                      aiRecommended={aiRecommended}
                      substituteNames={substituteNames}
                      timeZone={timeZone}
                      open={openKey === tileKey(pickup)}
                      onOpenChange={(open) => onOpenKeyChange(open ? tileKey(pickup) : null)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {entry.notRecommended.length > 0 ? (
              <StudentGroup title="추천 없음">
                {entry.notRecommended.map(({ pickup }) => (
                  <li key={pickup.favoriteKey}>
                    <PickupStudentChip pickup={pickup} />
                  </li>
                ))}
              </StudentGroup>
            ) : null}
            {entry.recruited.length > 0 ? (
              <StudentGroup title="모집한 학생">
                {entry.recruited.map((pickup) => (
                  <li key={pickup.favoriteKey}>
                    <PickupStudentChip pickup={pickup} />
                  </li>
                ))}
              </StudentGroup>
            ) : null}
            {entry.pending.length > 0 ? (
              <StudentGroup title="판정 준비 중" gapClassName="gap-3">
                {entry.pending.map((pickup) => (
                  <li key={pickup.favoriteKey} className="w-12">
                    <StudentThumb
                      studentUid={pickup.studentUid}
                      name={pickup.name}
                      variant={pickup.variant}
                      recruitmentLabel={pickup.recruitmentLabel}
                      isNew={pickup.isNew}
                      fluid
                    />
                  </li>
                ))}
              </StudentGroup>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function ContentTitle({ content }: { content: RecruitContentView }) {
  if (!content.linkable) {
    return <p className="text-base font-semibold whitespace-pre-line text-v2-fg">{content.name}</p>;
  }
  return (
    <Link
      to={content.link}
      prefetch="intent"
      className={cn(
        "block w-fit text-base font-semibold whitespace-pre-line text-v2-fg underline decoration-transparent hover:decoration-current v2-interaction-transition",
        v2FocusRing,
      )}
      {...getV2LinkTransitionProps("forward")}
    >
      <TrailingIconText text={content.name}>
        <ChevronRightIcon aria-hidden="true" className="ml-1 inline-block size-4 align-middle text-v2-fg-tertiary" />
      </TrailingIconText>
    </Link>
  );
}

function Separated({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="text-v2-fg-disabled">
        ·
      </span>
      {children}
    </>
  );
}

function StudentGroup({
  title,
  gapClassName = "gap-1.5",
  children,
}: {
  title: string;
  gapClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-2.5" aria-label={title}>
      <h3 className="mb-1.5 text-xs font-normal text-v2-fg-tertiary">{title}</h3>
      <ul className={cn("flex flex-wrap items-start", gapClassName)}>{children}</ul>
    </section>
  );
}

// A pickup student without a recommendation: the portrait, the name, the recruitment label, and the heart.
function PickupStudentChip({ pickup }: { pickup: RecruitPickupView }) {
  const studentLabel = pickup.variant ? `${pickup.name}(${pickup.variant})` : pickup.name;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-v2-surface py-1 pr-2 pl-1">
      <span className="relative h-[2.375rem] w-8 shrink-0 overflow-hidden rounded bg-v2-inset">
        <StudentPortrait
          uid={pickup.studentUid ?? "unlisted"}
          className="absolute inset-0 size-full object-cover"
          haloScale="72%"
        />
      </span>
      <span className="min-w-0 text-xs leading-4 text-v2-fg">
        <span className="block whitespace-nowrap">{pickup.name}</span>
        {pickup.variant ? (
          <span className="block text-[0.6875rem] whitespace-nowrap text-v2-fg-tertiary">{pickup.variant}</span>
        ) : null}
      </span>
      <span className="text-[0.6875rem] whitespace-nowrap text-v2-fg-tertiary">{pickup.recruitmentLabel}</span>
      <FavoriteToggle favorite={pickup.favorite} studentLabel={studentLabel} size="sm" className="ml-0.5" />
    </div>
  );
}
