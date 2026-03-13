import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowRightIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { timelineContentTypeLocale } from "~/locales/ko";
import { CONTENT_ORDER, SHOW_LINK_CONTENT_TYPES } from "~/models/content";
import type { TimelineContentType } from "~/models/timeline-content";

type EventListItem = {
  uid: string;
  name: string;
  type: TimelineContentType;
  since: Date;
  until: Date;
  imageUrl?: string | null;
};

type EventListProps = {
  events: EventListItem[];
  showArrow?: boolean | ((event: EventListItem) => boolean);
  className?: string;
};

export default function EventList({ events, showArrow = true, className = "" }: EventListProps) {
  if (events.length === 0) {
    return null;
  }

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => CONTENT_ORDER.indexOf(a.type) - CONTENT_ORDER.indexOf(b.type));
  }, [events]);

  const shouldShowArrow = (event: EventListItem) => {
    if (typeof showArrow === "function") {
      return showArrow(event);
    }
    if (showArrow === false) {
      return false;
    }
    return SHOW_LINK_CONTENT_TYPES.includes(event.type);
  };

  const getEventPath = (event: EventListItem) => `/events/${event.uid}`;

  return (
    <div className={`border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden ${className}`}>
      {sortedEvents.map((event) => (
        <Link to={getEventPath(event)} key={event.uid} className="block group">
          <div className="p-3 flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors">
            <div className={`flex-1 ${event.imageUrl ? "min-w-0" : ""}`}>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">{timelineContentTypeLocale[event.type]}</p>
              <p className={`font-semibold text-neutral-900 dark:text-neutral-100 ${event.imageUrl ? "truncate" : ""}`}>
                {event.name}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {dayjs(event.since).format("YYYY-MM-DD")} ~ {dayjs(event.until).format("YYYY-MM-DD")}
              </p>
            </div>
            {event.imageUrl && (
              <img
                src={event.imageUrl}
                alt={event.name}
                className="h-12 md:h-16 aspect-4/3 object-cover rounded-lg flex-shrink-0"
              />
            )}
            {shouldShowArrow(event) && (
              <ArrowRightIcon
                className="size-4 text-neutral-500 dark:text-neutral-400 group-hover:translate-x-1 transition-transform duration-200 flex-shrink-0"
                strokeWidth={2}
              />
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
