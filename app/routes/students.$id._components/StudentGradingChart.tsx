import { PlusCircleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { StudentGradingTimelineItem } from "~/components/features/students";
import { ProfileImage, TagIcon } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { STUDENT_GRADING_TAG_DISPLAY, type StudentGradingTagValue } from "~/models/student-grading-tag";

const COMPACT_TAG_LABELS: Record<StudentGradingTagValue, string> = {
  performance: "성능",
  universal: "범용",
  growth: "저성급",
  love: "애정",
};

type StudentGradingChartProps = {
  student: { uid: string; name: string };
  tagCounts: Array<{ tag: StudentGradingTagValue; displayName: string; count: number }>;
  noGrading: boolean;
  signedIn: boolean;
  recentReview?: StudentGradingTimelineItem;
  currentUserReview?: StudentGradingTimelineItem;
  showRecentReview?: boolean;
};

export default function StudentGradingChart({
  student,
  tagCounts,
  noGrading,
  signedIn,
  recentReview,
  currentUserReview,
  showRecentReview = true,
}: StudentGradingChartProps) {
  const maxCount = Math.max(...tagCounts.map((tagCount) => tagCount.count), 1);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800/50">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6">
        {tagCounts.map(({ tag, displayName, count }) => (
          <GradingTagMeter key={tag} tag={tag} displayName={displayName} count={count} maxCount={maxCount} />
        ))}
      </div>

      <div className="mt-4 space-y-2 border-neutral-200 border-t pt-3 dark:border-neutral-700">
        {showRecentReview ? (
          <ReviewSummaryRow label="최근 평가">
            {recentReview ? (
              <ReviewSummaryLink
                studentUid={student.uid}
                review={recentReview}
                reviewerName={recentReview.user.username}
              />
            ) : (
              <ReviewEmptyText text="아무도 평가를 남기지 않았어요" />
            )}
          </ReviewSummaryRow>
        ) : null}

        <ReviewSummaryRow label="나의 평가">
          {currentUserReview ? (
            <ReviewSummaryLink
              studentUid={student.uid}
              review={currentUserReview}
              reviewerName={currentUserReview.user.username}
              to={`/students/${student.uid}/grade`}
            />
          ) : (
            <NewGrading
              title={
                signedIn
                  ? noGrading
                    ? "아무도 평가를 남기지 않았어요"
                    : "아직 평가를 작성하지 않았어요"
                  : "로그인 후 학생 평가를 공유해보세요"
              }
              message={noGrading ? "첫 번째 평가를 남겨보세요!" : "평가 작성"}
              studentUid={student.uid}
              signedIn={signedIn}
            />
          )}
        </ReviewSummaryRow>
      </div>
    </div>
  );
}

type GradingTagMeterProps = {
  tag: StudentGradingTagValue;
  displayName: string;
  count: number;
  maxCount: number;
};

function GradingTagMeter({ tag, displayName, count, maxCount }: GradingTagMeterProps) {
  return (
    <div className="flex min-w-0 items-center gap-2" aria-label={`${displayName} ${count}개`}>
      <TagIcon tag={tag} />
      <div className="flex w-18 shrink-0 items-baseline gap-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{COMPACT_TAG_LABELS[tag]}</span>
        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{count}</span>
      </div>
      <div className="relative h-2 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className="absolute top-0 left-0 h-2 rounded-full bg-neutral-700 transition-all duration-300 dark:bg-neutral-50"
          style={{ width: `${(count / maxCount) * 100}%` }}
        />
      </div>
    </div>
  );
}

type ReviewSummaryRowProps = {
  label: string;
  children: ReactNode;
};

function ReviewSummaryRow({ label, children }: ReviewSummaryRowProps) {
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[4rem_minmax(0,1fr)]">
      <div className="flex items-center text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type ReviewSummaryLinkProps = {
  studentUid: string;
  review: StudentGradingTimelineItem;
  reviewerName: string;
  to?: string;
};

function ReviewSummaryLink({ studentUid, review, reviewerName, to }: ReviewSummaryLinkProps) {
  const previewTag = review.tags?.[0];
  const extraTagCount = Math.max((review.tags?.length ?? 0) - 1, 0);

  return (
    <Link
      to={to ?? `/students/${studentUid}/gradings`}
      className="group flex min-w-0 items-center gap-3 rounded-md bg-neutral-100 px-3 py-2.5 transition hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-900/50"
    >
      <ProfileImage studentUid={review.student.uid} imageSize={6} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline">
        <span className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">{reviewerName}</span>
        {review.comment ? (
          <span className="line-clamp-1 text-sm text-neutral-600 dark:text-neutral-300">{review.comment.trim()}</span>
        ) : null}
      </div>
      {previewTag ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          <TagIcon tag={previewTag} size="sm" />
          <span className="hidden sm:inline">{STUDENT_GRADING_TAG_DISPLAY[previewTag]}</span>
          {extraTagCount > 0 ? <span>+{extraTagCount}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}

function ReviewEmptyText({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-neutral-100 px-3 py-2.5 text-sm text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
      {text}
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
    <div className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-neutral-100 px-3 py-2.5 text-neutral-500 transition hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900/50">
      <p className="min-w-0 truncate text-sm">{title}</p>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 group-hover:underline dark:text-blue-400">
        <PlusCircleIcon className="size-4" />
        {message}
      </span>
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
