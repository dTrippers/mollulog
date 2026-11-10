import { CalendarDaysIcon, PlayCircleIcon, TvIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import type { WalkthroughTimelineCommunityPostBlock } from "~/models/community";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { getPickupAvatarSummary } from "./feed-model";

const attachmentClassName =
  "mt-2 flex w-fit max-w-full min-w-0 items-center gap-2 rounded-lg border border-v2-divider py-1.5 pr-2.5 pl-1.5";

// The pickup students by avatar only. The name is the tooltip and the accessible name.
function PickupAvatars({
  students,
  remainingCount,
}: {
  students: { uid: string; name: string }[];
  remainingCount: number;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="mr-0.5">픽업</span>
      {students.map((student) => (
        <span key={student.uid} title={student.name} className="inline-flex">
          <RoundStudentImage studentUid={student.uid} alt={student.name} size={6} />
        </span>
      ))}
      {remainingCount > 0 ? <span className="ml-0.5">외 {remainingCount}명</span> : null}
    </span>
  );
}

const subjectLinkClassName =
  "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md hover:text-v2-fg hover:underline";

// The content an event opinion or a recruitment result is about, as a muted line above the text: the event name (one
// line, the whole name in the tooltip), then the pickup students. It stays secondary to the post text.
export function EventAttachment({
  contentUid,
  contentType,
  name,
  pickupStudents,
}: {
  contentUid: string;
  contentType: string | null;
  name: string;
  pickupStudents: { uid: string; name: string }[];
}) {
  const { visible, remainingCount } = getPickupAvatarSummary(pickupStudents);
  const live = contentType === "live";
  const Icon = live ? TvIcon : CalendarDaysIcon;
  return (
    <div className="mt-1 flex min-w-0 flex-col gap-1 text-xs text-v2-fg-tertiary">
      <Link to={live ? `/lives/${contentUid}` : `/events/${contentUid}`} title={name} className={subjectLinkClassName}>
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{name}</span>
      </Link>
      {visible.length > 0 ? <PickupAvatars students={visible} remainingCount={remainingCount} /> : null}
    </div>
  );
}

// The student a review is about, as a muted line above the text.
export function StudentAttachment({ uid, name }: { uid: string; name: string }) {
  return (
    <div className="mt-1 flex min-w-0 text-xs text-v2-fg-tertiary">
      <Link to={`/students/${uid}`} title={name} className={subjectLinkClassName}>
        <RoundStudentImage studentUid={uid} size={6} />
        <span className="min-w-0 truncate">{name}</span>
      </Link>
    </div>
  );
}

// A walkthrough timeline: terrain, defense and difficulty, the students it uses, and the link to the timeline.
export function WalkthroughAttachment({ block }: { block: WalkthroughTimelineCommunityPostBlock }) {
  const students = block.usedStudentUids.slice(0, block.partySize ?? 6);
  return (
    <Link
      to={`/timelines/${block.timelineUid}`}
      className="mt-2 flex min-w-0 flex-col gap-1.5 rounded-lg border border-v2-divider px-2.5 py-2 hover:bg-v2-hover"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        {[
          terrainLocale[block.terrain],
          defenseTypeLocale[block.defenseType],
          difficultyLocale[block.maxDifficulty],
        ].map((text) => (
          <span
            key={text}
            className="inline-flex min-h-5 items-center rounded-md bg-v2-inset px-1.5 text-[0.6875rem] text-v2-fg-secondary"
          >
            {text}
          </span>
        ))}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          {students.length > 0 ? (
            <span className="flex -space-x-1.5">
              {students.map((uid) => (
                <span key={uid} className="rounded-full ring-2 ring-v2-surface">
                  <RoundStudentImage studentUid={uid} size={6} />
                </span>
              ))}
            </span>
          ) : null}
          {block.partyCount > 1 ? (
            <span className="text-xs text-v2-fg-tertiary">외 {block.partyCount - 1}편성</span>
          ) : null}
        </span>
        <span className="ml-auto text-xs font-medium text-v2-link">공략 타임라인 자세히 보기</span>
      </span>
    </Link>
  );
}

// An external video: the title is the link, since the feed shows no thumbnail.
export function VideoAttachment({ href, title }: { href: string; title: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${attachmentClassName} hover:bg-v2-hover`}>
      <PlayCircleIcon className="size-5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      <span className="line-clamp-2 min-w-0 text-[0.8125rem] font-semibold text-v2-fg">{title}</span>
    </a>
  );
}
