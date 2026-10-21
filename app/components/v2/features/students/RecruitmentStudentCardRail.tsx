import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

export function RecruitmentStudentCardRail({
  children,
  fadeFrom = "canvas",
  className,
  listClassName,
}: {
  children: ReactNode;
  fadeFrom?: "canvas" | "surface";
  className?: string;
  listClassName?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const fadeColor = fadeFrom === "surface" ? "from-v2-surface" : "from-v2-canvas";

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const updateEdges = () => {
      const { scrollLeft, scrollWidth, clientWidth } = list;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    };
    updateEdges();
    list.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      list.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  });

  return (
    <div className={cn("relative min-w-0", className)}>
      {canScrollLeft ? (
        <div
          aria-hidden="true"
          data-edge="left"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-linear-to-r to-transparent md:hidden",
            fadeColor,
          )}
        />
      ) : null}
      <ul
        ref={listRef}
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-wrap md:gap-3 md:overflow-visible md:pb-0",
          listClassName,
        )}
      >
        {children}
      </ul>
      {canScrollRight ? (
        <div
          aria-hidden="true"
          data-edge="right"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-linear-to-l to-transparent md:hidden",
            fadeColor,
          )}
        />
      ) : null}
    </div>
  );
}
