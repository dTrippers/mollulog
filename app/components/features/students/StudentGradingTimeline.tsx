import { PencilSquareIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { Link } from "react-router";
import { ProfileImage, TagIcon } from "~/components/primitives";
import {
  STUDENT_GRADING_TAG_DISPLAY,
  type StudentGradingTagValue,
  sortStudentGradingTags,
} from "~/models/student-grading-tag";

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

type StudentGradingTimelineProps = {
  gradings: StudentGradingTimelineItem[];
  currentUser?: { username: string } | null;
  hideMetaRow?: boolean;
  hideEditAction?: boolean;
};

export function formatStudentGradingTimestamp(createdAt: string, updatedAt: string) {
  const created = dayjs(createdAt);
  const updated = dayjs(updatedAt);
  if (updated.isAfter(created)) {
    return `(수정됨) ${updated.format("YYYY.MM.DD")}`;
  }
  return created.format("YYYY.MM.DD");
}

function TimelineCard({
  grading,
  isCurrentUser,
  hideMetaRow,
  hideEditAction,
}: {
  grading: StudentGradingTimelineItem;
  isCurrentUser: boolean;
  hideMetaRow: boolean;
  hideEditAction: boolean;
}) {
  const studentName = grading.student.name;
  const authorName = isCurrentUser ? "나의 평가" : grading.user.username;

  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="shrink-0">
            <ProfileImage studentUid={grading.student.uid} imageSize={8} />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to={`/students/${grading.studentUid}`}
              className="block truncate font-semibold text-neutral-900 hover:underline dark:text-neutral-100"
            >
              {studentName}
            </Link>
            {!hideMetaRow && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                <Link to={`/@${grading.user.username}`} className="hover:underline">
                  @{authorName}
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatStudentGradingTimestamp(grading.createdAt, grading.updatedAt)}
          </p>

          {isCurrentUser && !hideEditAction && (
            <Link
              to={`/students/${grading.studentUid}/grade`}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-50"
            >
              <PencilSquareIcon className="size-4" />
              <span>수정</span>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {grading.comment && (
          <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-200">{grading.comment.trim()}</p>
        )}

        {grading.tags && grading.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortStudentGradingTags(grading.tags).map((tag) => (
              <div
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              >
                <TagIcon tag={tag} size="sm" />
                <span>{STUDENT_GRADING_TAG_DISPLAY[tag]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export default function StudentGradingTimeline({
  gradings,
  currentUser,
  hideMetaRow = false,
  hideEditAction = false,
}: StudentGradingTimelineProps) {
  const currentUserGrading = gradings.find((grading) => currentUser && grading.user.username === currentUser.username);
  const sortedGradings = currentUserGrading
    ? [currentUserGrading, ...gradings.filter((grading) => grading.uid !== currentUserGrading.uid)]
    : gradings;

  if (sortedGradings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {sortedGradings.map((grading) => (
        <TimelineCard
          key={grading.uid}
          grading={grading}
          isCurrentUser={currentUser?.username === grading.user.username}
          hideMetaRow={hideMetaRow}
          hideEditAction={hideEditAction}
        />
      ))}
    </div>
  );
}
