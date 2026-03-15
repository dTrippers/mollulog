export default function LoadingSkeleton() {
  return (
    <div className="my-12 w-full animate-pulse">
      <div className="my-4 h-4 w-1/2 bg-neutral-200 dark:bg-neutral-700 rounded-lg" />
      <div className="my-2 h-2 w-2/3 bg-neutral-200 dark:bg-neutral-700 rounded-lg" />
      <div className="my-2 h-2 w-2/3 bg-neutral-200 dark:bg-neutral-700 rounded-lg" />
      <div className="my-2 h-2 w-2/3 bg-neutral-200 dark:bg-neutral-700 rounded-lg" />
    </div>
  );
}
