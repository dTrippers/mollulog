import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { RECRUIT_GOALS, type RecruitGoal, recruitGoalLabels } from "~/domain/recruit-recommendation";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";
import { StatusNotice } from "../../primitives/StatusNotice";

const goalDescriptions: Record<RecruitGoal, string> = {
  top: "루나틱 클리어와 상위 순위",
  platinum: "토먼트 클리어로 플래티넘 달성",
  newbie: "특정 목표 없이 모집 순서만 확인",
};

// A Sensei who never picked a goal picks one here instead of the timeline. The Aside's goal panel picks the same goal.
export function RecruitGoalCards({ onSelect }: { onSelect: (goal: RecruitGoal) => void }) {
  return (
    <section aria-labelledby="recruit-goal-cards-title" className="@container pt-1">
      <h2 id="recruit-goal-cards-title" className="mb-2.5 text-lg font-semibold text-v2-fg">
        목표를 골라 주세요
      </h2>
      <ul className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
        {RECRUIT_GOALS.map((goal) => (
          <li key={goal}>
            <button
              type="button"
              onClick={() => onSelect(goal)}
              className={cn(
                "relative flex w-full cursor-pointer items-center gap-3 rounded-lg bg-v2-surface px-4 py-3.5 text-left",
                "before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:content-[''] hover:before:bg-v2-hover before:v2-interaction-transition",
                v2FocusRing,
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-v2-fg">{recruitGoalLabels[goal]}</span>
                <span className="mt-0.5 block text-[0.8125rem] text-v2-fg-secondary">{goalDescriptions[goal]}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The recommendations could not be read. The page keeps its header, and the message never shows the raw error.
export function RecruitLoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex justify-center py-12">
      <div role="alert" className="w-full max-w-xl rounded-lg bg-v2-surface p-v2-block-p">
        <p className="text-base font-semibold text-v2-fg">추천 결과를 불러오지 못했어요</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    </div>
  );
}

// One line above the timeline when the viewer's own records failed. The screen still works without them.
export function RecruitViewerNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StatusNotice
      tone="warning"
      boxed
      className="mb-3 items-center"
      action={
        <Button size="sm" onClick={onRetry}>
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      }
    >
      {message}
    </StatusNotice>
  );
}

export function RecruitAllRecruited() {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-v2-surface p-v2-block-p">
      <CheckCircleIcon className="size-5 shrink-0 text-v2-success" aria-hidden="true" />
      <p className="text-base font-semibold text-v2-fg">추천 학생을 모두 모집했어요</p>
    </div>
  );
}

export function RecruitNoPickups() {
  return (
    <div className="rounded-lg bg-v2-surface p-v2-block-p">
      <p className="text-base font-semibold text-v2-fg">다가오는 픽업이 없어요</p>
    </div>
  );
}

const skeletonContents = [
  { key: "first", tiles: ["a", "b"] },
  { key: "second", tiles: ["a"] },
];

// The timeline's shape while the recommendations load: content headers and tiles in their final sizes, so nothing moves
// when the values arrive.
export function RecruitTimelineSkeleton() {
  return (
    <div role="status" aria-busy="true" className="@container">
      <span className="sr-only">추천 결과를 불러오는 중</span>
      {skeletonContents.map((content) => (
        <div
          key={content.key}
          aria-hidden="true"
          className="mb-5 grid grid-cols-[minmax(0,1fr)] @md:grid-cols-[2.5rem_minmax(0,1fr)] @md:gap-x-3"
        >
          <Skeleton className="hidden size-10 rounded-md @md:block" />
          <div className="min-w-0">
            <Skeleton className="mt-1 h-3.5 w-24" />
            <Skeleton className="mt-3 h-5 w-48" />
            <Skeleton className="mt-1.5 h-3.5 w-40" />
            <div className="mt-3 flex flex-col gap-2">
              {content.tiles.map((tile) => (
                <div key={tile} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg bg-v2-surface p-3">
                  <div className="w-14 sm:w-16">
                    <Skeleton className="aspect-[5/6] w-full" />
                    <Skeleton className="mx-auto mt-1 h-3 w-10" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-6 w-14" />
                      <Skeleton className="h-7 w-14" />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      <Skeleton className="h-9" />
                      <Skeleton className="h-9" />
                      <Skeleton className="h-9" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
