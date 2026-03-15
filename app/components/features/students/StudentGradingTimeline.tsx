import { PencilSquareIcon, PlusCircleIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { Link } from "react-router";
import { ProfileImage, TagIcon } from "~/components/primitives";
import {
  STUDENT_GRADING_TAG_CONSTANTS,
  STUDENT_GRADING_TAG_DISPLAY,
  type StudentGradingTagValue,
} from "~/models/student-grading-tag";

export type StudentGradingTimelineItem = {
  uid: string;
  studentUid: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: StudentGradingTagValue[];
  user?: { username: string; profileStudentId: string | null };
  student?: { uid: string; name: string };
};

type StudentGradingTimelineProps = {
  gradings: StudentGradingTimelineItem[];
  student?: { uid: string; name: string };
  currentUser?: { username: string } | null;
  hideAuthorName?: boolean;
};

const TAG_ORDER = Object.values(STUDENT_GRADING_TAG_CONSTANTS);

function formatTimestamp(createdAt: string, updatedAt: string) {
  const created = dayjs(createdAt);
  const updated = dayjs(updatedAt);
  if (updated.isAfter(created)) {
    return `${updated.format("YYYY.MM.DD")} 수정됨`;
  }
  return created.format("YYYY.MM.DD");
}

function sortTags(tags: StudentGradingTagValue[]) {
  return [...tags].sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b));
}

function TimelineCard({
  grading,
  isCurrentUser,
  hideAuthorName,
}: {
  grading: StudentGradingTimelineItem;
  isCurrentUser: boolean;
  hideAuthorName: boolean;
}) {
  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="shrink-0">
            <ProfileImage studentUid={grading.user?.profileStudentId ?? grading.student?.uid ?? null} imageSize={8} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {!hideAuthorName &&
                (grading.user ? (
                  <Link
                    to={`/@${grading.user.username}`}
                    className="font-semibold text-neutral-900 hover:underline dark:text-neutral-100"
                  >
                    {isCurrentUser ? "나의 평가" : grading.user.username}
                  </Link>
                ) : (
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {isCurrentUser ? "나의 평가" : "평가"}
                  </span>
                ))}
              {grading.student && (
                <>
                  {!hideAuthorName && <span className="text-sm text-neutral-400 dark:text-neutral-500">·</span>}
                  <Link
                    to={`/students/${grading.student.uid}`}
                    className={`${hideAuthorName ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-sm text-neutral-600 dark:text-neutral-300"} hover:underline`}
                  >
                    {grading.student.name}
                  </Link>
                </>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {formatTimestamp(grading.createdAt, grading.updatedAt)}
            </p>
          </div>
        </div>

        {isCurrentUser && (
          <Link
            to={`/students/${grading.studentUid}/grade`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-50"
          >
            <PencilSquareIcon className="size-4" />
            <span>수정</span>
          </Link>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {grading.comment && (
          <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-200">
            {grading.comment.trim()}
          </p>
        )}

        {grading.tags && grading.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortTags(grading.tags).map((tag) => (
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
  student,
  currentUser,
  hideAuthorName = false,
}: StudentGradingTimelineProps) {
  const currentUserGrading = gradings.find((grading) => currentUser && grading.user?.username === currentUser.username);
  const sortedGradings = currentUserGrading
    ? [currentUserGrading, ...gradings.filter((grading) => grading.uid !== currentUserGrading.uid)]
    : gradings;

  if (sortedGradings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {student && currentUser && !currentUserGrading && (
        <Link
          to={`/students/${student.uid}/grade`}
          className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80"
        >
          <span>내 평가를 추가해서 타임라인에 남기기</span>
          <span className="inline-flex items-center gap-1 font-medium">
            <PlusCircleIcon className="size-4" />
            작성하기
          </span>
        </Link>
      )}

      {sortedGradings.map((grading) => (
        <TimelineCard
          key={grading.uid}
          grading={grading}
          isCurrentUser={currentUser?.username === grading.user?.username}
          hideAuthorName={hideAuthorName}
        />
      ))}
    </div>
  );
}
