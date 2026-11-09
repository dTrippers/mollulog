import { ChevronDownIcon, ListBulletIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Popover } from "~/components/v2/primitives/Popover";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import { cn } from "~/lib/utils";
import type { ShopAvailableEvent } from "~/models/event-content";
import { Pill } from "./shop-ui";

type EventStatus = "upcoming" | "ongoing" | "ended";

const STATUS_LABEL: Record<EventStatus, string> = { upcoming: "예정", ongoing: "진행 중", ended: "종료" };
const STATUS_TONE = { upcoming: "accent", ongoing: "success", ended: "neutral" } as const;

function eventStatus(event: ShopAvailableEvent, now: string): EventStatus {
  if (isInstantAfter(event.since, now)) return "upcoming";
  return event.until && isInstantAfter(event.until, now) ? "ongoing" : "ended";
}

export function matchesShopEventSearch(event: ShopAvailableEvent, query: string, revealedSpoilers: string[]) {
  const hidden = event.isSpoiler && !revealedSpoilers.includes(event.uid);
  const pickupNames = hidden
    ? ""
    : (event.recruitments
        ?.filter(({ pickup }) => pickup)
        .map(({ student }) => student?.name ?? "")
        .join(" ") ?? "");
  return hangul.search(`${hidden ? "???" : event.name} ${pickupNames}`, query.trim()) >= 0;
}

// Moves to another event's shop calculator, or its overview from the overview. The shop aside keeps it in a collapsed
// "이벤트 선택" panel: a selector showing the current event beside the page, and the search and list inline in the stacked
// sheet. An unavailable shop offers it as a plain action button. The stacked overview shows it as a row above its menu,
// without the event the artwork already names.
export function EventShopPicker({
  events,
  currentEventUid,
  variant = "panel",
  stacked = false,
  destination = "shop",
}: {
  events: ShopAvailableEvent[];
  currentEventUid: string;
  variant?: "panel" | "row" | "primary" | "secondary";
  stacked?: boolean;
  destination?: "shop" | "overview";
}) {
  const timeZone = useDisplayTimeZone();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [revealedSpoilers, setRevealedSpoilers] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRevealedSpoilers(parseRevealedSpoilerContentUids(localStorage.getItem(futuresRevealedSpoilerKey)));
    } catch {
      setRevealedSpoilers([]);
    }
  }, []);

  const now = nowUtcIso();
  const visibleEvents = events.filter((event) => matchesShopEventSearch(event, query, revealedSpoilers));
  const isHidden = (event: ShopAvailableEvent) => event.isSpoiler && !revealedSpoilers.includes(event.uid);
  const dateRange = (event: ShopAvailableEvent) =>
    `${formatInstant(event.since, { timeZone, format: "MM/DD" })} ~ ${
      event.until ? formatInstant(event.until, { timeZone, format: "MM/DD" }) : "미정"
    }`;

  const search = (
    <SearchInput aria-label="이벤트 검색" placeholder="이벤트 이름이나 학생 이름" value={query} onChange={setQuery} />
  );
  const list =
    visibleEvents.length > 0 ? (
      visibleEvents.map((event) => {
        const status = eventStatus(event, now);
        const current = event.uid === currentEventUid;
        return (
          <Link
            key={event.uid}
            to={destination === "overview" ? `/events/${event.uid}` : `/events/${event.uid}/shop`}
            aria-current={current ? "page" : undefined}
            onClick={(clickEvent) => {
              if (event.isSpoiler && !window.confirm("스포일러가 포함된 이벤트에요. 이동할까요?")) {
                clickEvent.preventDefault();
              } else {
                setOpen(false);
              }
            }}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md px-2.5 py-2 hover:bg-v2-hover",
              current && "bg-v2-inset",
              v2FocusRing,
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-[0.8125rem] font-semibold text-v2-fg">
                {isHidden(event) ? "???" : event.name}
              </span>
              <span className="mt-0.5 block text-xs tabular-nums text-v2-fg-tertiary">{dateRange(event)}</span>
            </span>
            <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
          </Link>
        );
      })
    ) : (
      <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
    );

  if (variant === "panel" && stacked) {
    return (
      <div className="space-y-v2-block-gap">
        {search}
        <div className="max-h-[60vh] overflow-y-auto">{list}</div>
      </div>
    );
  }

  const current = events.find(({ uid }) => uid === currentEventUid);
  let trigger: ReactNode;
  if (variant === "panel") {
    if (!current) return <StatusNotice tone="danger">이벤트 정보를 불러오지 못했어요.</StatusNotice>;
    trigger = (
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-v2-row-min w-full items-center justify-between gap-3 rounded-md text-left text-v2-fg hover:bg-v2-hover",
          v2FocusRing,
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{isHidden(current) ? "???" : current.name}</span>
          <span className="mt-0.5 block text-xs tabular-nums text-v2-fg-tertiary">
            {dateRange(current)} · {STATUS_LABEL[eventStatus(current, now)]}
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-v2-fg-tertiary transition-transform duration-v2-base",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
    );
  } else if (variant === "row") {
    trigger = (
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-v2-row-min w-full items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y text-left text-v2-fg hover:bg-v2-hover",
          v2FocusRing,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-v2-inset">
          <ListBulletIcon className="size-4 text-v2-fg-secondary" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">이벤트 선택</span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-v2-fg-tertiary transition-transform duration-v2-base",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
    );
  } else {
    trigger = (
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={v2ButtonClassName({ variant: variant === "primary" ? "primary" : "secondary", size: "sm" })}
      >
        다른 이벤트 상점
      </button>
    );
  }

  return (
    <>
      {trigger}
      <Popover
        open={open}
        label={variant === "panel" || variant === "row" ? "이벤트 선택" : "다른 이벤트 상점"}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-[min(25rem,calc(100vw-2rem))] p-2"
      >
        {search}
        <div className="mt-2 max-h-80 overflow-y-auto">{list}</div>
      </Popover>
    </>
  );
}
