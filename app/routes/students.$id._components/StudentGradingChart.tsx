import { PlusCircleIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import type { StudentGradingTimelineItem } from "~/components/features/students";
import { ProfileImage, TagIcon } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { STUDENT_GRADING_TAG_DISPLAY, type StudentGradingTagValue } from "~/models/student-grading-tag";

type StudentGradingChartProps = {
  student: { uid: string; name: string };
  tagCounts: Array<{ tag: StudentGradingTagValue; displayName: string; count: number }>;
  noGrading: boolean;
  signedIn: boolean;
  recentReview?: StudentGradingTimelineItem;
  recentReviewIsCurrentUser?: boolean;
  hasCurrentUserGrading: boolean;
  totalReviewCount?: number;
};

export default function StudentGradingChart({
  student,
  tagCounts,
  noGrading,
  signedIn,
  recentReview,
  recentReviewIsCurrentUser = false,
  hasCurrentUserGrading,
  totalReviewCount,
}: StudentGradingChartProps) {
  const maxCount = Math.max(...tagCounts.map((tagCount) => tagCount.count), 1);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800/50">
      <div className="space-y-3">
        {tagCounts.map(({ tag, displayName, count }) => (
          <div key={tag} className="flex items-center gap-2">
            <div className="flex-shrink-0">
              <TagIcon tag={tag} />
            </div>
            <div className="flex-shrink-0 w-32">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{displayName}</span>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 relative">
                <div
                  className="bg-neutral-700 dark:bg-neutral-50 h-2 rounded-full transition-all duration-300 absolute left-0 top-0 min-w-0"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="ml-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 min-w-0 flex-shrink-0">
                {count}
              </span>
            </div>
          </div>
        ))}

        {recentReview && totalReviewCount ? (
          <>
            <p className="mt-6 font-bold">최근에 작성된 평가</p>
            <Link to={`/students/${student.uid}/gradings`} className="group block">
              <div className="mt-2 rounded-lg bg-neutral-100 p-4 transition hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800">
                <div className="flex items-center gap-3">
                  <ProfileImage studentUid={recentReview.student.uid} imageSize={6} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      {recentReviewIsCurrentUser ? "나의 평가" : recentReview.user.username}
                    </p>
                    {recentReview.comment && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">
                        {recentReview.comment.trim()}
                      </p>
                    )}
                  </div>
                </div>
                {recentReview.tags && recentReview.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recentReview.tags.map((tag) => (
                      <div
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                      >
                        <TagIcon tag={tag} size="sm" />
                        <span>{STUDENT_GRADING_TAG_DISPLAY[tag]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          </>
        ) : null}

        {(noGrading || !hasCurrentUserGrading) && (
          <NewGrading
            title={noGrading ? "아무도 평가를 남기지 않았어요" : "아직 평가를 작성하지 않았어요"}
            message={noGrading ? "첫 번째 평가를 남겨보세요!" : "다른 선생님들에게 정보를 공유해주세요!"}
            studentUid={student.uid}
            signedIn={signedIn}
          />
        )}
      </div>
    </div>
  );
}

type NewGradingProps = {
  title: string;
  message: string;
  studentUid: string;
  signedIn: boolean;
};

function NewGrading({ title, message, studentUid, signedIn }: NewGradingProps) {
  const { showSignIn } = useSignIn();
  const inner = (
    <div className="p-4 text-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 bg-neutral-100 dark:bg-neutral-900 transition rounded-lg cursor-pointer">
      <p className="text-sm">{title}</p>
      <p className="text-xs mt-1 text-blue-600 dark:text-blue-400 group-hover:underline">{message}</p>
    </div>
  );

  if (signedIn) {
    return (
      <Link to={`/students/${studentUid}/grade`} className="group">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className="w-full text-left" onClick={() => showSignIn()}>
      {inner}
    </button>
  );
}
