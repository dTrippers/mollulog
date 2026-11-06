import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import type { ReactNode } from "react";
import { useSignIn } from "~/contexts/SignInProvider";
import { GradingTagIcon } from "~/components/v2/features/students/GradingTagIcon";
import type { StudentGradingTimelineItem } from "~/components/v2/features/students/StudentGradingTimeline";
import { ProgressBar } from "~/components/v2/primitives/ProgressBar";
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
  const maxCount = Math.max(...tagCounts.map(({ count }) => count), 1);
  const meters = (
    <div className={variant === "embedded" ? "space-y-2" : "grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-6"}>
      {tagCounts.map(({ tag, displayName, count }) => (
        <div key={tag} className="grid min-w-0 grid-cols-[8.75rem_minmax(3rem,1fr)_1.75rem] items-center gap-2 text-xs leading-[1.43]">
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-v2-fg-secondary">
            <GradingTagIcon tag={tag} size="sm" />
            <span>{displayName}</span>
          </span>
          <ProgressBar value={count} max={maxCount} label={`${displayName} ${count}`} className="[&::-webkit-progress-value]:bg-v2-fg-secondary [&::-moz-progress-bar]:bg-v2-fg-secondary" />
          <span className="text-right tabular-nums text-v2-fg">{count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
  const myReview = currentUserReview ? (
    <ReviewSummary review={currentUserReview} reviewerName="" to={`/students/${student.uid}/grade`} />
  ) : (
    <NewGrading
      title={signedIn ? (noGrading ? "아무도 평가를 남기지 않았어요" : "아직 평가를 작성하지 않았어요") : "로그인 후 학생 평가를 공유해보세요"}
      message={noGrading ? "첫 번째 평가를 남겨보세요!" : "평가 작성"}
      studentUid={student.uid}
      signedIn={signedIn}
    />
  );

  return (
    <div className="rounded-lg bg-v2-surface p-v2-block-p">
      {variant === "embedded" ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-6">
          <div>
            {showRecentReview && (recentReview || !noGrading) ? (
              <ReviewSummaryRow label="최근 평가">
                {recentReview ? <ReviewSummary review={recentReview} reviewerName={`@${recentReview.user.username}`} /> : null}
              </ReviewSummaryRow>
            ) : null}
            <ReviewSummaryRow label="나의 평가">{myReview}</ReviewSummaryRow>
          </div>
          {meters}
        </div>
      ) : (
        <div className="space-y-3">
          {meters}
          <ReviewSummaryRow label="나의 평가" className="border-t border-v2-divider pt-2">{myReview}</ReviewSummaryRow>
        </div>
      )}
    </div>
  );
}

function ReviewSummaryRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-9 items-center gap-3 ${className ?? ""}`}>
      <span className="w-14 shrink-0 text-xs leading-[1.43] text-v2-fg-tertiary">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ReviewSummary({
  review,
  reviewerName,
  to,
}: {
  review: StudentGradingTimelineItem;
  reviewerName: string;
  to?: string;
}) {
  const content = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-[1.43]">
      {reviewerName ? <span className="truncate font-medium text-v2-fg">{reviewerName}</span> : null}
      {review.comment ? <span className="line-clamp-1 text-v2-fg-secondary">{review.comment.trim()}</span> : null}
      {review.tags && review.tags.length > 0 ? (
        <span className="flex flex-wrap gap-x-2 gap-y-1 text-xs leading-[1.43] text-v2-fg-secondary">
          {review.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1">
              <GradingTagIcon tag={tag} size="xs" />
              {STUDENT_GRADING_TAG_DISPLAY[tag]}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
  const isEmptyReview = !reviewerName && !review.comment?.trim() && !(review.tags?.length);
  return to ? <Link to={to} aria-label={isEmptyReview ? "내 평가 수정" : undefined} className="rounded-md hover:bg-v2-hover">{content}</Link> : content;
}

function NewGrading({ title, message, studentUid, signedIn }: { title: string; message: string; studentUid: string; signedIn: boolean }) {
  const { showSignIn } = useSignIn();
  const content = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-[10px] gap-y-1 text-sm leading-[1.43] text-v2-fg-secondary">
      <span className="min-w-0 break-keep">{title}</span>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 break-keep font-medium text-v2-fg">
        {message}<ArrowRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
      </span>
    </span>
  );
  return signedIn ? <Link to={`/students/${studentUid}/grade`} className="block min-w-0">{content}</Link> : <button type="button" className="block w-full min-w-0 text-left" onClick={() => showSignIn()}>{content}</button>;
}
