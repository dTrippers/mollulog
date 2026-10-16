import { ChevronRightIcon, StarIcon } from "@heroicons/react/16/solid";
import { ClockIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import type { FutureContentGroup } from "~/domain/futures/content-timeline-grouping";
import {
  type FutureSpecialCase,
  formatContentPeriod,
  getCautionText,
  getDayDividerParts,
  getFaceStack,
  getFutureSpecialCases,
  getRemainingTime,
  isOngoingFutureContent,
  selectFutureMediaSource,
} from "~/domain/futures/futures-view-model";
import { formatInstantDateKey, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { useImageFailure } from "../../primitives/use-image-failure";
import { ContentMedia } from "./ContentMedia";
import { getFutureMediaTypeLabel } from "./labels";
import { RemainingLabel } from "./RemainingLabel";
import type { FutureViewContent } from "./types";

export type FutureListProps = {
  groups: FutureContentGroup<FutureViewContent>[];
  now: UtcIsoString;
  timeZone: string;
  revealedSpoilers: ReadonlySet<string>;
  onRevealSpoiler: (contentUid: string) => void;
  onOpenContent: (contentUid: string) => void;
};

// Date blocks of fixed-column rows. Desktop rows align every element on one x line, and each row is one line: the name
// truncates first, and the remaining time and notes sit after it. Mobile stacks the name, the notes, and the type with the
// period. The list has no opinions and no quick panel.
export function FutureList({
  groups,
  now,
  timeZone,
  revealedSpoilers,
  onRevealSpoiler,
  onOpenContent,
}: FutureListProps) {
  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const key = group.groupDate ? formatInstantDateKey(group.groupDate, timeZone) : "live";
        const headingId = `future-list-${key}`;
        return (
          <section key={key} aria-labelledby={headingId} className="overflow-hidden rounded-lg bg-v2-surface">
            <header className="flex min-h-11 items-center justify-between gap-3 border-b border-v2-inset px-v2-block-p py-2">
              {group.groupDate === null ? (
                <h2 id={headingId} className="text-sm font-semibold text-v2-live">
                  ● 진행 중
                </h2>
              ) : (
                <h2 id={headingId} className="text-sm text-v2-fg">
                  <DateHeading since={group.groupDate} now={now} timeZone={timeZone} />
                </h2>
              )}
              <span className="text-xs text-v2-fg-tertiary tabular-nums">{group.contents.length}건</span>
            </header>
            <ul className="divide-y divide-v2-inset">
              {group.contents.map((content) => (
                <li key={content.uid} data-futures-content-uid={content.uid}>
                  <ListRow
                    content={content}
                    now={now}
                    timeZone={timeZone}
                    revealed={revealedSpoilers.has(content.uid)}
                    onRevealSpoiler={onRevealSpoiler}
                    onOpenContent={onOpenContent}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DateHeading({ since, now, timeZone }: { since: UtcIsoString; now: UtcIsoString; timeZone: string }) {
  const parts = getDayDividerParts(since, now, timeZone);
  return (
    <>
      <span className="font-semibold tabular-nums">{parts.dateText}</span>{" "}
      <span className="text-xs text-v2-fg-tertiary tabular-nums">{parts.relativeText}</span>
    </>
  );
}

function ListRow({
  content,
  now,
  timeZone,
  revealed,
  onRevealSpoiler,
  onOpenContent,
}: {
  content: FutureViewContent;
  now: UtcIsoString;
  timeZone: string;
  revealed: boolean;
  onRevealSpoiler: (contentUid: string) => void;
  onOpenContent: (contentUid: string) => void;
}) {
  const hidden = content.isSpoiler && !revealed;
  const linkable = content.linkable && !hidden;
  const typeLabel = getFutureMediaTypeLabel(content);
  const ongoing = isOngoingFutureContent(content.since, content.until, now);
  const remaining =
    ongoing && content.until && !content.endless ? getRemainingTime(content.until, now, timeZone) : null;
  const specialCases = getFutureSpecialCases({
    contentType: content.contentType,
    tags: content.tags,
    recruitments: content.students,
    recruitmentGroupUid: content.recruitmentGroupUid,
    recruitmentPeriod: content.recruitmentPeriod,
    since: content.since,
    until: content.until,
    endless: content.endless,
    now,
    timeZone,
  });
  // A hidden spoiler row shows the same period as any other row.
  const period = formatContentPeriod({
    since: content.since,
    until: content.until,
    endless: content.endless,
    contentType: content.contentType,
    timeZone,
  });
  const name = content.name.replaceAll("\n", " ");
  const media = (
    <ContentMedia
      source={selectFutureMediaSource({
        hidden,
        isRaid: content.raid !== null,
        boss: content.raid?.boss ?? null,
        logoContentUid: content.logoContentUid,
      })}
      contentType={content.contentType}
      typeLabel={typeLabel}
      size="row"
    />
  );

  const notes = hidden ? null : (
    <span className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap">
      {remaining ? <RemainingLabel remaining={remaining} /> : null}
      {specialCases.map((specialCase) => (
        <SpecialNote key={specialCase.kind} specialCase={specialCase} />
      ))}
    </span>
  );

  const faces = hidden ? { shown: [], extra: 0 } : getFaceStack(content.students);
  const row = (
    <div
      className={cn(
        "flex items-center gap-3 px-v2-block-p py-2 lg:grid lg:min-h-11 lg:grid-cols-[1.75rem_7rem_minmax(0,1fr)_6.25rem_6.5rem_1rem] lg:gap-x-3 lg:py-1",
      )}
    >
      {media}
      <span className="hidden truncate text-xs text-v2-fg-tertiary lg:block">{typeLabel}</span>
      <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-3">
        {hidden ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-v2-fg">스포일러가 포함되어 있어요</span>
            <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => onRevealSpoiler(content.uid)}>
              내용 보기
            </Button>
          </div>
        ) : (
          <p className="min-w-0 truncate text-sm font-semibold text-v2-fg" title={name}>
            {name}
          </p>
        )}
        {notes}
        <p className="mt-0.5 text-xs text-v2-fg-tertiary tabular-nums lg:hidden">
          {typeLabel} · {period}
        </p>
      </div>
      <div className="hidden items-center lg:flex" aria-hidden="true">
        {faces.shown.map((entry, index) => (
          <FaceImage key={entry.favoriteKey} studentUid={entry.studentUid} overlapped={index > 0} />
        ))}
        {faces.extra > 0 ? <span className="ml-1 text-xs text-v2-fg-tertiary tabular-nums">+{faces.extra}</span> : null}
      </div>
      <span className="hidden text-right text-sm text-v2-fg-secondary tabular-nums lg:block">{period}</span>
      {linkable ? (
        <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className="size-4 shrink-0" />
      )}
    </div>
  );

  if (linkable) {
    return (
      <Link
        to={content.link}
        state={content.navigationState}
        prefetch="intent"
        aria-label={name}
        className={cn("block hover:bg-v2-hover", v2FocusRing)}
        {...getV2LinkTransitionProps("forward", () => onOpenContent(content.uid))}
      >
        {row}
      </Link>
    );
  }
  return <div>{row}</div>;
}

function FaceImage({ studentUid, overlapped }: { studentUid: string | null; overlapped: boolean }) {
  const src = studentUid ? studentImageUrl(studentUid) : null;
  const image = useImageFailure(src);
  return (
    <span
      className={cn(
        "size-6 overflow-hidden rounded-full border border-v2-surface bg-v2-inset",
        overlapped && "-ml-1.5",
      )}
    >
      {src && !image.failed ? (
        <img
          ref={image.ref}
          src={src}
          alt=""
          loading="lazy"
          onError={image.onError}
          className="size-full object-cover"
        />
      ) : null}
    </span>
  );
}

function SpecialNote({ specialCase }: { specialCase: FutureSpecialCase }) {
  if (specialCase.kind === "perk-free-100") {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-v2-perk">
        <StarIcon className="size-3.5" aria-hidden="true" />
        100회 무료
      </span>
    );
  }
  const cautionText = getCautionText(specialCase);
  if (cautionText !== null) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-v2-warning tabular-nums">
        <ClockIcon className="size-3.5" aria-hidden="true" />
        {cautionText}
      </span>
    );
  }
  return null;
}
