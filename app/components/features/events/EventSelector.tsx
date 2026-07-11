import { Transition } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { StudentCards } from "~/components/features/students";
import { Field } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import { cn } from "~/lib/utils";
import type { ShopAvailableEvent } from "~/models/event-content";

const SPOILER_EVENT_NAVIGATION_MESSAGE = "스포일러가 포함된 이벤트에요. 이동할까요?";

export type SelectableEvent = ShopAvailableEvent & {
  recruitments?: {
    student: {
      uid: string;
      name?: string | null;
    } | null;
    pickup: boolean;
  }[];
};

type EventSelectorProps = {
  events: SelectableEvent[];
  currentEventUid?: string | null;
  maxVisibleEvents?: number;
  label?: string;
  description?: string;
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  getEventHref?: (event: SelectableEvent) => string;
  onSelect?: (eventUid: string) => void;
  triggerClassName?: string;
};

export default function EventSelector({
  events,
  currentEventUid,
  maxVisibleEvents,
  label,
  description,
  name,
  placeholder,
  searchPlaceholder,
  getEventHref = (event) => `/events/${event.uid}/shop`,
  onSelect,
  triggerClassName,
}: EventSelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedEventUid, setSelectedEventUid] = useState(currentEventUid ?? null);
  const [revealedSpoilerContentUids, setRevealedSpoilerContentUids] = useState<string[]>([]);
  const currentEvent = useMemo(
    () => events.find((event) => event.uid === selectedEventUid) ?? null,
    [selectedEventUid, events],
  );
  const filteredEvents = useMemo(
    () => filterSelectableEvents(events, debouncedSearchQuery, maxVisibleEvents, revealedSpoilerContentUids),
    [debouncedSearchQuery, events, maxVisibleEvents, revealedSpoilerContentUids],
  );
  const closeOptions = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
  }, []);

  useEffect(() => {
    setSelectedEventUid(currentEventUid ?? null);
  }, [currentEventUid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeOptions();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOptions();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOptions, isOpen]);

  useEffect(() => {
    setRevealedSpoilerContentUids(parseRevealedSpoilerContentUids(localStorage.getItem(futuresRevealedSpoilerKey)));
  }, []);

  if (events.length === 0) {
    return null;
  }

  const handleSelect = (eventUid: string) => {
    setSelectedEventUid(eventUid);
    closeOptions();
    onSelect?.(eventUid);
  };

  const handleLinkClick = (event: SelectableEvent, clickEvent: ReactMouseEvent<HTMLAnchorElement>) => {
    if (shouldConfirmSelectableEventNavigation(event) && !window.confirm(SPOILER_EVENT_NAVIGATION_MESSAGE)) {
      clickEvent.preventDefault();
      return;
    }

    closeOptions();
  };

  const selector = (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          "group relative w-full cursor-pointer rounded-md border border-input bg-background text-left transition-colors hover:bg-muted/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
          triggerClassName,
        )}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {currentEvent ? (
          <EventSelectorItem
            event={currentEvent}
            placeholder={placeholder}
            revealedSpoilerContentUids={revealedSpoilerContentUids}
          />
        ) : (
          <div className="rounded-lg px-3 py-3">
            <p className="text-sm text-muted-foreground">{placeholder ?? "이벤트 선택"}</p>
          </div>
        )}
        <ChevronDownIcon
          className={cn(`
            absolute top-1/2 right-3 size-5 -translate-y-1/2 flex-shrink-0 text-neutral-500 transition-transform
            ${isOpen ? "rotate-180" : ""}
          `)}
        />
      </button>

      <Transition
        show={isOpen}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="mt-2 w-full rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg shadow-foreground/10 lg:absolute lg:top-full lg:left-0 lg:z-30"
      >
        <div className="sticky top-0 z-10 mb-1 rounded-md border border-input bg-background p-1">
          <input
            type="text"
            className="min-h-10 w-full rounded-sm bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            placeholder={searchPlaceholder ?? "이벤트 이름으로 찾기"}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
        <div className="max-h-72 overflow-y-auto no-scrollbar">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event, index) =>
              onSelect ? (
                <button
                  type="button"
                  key={event.uid}
                  onClick={() => handleSelect(event.uid)}
                  className={cn(`
                    block w-full cursor-pointer text-left transition-colors hover:bg-muted/70 dark:hover:bg-neutral-700/70
                    ${index > 0 ? "border-border/70 border-t" : ""}
                  `)}
                >
                  <EventSelectorItem event={event} revealedSpoilerContentUids={revealedSpoilerContentUids} />
                </button>
              ) : (
                <Link
                  to={getEventHref(event)}
                  key={event.uid}
                  onClick={(clickEvent) => handleLinkClick(event, clickEvent)}
                  className={cn(`
                    block cursor-pointer transition-colors hover:bg-muted/70 dark:hover:bg-neutral-700/70
                    ${index > 0 ? "border-border/70 border-t" : ""}
                  `)}
                >
                  <EventSelectorItem event={event} revealedSpoilerContentUids={revealedSpoilerContentUids} />
                </Link>
              ),
            )
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">검색 결과가 없어요</div>
          )}
        </div>
      </Transition>
      {name && <input type="hidden" name={name} value={selectedEventUid ?? ""} />}
    </div>
  );

  if (!label) {
    return selector;
  }

  return (
    <Field label={label} description={description} containerClassName="mt-0 mb-0">
      {selector}
    </Field>
  );
}

