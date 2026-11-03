import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

// The list around student thumbnails. Every v2 student list uses it, so the spacing between students is defined here
// once. `size` follows the thumbnail: `default` for the `StudentThumb` (56px, 64px from sm), and `large` for its 70px
// (88px from md) home size. The large gaps let four students fit in one row of a 375px screen's home tile. The children
// are the `li` items.
export function StudentThumbList({
  size = "default",
  className,
  children,
}: {
  size?: "default" | "large";
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap",
        size === "large" ? "gap-x-2.5 gap-y-3 md:gap-x-3 md:gap-y-4" : "gap-x-1 gap-y-3 sm:gap-x-2",
        className,
      )}
    >
      {children}
    </ul>
  );
}
