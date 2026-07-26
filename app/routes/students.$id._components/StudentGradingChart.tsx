import { PlusCircleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { StudentGradingTimelineItem } from "~/components/features/students";
import { ProfileImage, SectionCard, TagIcon } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { STUDENT_GRADING_TAG_DISPLAY, type StudentGradingTagValue } from "~/models/student-grading-tag";

type StudentGradingChartProps = {
  student: { uid: string; name: string };
  tagCounts: Array<{ tag: StudentGradingTagValue; displayName: string; count: number }>;
  noGrading: boolean;
  signedIn: boolean;
  recentReview?: StudentGradingTimelineItem;
  currentUserReview?: StudentGradingTimelineItem;
  showRecentReview?: boolean;
  variant?: "default" | "embedded";
};

export default function StudentGradingChart({
  student,
  tagCounts,
  noGrading,
  signedIn,
  recentReview,
  currentUserReview,
  showRecentReview = true,
  variant = "default",
}: StudentGradingChartProps) {
  const maxCount = Math.max(...tagCounts.map((tagCount) => tagCount.count), 1);
  const meters = tagCounts.map(({ tag, displayName, count }) => (
    <GradingTagMeter
      key={tag}
      tag={tag}
      displayName={displayName}
      count={count}
      maxCount={maxCount}
      compact={variant === "embedded"}
    />
  ));
  const reviews = (
    <>
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
    </>
  );

  if (variant === "embedded") {
    return (
      <SectionCard className="space-y-0 p-3 md:p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)] md:gap-6">
          <div className="space-y-2">{reviews}</div>
          <div className="grid content-start gap-2.5">{meters}</div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard className="space-y-3 p-3 md:p-5">
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-x-6">{meters}</div>
      <div className="space-y-1.5">{reviews}</div>
    </SectionCard>
  );
}

type GradingTagMeterProps = {
  tag: StudentGradingTagValue;
  displayName: string;
  count: number;
  maxCount: number;
  compact?: boolean;
};

const gradingTagBarClass: Record<StudentGradingTagValue, string> = {
  performance: "bg-yellow-500 dark:bg-yellow-400",
  universal: "bg-green-600 dark:bg-green-400",
  growth: "bg-sky-600 dark:bg-sky-400",
  love: "bg-red-600 dark:bg-red-400",
};

function GradingTagMeter({ tag, displayName, count, maxCount, compact = false }: GradingTagMeterProps) {
  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <TagIcon tag={tag} size="sm" />
        <span className="min-w-0 flex-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {displayName}
        </span>
        <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
          {count}
        </span>
        <div className="relative h-1 w-12 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700 sm:w-16">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${gradingTagBarClass[tag]}`}
            style={{ width: `${(count / maxCount) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <TagIcon tag={tag} />
      <div className="flex w-36 shrink-0 items-baseline gap-1">
        <span className="whitespace-nowrap text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {displayName}
        </span>
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
  return (
    <Link
      to={to ?? `/students/${studentUid}/gradings`}
      className="group flex min-w-0 items-start gap-3 rounded-md bg-neutral-100 px-3 py-2.5 transition hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-900/50"
    >
      <ProfileImage studentUid={review.student.uid} imageSize={6} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline">
          <span className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">{reviewerName}</span>
          {review.comment ? (
            <span className="line-clamp-1 text-sm text-neutral-600 dark:text-neutral-300">
              {review.comment.trim()}
            </span>
          ) : null}
        </div>
        {review.tags && review.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {review.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <TagIcon tag={tag} size="sm" />
                <span>{STUDENT_GRADING_TAG_DISPLAY[tag]}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
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