export function PanelEventSelector(props: Omit<EventSelectorProps, "triggerClassName">) {
  return <EventSelector {...props} triggerClassName="border-border bg-background shadow-none hover:bg-muted/70" />;
}

export function filterSelectableEvents(
  events: SelectableEvent[],
  searchQuery: string,
  maxVisibleEvents?: number,
  revealedSpoilerContentUids: string[] = [],
): SelectableEvent[] {
  const filteredEvents = events.filter((event) => {
    const eventName = getSelectableEventName(event, revealedSpoilerContentUids);
    const pickupStudentNames = event.recruitments
      ?.filter(() => !isSelectableEventSpoilerHidden(event, revealedSpoilerContentUids))
      ?.filter(({ pickup }) => pickup)
      .map(({ student }) => student?.name)
      .filter(Boolean)
      .join(" ");
    return hangul.search(`${eventName} ${pickupStudentNames ?? ""}`, searchQuery) >= 0;
  });

  return maxVisibleEvents === undefined ? filteredEvents : filteredEvents.slice(0, maxVisibleEvents);
}

export function shouldConfirmSelectableEventNavigation(event: SelectableEvent): boolean {
  return event.isSpoiler;
}

function isSelectableEventSpoilerHidden(event: SelectableEvent, revealedSpoilerContentUids: string[]): boolean {
  return event.isSpoiler && !revealedSpoilerContentUids.includes(event.uid);
}

function getSelectableEventName(event: SelectableEvent, revealedSpoilerContentUids: string[]): string {
  if (isSelectableEventSpoilerHidden(event, revealedSpoilerContentUids)) {
    return "???";
  }

  return !event.name || event.name === event.uid ? "픽업 모집" : event.name;
}

function EventSelectorItem({
  event,
  placeholder,
  revealedSpoilerContentUids,
}: {
  event: SelectableEvent;
  placeholder?: string;
  revealedSpoilerContentUids: string[];
}) {
  const displayTimeZone = useDisplayTimeZone();
  const now = nowUtcIso();
  const spoilerHidden = isSelectableEventSpoilerHidden(event, revealedSpoilerContentUids);
  const status = isInstantAfter(event.since, now)
    ? "예정"
    : event.until && isInstantAfter(event.until, now)
      ? "진행중"
      : "종료";
  const pickupStudents = spoilerHidden
    ? undefined
    : event.recruitments
        ?.filter(({ pickup, student }) => pickup && student)
        .map(({ student }) => ({ uid: student?.uid ?? null, name: student?.name, hideName: true }));
  const eventName = getSelectableEventName(event, revealedSpoilerContentUids);

  return (
    <div className="px-3 py-3">
      <div className="min-w-0 grow pr-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{eventName || placeholder}</p>
          {status === "진행중" && (
            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {status}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {formatInstant(event.since, { timeZone: displayTimeZone, format: "YYYY.MM.DD" })} ~{" "}
          {event.until ? formatInstant(event.until, { timeZone: displayTimeZone, format: "MM.DD" }) : "미정"}
        </p>
        {pickupStudents && pickupStudents.length > 0 && (
          <div className="mt-1.5 w-full">
            <StudentCards students={pickupStudents.slice(0, 8)} layout="wrap" cardSize="xs" gap="tight" />
          </div>
        )}
      </div>
    </div>
  );
}
