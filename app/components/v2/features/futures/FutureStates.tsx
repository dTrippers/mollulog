import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { Button } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";

// Full loading skeleton for client navigation. It follows the timeline feed: a date divider with a hairline, items joined by
// the same-date connector, student rows on some items only, and an opinion row with the real row's width limit.
const skeletonGroups = [
  {
    key: "first",
    rows: [
      { key: "students", withStudents: true, connectsNext: true },
      { key: "plain", withStudents: false, connectsNext: false },
    ],
  },
  {
    key: "second",
    rows: [{ key: "plain", withStudents: false, connectsNext: false }],
  },
];

export function FutureSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-1">
      <span className="sr-only">미래시를 불러오는 중</span>
      {skeletonGroups.map((group) => (
        <section key={group.key} aria-hidden="true">
          <div className="flex items-center gap-3 py-2">
            <Skeleton className="h-3.5 w-24" />
            <span className="h-px flex-1 bg-v2-inset" />
          </div>
          {group.rows.map((row) => (
            <SkeletonItem key={row.key} withStudents={row.withStudents} connectsNext={row.connectsNext} />
          ))}
        </section>
      ))}
    </div>
  );
}

const skeletonStudentKeys = ["a", "b", "c", "d"];

function SkeletonItem({ withStudents, connectsNext }: { withStudents: boolean; connectsNext: boolean }) {
  return (
    <article className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 pb-5 md:grid-cols-[2.75rem_minmax(0,1fr)] md:gap-x-4">
      {connectsNext ? (
        <span
          aria-hidden="true"
          className="absolute top-12 -bottom-5 left-5 w-px bg-v2-control-border md:left-[1.375rem]"
        />
      ) : null}
      <Skeleton className="relative z-10 size-10 md:size-11" />
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-3.5 w-2/5" />
        {withStudents ? (
          <div className="flex gap-3">
            {skeletonStudentKeys.map((studentKey) => (
              <div key={studentKey} className="w-[3.75rem] space-y-1">
                <Skeleton className="aspect-[5/6] w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : null}
        <Skeleton className="min-h-v2-row-min w-full max-w-[40rem]" />
      </div>
    </article>
  );
}

// Filter empty result. Names the active filters, and offers the reset action only when a filter is applied.
export function FilterEmptyState({
  selectedLabels,
  filterActive,
  onReset,
}: {
  selectedLabels: string[];
  filterActive: boolean;
  onReset: () => void;
}) {
  return (
    <div className="pt-32">
      <div className="w-full rounded-lg bg-v2-surface p-v2-block-p">
        <p className="text-base font-semibold text-v2-fg">필터 조건에 해당하는 컨텐츠가 없어요</p>
        {filterActive && selectedLabels.length > 0 ? (
          <p className="mt-1 text-sm text-v2-fg-secondary">선택한 필터: {selectedLabels.join(", ")}</p>
        ) : null}
        {filterActive ? (
          <Button variant="danger" className="mt-3" onClick={onReset}>
            필터 초기화
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// The viewer's own state (favorites, recruitment results) failed to load. Counts still render, and the own-state icons
// stay neutral until a retry succeeds.
export function ViewerFailureNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-v2-surface px-v2-block-p py-3"
    >
      <p className="text-sm text-v2-fg">관심 학생과 모집 기록을 불러오지 못했어요</p>
      <Button variant="text" className="h-8 px-2 text-sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

// Content loading failure. The header stays on the page, and the message never shows the raw error.
export function LoadFailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex justify-center py-16">
      <div role="alert" className="w-full max-w-xl rounded-lg bg-v2-surface p-v2-block-p">
        <p className="text-base font-semibold text-v2-fg">미래시를 불러오지 못했어요</p>
        <p className="mt-1 text-sm text-v2-fg-secondary">일시적인 문제일 수 있어요. 잠시 후 다시 시도해 주세요.</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    </div>
  );
}
