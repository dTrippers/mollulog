import type { ComponentPropsWithoutRef } from "react";
import { cn } from "~/lib/utils";

export default function FloatingActionBar({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-floating/95 text-floating-foreground shadow-2xl shadow-black/20 ring-1 ring-black/5 backdrop-blur-xl dark:border-white/15 dark:shadow-black/60 dark:ring-white/10",
        className,
      )}
      {...props}
    />
  );
}
