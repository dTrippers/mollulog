import { ArrowPathIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";
import { StatusNotice } from "../../primitives/StatusNotice";

export type StudentStatisticsStateKind = "loading" | "empty" | "failed";

const legendSkeletonKeys = ["legend-1", "legend-2", "legend-3", "legend-4", "legend-5", "legend-6", "legend-7"];
const rowSkeletonKeys = {
  3: ["summary-1", "summary-2", "summary-3"],
  6: ["summary-1", "summary-2", "summary-3", "summary-4", "summary-5", "summary-6"],
} as const;

export function StudentStatisticsState({ state, onRetry }: { state: StudentStatisticsStateKind; onRetry: () => void }) {
  if (state === "loading") {
    return (
      <div aria-busy="true">
        <span role="status" className="sr-only">불러오는 중</span>
        <section>
          <div className="mb-2 flex min-h-7 items-center"><Skeleton className="h-4 w-28" /></div>
          <div className="rounded-lg bg-v2-surface p-v2-block-p">
            <div className="mb-[10px] flex justify-end gap-2">
              <Skeleton className="h-8 w-36" />
            </div>
            <Skeleton className="h-52 w-full" />
            <div className="mt-[10px] flex flex-nowrap gap-x-3 gap-y-1">
              {legendSkeletonKeys.map((key) => <Skeleton key={key} className="h-3 w-11" />)}
            </div>
          </div>
        </section>
        <div className="mt-6 grid gap-6 md:grid-cols-2 md:gap-x-4">
          {[3, 6].map((rowCount) => (
            <section key={rowCount} className="flex min-w-0 flex-col">
              <div className="mb-2 flex min-h-7 items-center"><Skeleton className="h-4 w-28" /></div>
              <div className="grid flex-1 gap-3 rounded-lg bg-v2-surface p-v2-block-p">
                {rowSkeletonKeys[rowCount as 3 | 6].map((key) => (
                  <div key={`${rowCount}-${key}`} className="grid grid-cols-[5rem_minmax(0,1fr)_6rem] items-center gap-2.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }
  if (state === "empty") {
    return <p className="rounded-lg bg-v2-surface p-v2-block-p text-sm leading-[1.43] text-v2-fg-secondary">편성된 총력전/대결전 정보가 없어요</p>;
  }
  return (
    <div className="rounded-lg bg-v2-surface p-v2-block-p">
      <StatusNotice className="[&>svg]:hidden" tone="danger" action={<Button className="-my-1" variant="text" size="sm" onClick={onRetry}><ArrowPathIcon className="size-3.5" aria-hidden="true" />다시 시도</Button>}>
        <span className="relative block pl-6 leading-[1.43]">
          <XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />
          통계를 불러오지 못했어요
        </span>
      </StatusNotice>
    </div>
  );
}
