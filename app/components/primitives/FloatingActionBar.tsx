import type { ComponentPropsWithoutRef } from "react";
import { cn } from "~/lib/utils";

export default function FloatingActionBar({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "floating-surface rounded-lg border border-border bg-floating/95 text-floating-foreground shadow-lg shadow-black/10 backdrop-blur-xl dark:shadow-2xl dark:shadow-black/50 dark:ring-1 dark:ring-white/10",
        className,
      )}
      {...props}
    />
  );
}
