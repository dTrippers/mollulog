import { cn } from "~/lib/utils";

type LoadingSkeletonProps = {
  className?: string;
  noOuterMargin?: boolean;
};

export default function LoadingSkeleton({ className, noOuterMargin = false }: LoadingSkeletonProps) {
  return (
    <div className={cn(noOuterMargin ? "my-0" : "my-12", "w-full animate-pulse", className)}>
      <div className="my-4 h-4 w-1/2 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      <div className="my-2 h-2 w-2/3 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      <div className="my-2 h-2 w-2/3 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      <div className="my-2 h-2 w-2/3 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}
