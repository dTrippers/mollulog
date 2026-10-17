import { ScannerStepHeader } from "~/components/v2/features/scanner/ScannerStepHeader";
import { Skeleton } from "~/components/v2/primitives/Skeleton";

// Loading a `?job` link: the skeleton has the same structure as the step header and the list below it, so the layout does not shift.
export default function ScannerJobSkeleton() {
  return (
    <div className="flex flex-col gap-v2-block-gap" aria-busy="true">
      <p className="sr-only">인식 작업을 불러오는 중</p>
      <ScannerStepHeader states={["active", "pending", "pending", "pending"]}>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-2 w-full" />
      </ScannerStepHeader>
      <div className="flex flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
