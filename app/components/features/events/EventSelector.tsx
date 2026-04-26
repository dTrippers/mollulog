import { Transition } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ShopAvailableEvent } from "~/models/event-content";
import { sanitizeClassName } from "~/prophandlers";

type EventSelectorProps = {
  events: ShopAvailableEvent[];
  currentEventUid: string;
};

export default function EventSelector({ events, currentEventUid }: EventSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentEvent = useMemo(
    () => events.find((event) => event.uid === currentEventUid) ?? events[0] ?? null,
    [currentEventUid, events],
  );

  if (!currentEvent || events.length <= 1) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="group relative w-full rounded-lg border border-neutral-200 bg-white text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <EventSelectorItem event={currentEvent} />
        <ChevronDownIcon
          className={sanitizeClassName(`
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
        className="mt-2 w-full rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 lg:absolute lg:top-full lg:left-0 lg:z-30"
      >
        <div className="max-h-72 overflow-y-auto no-scrollbar">
          {events.map((event) => (
            <Link
              to={`/events/${event.uid}/shop`}
              key={event.uid}
              onClick={() => setIsOpen(false)}
              className="block rounded-lg transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <EventSelectorItem event={event} selected={event.uid === currentEventUid} />
            </Link>
          ))}
        </div>
      </Transition>
    </div>
  );
}

function EventSelectorItem({ event, selected = false }: { event: ShopAvailableEvent; selected?: boolean }) {
  const since = dayjs(event.since);
  const until = event.until ? dayjs(event.until) : null;
  const now = dayjs();
  const status = since.isAfter(now) ? "예정" : until?.isAfter(now) ? "진행중" : "종료";

  return (
    <div
      className={sanitizeClassName(`
        flex items-center gap-3 rounded-lg px-3 py-3
        ${selected ? "bg-neutral-100 dark:bg-neutral-800" : ""}
      `)}
    >
      <div className="min-w-0 grow pr-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{event.name}</p>
          {status === "진행중" && (
            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {status}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {since.format("YYYY.MM.DD")} ~ {until ? until.format("MM.DD") : "미정"}
        </p>
      </div>
    </div>
  );
}
