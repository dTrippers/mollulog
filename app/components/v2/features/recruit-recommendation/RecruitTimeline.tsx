import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ClockIcon, EyeIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useRef, useState } from "react";
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
import type { RecruitRecommendationStudent } from "~/models/recruit-recommendation-contract";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { TrailingIconText } from "../../primitives/TrailingIconText";
import { ContentMedia } from "../futures/ContentMedia";
import { RemainingLabel } from "../futures/RemainingLabel";
import StudentPortrait from "../students/StudentPortrait";
import { StudentThumb } from "../students/StudentThumb";
import { RecruitEvidencePanel } from "./RecruitEvidencePanel";
import { RecruitStudentDetail } from "./RecruitStudentDetail";
import { RecruitStudentTile } from "./RecruitStudentTile";
import { FavoriteToggle } from "./RecruitValues";
import type { RecruitContentView, RecruitPickupView } from "./types";

type TimelineContent = RecruitTimelineContent<RecruitContentView, RecruitPickupView>;

// The upcoming pickups by date, each with its recommended students as tiles, then the students without a recommendation,
// the recruited ones, and the ones not judged yet. One student's evidence is open at a time.
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
      {/* Date groups sit further apart than the contents of one date, so a date heading reads as the start of its group. */}
      {groups.map((group, index) => (
        <section
          key={group.groupDate ? formatInstantDateKey(group.groupDate, timeZone) : "live"}
          aria-label={group.groupDate ? undefined : "진행 중"}
          className={index > 0 ? "mt-12" : undefined}
        >
          <DateDivider groupDate={group.groupDate} now={now} timeZone={timeZone} />
          <ol className="flex flex-col gap-8">
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
  const className = "relative mt-1 mb-3 text-xs @md:ml-[3.25rem]";
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
    <article className="relative grid grid-cols-[minmax(0,1fr)] @md:grid-cols-[2.5rem_minmax(0,1fr)] @md:gap-x-3">
      <div className="relative z-10 hidden self-start rounded-md shadow-[0_0_0_4px_var(--color-v2-canvas)] @md:block">
        <ContentMedia
          source={content.hidden ? { kind: "placeholder" } : content.mediaSource}
          contentType={content.contentType}
          typeLabel={content.typeLabel}
          size="feed"
        />
      </div>
      <div className="min-w-0">
        {/* Below the side column the image sits beside the title, so the tiles keep the full width. */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 @md:hidden">
            <ContentMedia
              source={content.hidden ? { kind: "placeholder" } : content.mediaSource}
              contentType={content.contentType}
              typeLabel={content.typeLabel}
              size="feed"
            />
          </div>
          <div className="min-w-0 flex-1">
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
              </>
            )}
          </div>
        </div>
        {content.hidden ? null : (
          <>
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
            {[
              { title: "추천 없음", pickups: entry.notRecommended },
              { title: "모집한 학생", pickups: entry.recruited },
            ].map(({ title, pickups }) =>
              pickups.length > 0 ? (
                <StudentGroup
                  key={title}
                  title={title}
                  listClassName="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5"
                >
                  {pickups.map(({ pickup, student }) => (
                    <li key={pickup.favoriteKey}>
                      <PickupStudentChip
                        goal={goal}
                        pickup={pickup}
                        student={student}
                        substituteNames={substituteNames}
                        timeZone={timeZone}
                        open={openKey === tileKey(pickup)}
                        onOpenChange={(open) => onOpenKeyChange(open ? tileKey(pickup) : null)}
                      />
                    </li>
                  ))}
                </StudentGroup>
              ) : null,
            )}
            {entry.pending.length > 0 ? (
              <StudentGroup title="판정 준비 중" listClassName="flex flex-wrap items-start gap-3">
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
  listClassName,
  children,
}: {
  title: string;
  listClassName: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-2.5" aria-label={title}>
      <h3 className="mb-1.5 text-xs font-normal text-v2-fg-tertiary">{title}</h3>
      <ul className={listClassName}>{children}</ul>
    </section>
  );
}

// A pickup student without a recommendation, or one already recruited: the portrait, the name, the variant and the
// recruitment label on lines of their own (the label follows the name when there is no variant), and the heart. Every
// chip in a group has the same width, and a long name is cut short. A student the answer has opens its evidence, marked
// by the same chevron as a recommended tile; a chip without evidence keeps the chevron's space so the hearts line up. The heart button sits above the chip's
// own button, so it stays a separate control.
function PickupStudentChip({
  goal,
  pickup,
  student,
  substituteNames,
  timeZone,
  open,
  onOpenChange,
}: {
  goal: RecruitGoal;
  pickup: RecruitPickupView;
  student: RecruitRecommendationStudent | null;
  substituteNames: ReadonlyMap<string, string>;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const chipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const studentLabel = pickup.variant ? `${pickup.name}(${pickup.variant})` : pickup.name;
  return (
    <div
      ref={chipRef}
      className={cn(
        "relative flex h-full items-center gap-2 rounded-lg py-1 pr-1 pl-1 v2-interaction-transition",
        open ? "bg-v2-inset" : "bg-v2-surface",
      )}
    >
      {student ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${studentLabel} 근거`}
          onClick={() => onOpenChange(!open)}
          className={cn(
            "absolute inset-0 cursor-pointer rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:bg-v2-hover v2-interaction-transition",
            v2FocusRing,
          )}
        />
      ) : null}
      <span className="pointer-events-none relative h-12 w-10 shrink-0 overflow-hidden rounded bg-v2-inset">
        <StudentPortrait
          uid={pickup.studentUid ?? "unlisted"}
          className="absolute inset-0 size-full object-cover"
          haloScale="72%"
        />
      </span>
      <span className="pointer-events-none relative min-w-0 flex-1 leading-4">
        <span className="block truncate text-xs text-v2-fg">{pickup.name}</span>
        {pickup.variant ? (
          <span className="block truncate text-[0.6875rem] text-v2-fg-tertiary">{pickup.variant}</span>
        ) : null}
        <span className={cn("block truncate text-[0.6875rem] text-v2-fg-tertiary", pickup.isNew && "text-v2-new")}>
          {pickup.recruitmentLabel}
        </span>
      </span>
      <FavoriteToggle favorite={pickup.favorite} studentLabel={studentLabel} size="sm" />
      <ChevronRightIcon
        aria-hidden="true"
        className={cn("pointer-events-none -ml-1 size-4 shrink-0 text-v2-fg-tertiary", !student && "invisible")}
      />
      {student ? (
        <RecruitEvidencePanel
          open={open}
          onClose={() => onOpenChange(false)}
          studentLabel={studentLabel}
          anchorRef={chipRef}
          triggerRef={triggerRef}
          detail={(showHeader) => (
            <RecruitStudentDetail
              goal={goal}
              student={student}
              aiRecommended={false}
              substituteNames={substituteNames}
              timeZone={timeZone}
              name={pickup.name}
              variant={pickup.variant}
              showHeader={showHeader}
            />
          )}
        />
      ) : null}
    </div>
  );
}
