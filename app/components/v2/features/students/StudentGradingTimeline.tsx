import { Link } from "react-router";
import { GradingTagIcon } from "./GradingTagIcon";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, parseUtcTimestamp } from "~/lib/date-time";
import { STUDENT_GRADING_TAG_DISPLAY, sortStudentGradingTags, type StudentGradingTagValue } from "~/models/student-grading-tag";

export type StudentGradingTimelineItem = {
  uid: string;
  studentUid: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: StudentGradingTagValue[];
  user: { username: string; profileStudentId: string | null };
  student: { uid: string; name: string };
};

export function formatStudentGradingTimestamp(createdAt: string, updatedAt: string, timeZone: string) {
  const edited = parseUtcTimestamp(updatedAt).isAfter(parseUtcTimestamp(createdAt));
  const date = formatInstant(edited ? updatedAt : createdAt, { timeZone, format: "YYYY/MM/DD" });
  return edited ? `수정됨 · ${date}` : date;
}

export default function StudentGradingTimeline({
  gradings,
  currentUser,
}: {
  gradings: StudentGradingTimelineItem[];
  currentUser?: { username: string } | null;
}) {
  const timeZone = useDisplayTimeZone();
  const currentUserGrading = gradings.find((grading) => currentUser && grading.user.username === currentUser.username);
  const ordered = currentUserGrading
    ? [currentUserGrading, ...gradings.filter((grading) => grading.uid !== currentUserGrading.uid)]
    : gradings;
  if (ordered.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg bg-v2-surface p-v2-block-p">
      {ordered.map((grading, index) => {
        const isCurrentUser = currentUser?.username === grading.user.username;
        return (
          <article key={grading.uid} className={`py-3 ${index === 0 ? "pt-0" : "border-t border-v2-divider"} ${index === ordered.length - 1 ? "pb-0" : ""}`}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                {isCurrentUser ? (
                  <span className="block truncate text-sm leading-[1.43] font-medium text-v2-fg">나의 평가</span>
                ) : (
                  <Link to={`/@${grading.user.username}`} className="block truncate text-sm leading-[1.43] font-medium text-v2-fg hover:underline">
                    @{grading.user.username}
                  </Link>
                )}
              </div>
              <time className="shrink-0 text-xs leading-[1.43] text-v2-fg-tertiary tabular-nums" dateTime={grading.updatedAt}>
                {formatStudentGradingTimestamp(grading.createdAt, grading.updatedAt, timeZone)}
              </time>
            </div>
            {grading.comment?.trim() ? <p className="mt-1 whitespace-pre-line text-sm leading-[1.43] text-v2-fg">{grading.comment.trim()}</p> : null}
            {grading.tags && grading.tags.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-[1.43] text-v2-fg-secondary">
                {sortStudentGradingTags(grading.tags).map((tag) => (
                  <li key={tag} className="inline-flex items-center gap-1">
                    <GradingTagIcon tag={tag} size="xs" />
                    {STUDENT_GRADING_TAG_DISPLAY[tag]}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
