import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { Children, useEffect, useEffectEvent, useRef, useState } from "react";

type HorizontalScrollProps = {
  children: React.ReactNode;
  itemWidth?: {
    mobile: string;
    desktop: string;
  };
  gap?: string;
  showArrowsOnMobile?: boolean;
  className?: string;
};

function HorizontalScroll({
  children,
  itemWidth = { mobile: "w-2/3", desktop: "md:w-2/5" },
  gap = "gap-4",
  showArrowsOnMobile = false,
  className = "",
}: HorizontalScrollProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const checkScrollButtons = useEffectEvent(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  });

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener("scroll", checkScrollButtons);
    window.addEventListener("resize", checkScrollButtons);
    return () => {
      container.removeEventListener("scroll", checkScrollButtons);
      window.removeEventListener("resize", checkScrollButtons);
    };
  });

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollAmount = container.clientWidth * 0.8;
      container.scrollBy({
        left: -scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollAmount = container.clientWidth * 0.8;
      container.scrollBy({
        left: scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Left scroll button - desktop only (or mobile if showArrowsOnMobile is true) */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={scrollLeft}
          className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-neutral-800 shadow-lg rounded-full p-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors ${
            showArrowsOnMobile ? "" : "hidden md:block"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeftIcon className="size-5 text-neutral-600 dark:text-neutral-400" />
        </button>
      )}

      {/* Right scroll button - desktop only (or mobile if showArrowsOnMobile is true) */}
      {canScrollRight && (
        <button
          type="button"
          onClick={scrollRight}
          className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-neutral-800 shadow-lg rounded-full p-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors ${
            showArrowsOnMobile ? "" : "hidden md:block"
          }`}
          aria-label="Scroll right"
        >
          <ChevronRightIcon className="size-5 text-neutral-600 dark:text-neutral-400" />
        </button>
      )}

      {/* Scrollable container */}
      <div
        ref={scrollContainerRef}
        className={`flex overflow-x-auto no-scrollbar ${gap}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {Children.toArray(children).map((child) => {
          if (child == null) {
            return null;
          }
          return (
            <div key={typeof child === "object" && "key" in child && child.key != null ? child.key : `scroll-item-${String(child)}`} className={`shrink-0 ${itemWidth.mobile} ${itemWidth.desktop}`}>
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HorizontalScroll;
export { HorizontalScroll };
