import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { FeedbackTicket } from "~/models/feedback";
import { formatInstant } from "~/lib/date-time";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ContactStatus } from "./ContactStatus";

const HISTORY_SCROLL_KEY = "mollulog:contact-history-scroll";
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ContactHistoryPanel({ tickets }: { tickets: FeedbackTicket[] }) {
  const timeZone = useDisplayTimeZone();
  const historyListRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const list = historyListRef.current;
    if (!list) return;

    try {
      const savedScrollTop = Number(window.sessionStorage.getItem(HISTORY_SCROLL_KEY));
      if (Number.isFinite(savedScrollTop)) list.scrollTop = savedScrollTop;
    } catch {
      // The history still works if the browser disables session storage.
    }
  }, []);

  if (tickets.length === 0) {
    return (
      <StatusNotice tone="neutral">
        <p className="font-medium">등록된 문의가 아직 없어요.</p>
      </StatusNotice>
    );
  }

  return (
    <div
      ref={historyListRef}
      onScroll={(event) => {
        try {
          window.sessionStorage.setItem(HISTORY_SCROLL_KEY, String(event.currentTarget.scrollTop));
        } catch {
          // Scroll restoration is optional when session storage is unavailable.
        }
      }}
      className="-mx-3 max-h-[55dvh] overflow-y-auto overscroll-contain px-1"
    >
      <ul className="flex flex-col gap-v2-list-gap">
        {tickets.map((ticket) => (
          <li key={ticket.uid}>
            <Link
              to={`/contact/${ticket.uid}`}
              {...getV2LinkTransitionProps("forward")}
              className="flex min-h-v2-row-min min-w-0 items-center gap-3 rounded-md px-v2-row-x py-v2-row-y text-v2-fg hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{ticket.title}</span>
                <span className="block text-xs tabular-nums text-v2-fg-tertiary">
                  {formatInstant(ticket.createdAt, { timeZone, format: "YYYY/MM/DD" })}
                </span>
              </span>
              <ContactStatus status={ticket.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
