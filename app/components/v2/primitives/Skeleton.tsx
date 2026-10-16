import { cn } from "~/lib/utils";

// Placeholder block for loading states. Static on purpose: loading is not motion.
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-md bg-v2-inset", className)} />;
}
