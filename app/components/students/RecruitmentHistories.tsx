import dayjs from "dayjs";
import { Link } from "react-router";
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState, useCallback } from "react";
import { sanitizeClassName } from "~/prophandlers";

type RecruitmentHistoriesProps = {
  recruitments: {
    uid: string;
    name: string;
    imageUrl: string | null;
    since: Date;
  }[];
}

export default function RecruitmentHistories({ recruitments }: RecruitmentHistoriesProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLeftBlur, setShowLeftBlur] = useState(false);
  const [showRightBlur, setShowRightBlur] = useState(false);

  const sortedRecruitments = recruitments.sort((a, b) => dayjs(b.since).diff(dayjs(a.since)));

  const updateBlur = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    setShowLeftBlur(container.scrollLeft > 0);
    setShowRightBlur(container.scrollLeft + container.offsetWidth < container.scrollWidth - 1);
  }, []);

  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current) {
      return;
    }
  
    const container = scrollContainerRef.current;
    const items = container.children;
    if (items.length === 0) {
      return;
    }

    const targetItem = items[index] as HTMLElement;
    const containerWidth = container.offsetWidth;
    const itemWidth = targetItem.offsetWidth;

    const scrollLeft = targetItem.offsetLeft - (containerWidth - itemWidth) / 2;
    container.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior: "smooth",
    });
  };

  const selectPickup = (indexDiff: 1 | -1) => {
    const newIndex = (currentIndex + indexDiff + sortedRecruitments.length) % sortedRecruitments.length;
    setCurrentIndex(newIndex);
    scrollToIndex(newIndex);
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollToIndex(currentIndex);
    }
  }, [currentIndex]);

  useEffect(() => {
    updateBlur();
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.addEventListener("scroll", updateBlur);
    window.addEventListener("resize", updateBlur);
    return () => {
      container.removeEventListener("scroll", updateBlur);
      window.removeEventListener("resize", updateBlur);
    };
  }, [updateBlur]);

  return (
    <div className="relative md:flex md:items-center md:justify-center">
      {/* Left Arrow (desktop only) */}
      {sortedRecruitments.length > 2 && (
        <div className="hidden md:flex pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-10 w-10 items-center justify-center">
          <ChevronDoubleLeftIcon
            className="pointer-events-auto p-1 size-6 hover:bg-black hover:text-white rounded-full transition cursor-pointer"
            strokeWidth={2}
            onClick={() => selectPickup(-1)}
          />
        </div>
      )}

      {/* Blur overlays */}
      {showLeftBlur && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 md:w-12 z-10 bg-gradient-to-r from-white dark:from-neutral-800 to-transparent" />
      )}
      {showRightBlur && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 md:w-12 z-10 bg-gradient-to-l from-white dark:from-neutral-800 to-transparent" />
      )}

      {/* Scrollable container */}
      <div className="flex overflow-x-auto gap-2 md:gap-4 no-scrollbar w-full" ref={scrollContainerRef}>
        {sortedRecruitments.map((event) => (
          <div key={event.uid} className="w-3/4 md:w-2/5 aspect-video rounded-lg relative shrink-0">
            {event.imageUrl && (
              <img
                src={event.imageUrl}
                alt={event.name}
                className="absolute w-full h-full object-cover rounded-lg"
              />
            )}
            <Link
              to={`/events/${event.uid}`}
              className={sanitizeClassName(`
                  absolute w-full h-full flex flex-col justify-end p-4 rounded-lg transition
                  ${event.imageUrl ? "bg-black/65 hover:bg-black/80 text-white" : "bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-700"}
                `)}
            >
              <p className="font-bold text-semibold">{event.name}</p>
              <p className="text-xs mt-1">
                {dayjs(event.since).format("YYYY-MM-DD")}
              </p>
            </Link>
          </div>
        ))}
      </div>

      {/* Right Arrow (desktop only) */}
      {sortedRecruitments.length > 2 && (
        <div className="hidden md:flex pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-full z-10 w-10 items-center justify-center">
          <ChevronDoubleRightIcon
            className="pointer-events-auto p-1 size-6 hover:bg-black hover:text-white rounded-full transition cursor-pointer"
            strokeWidth={2}
            onClick={() => selectPickup(1)}
          />
        </div>
      )}
    </div>
  );
}
