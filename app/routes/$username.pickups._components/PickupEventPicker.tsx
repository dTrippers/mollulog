import { ChevronDownIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { useEffect, useRef, useState } from "react";
import { ContentMedia } from "~/components/v2/features/futures/ContentMedia";
import { RoundStudentImage } from "~/components/v2/features/students/RoundStudentImage";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Popover } from "~/components/v2/primitives/Popover";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import { cn } from "~/lib/utils";
import { getPickupTypeLabel } from "./pickup-record";

export type PickupEventOption = {
  // The recruitment group the record belongs to.
  uid: string;
  // The game content of the group's first timeline entry. Its logo is the event image.
  logoContentUid: string | null;
  name: string;
  type: string;
  since: string;
  until: string | null;
  isSpoiler: boolean;
  recruitments: { student: { uid: string; name: string } | null; pickup: boolean }[];
};

const MAX_VISIBLE_EVENTS = 20;

export function useRevealedSpoilers() {
  const [revealed, setRevealed] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRevealed(parseRevealedSpoilerContentUids(localStorage.getItem(futuresRevealedSpoilerKey)));
    } catch {
      setRevealed([]);
    }
  }, []);
  return revealed;
}

function isHidden(event: PickupEventOption, revealed: string[]) {
  return event.isSpoiler && !revealed.includes(event.uid);
}

export function matchesPickupEventSearch(event: PickupEventOption, query: string, revealed: string[]) {
  const hidden = isHidden(event, revealed);
  const pickupNames = hidden
    ? ""
    : event.recruitments
        .filter(({ pickup }) => pickup)
        .map(({ student }) => student?.name ?? "")
        .join(" ");
  return hangul.search(`${hidden ? "???" : event.name} ${pickupNames}`, query.trim()) >= 0;
}

function usePeriod() {
  const timeZone = useDisplayTimeZone();
  return (event: PickupEventOption) => {
    const since = formatInstant(event.since, { timeZone, format: "MM/DD" });
    return event.until ? `${since} ~ ${formatInstant(event.until, { timeZone, format: "MM/DD" })}` : `${since} 이후`;
  };
}

function EventSummary({
  event,
  revealed,
  size,
  withPickups = false,
}: {
  event: PickupEventOption;
  revealed: string[];
  size: "timeline" | "row";
  withPickups?: boolean;
}) {
  const period = usePeriod();
  const hidden = isHidden(event, revealed);
  const typeLabel = getPickupTypeLabel(event.type);
  const pickups = hidden
    ? []
    : event.recruitments.flatMap(({ pickup, student }) => (pickup && student ? [student] : []));

  return (
    <span className="flex min-w-0 flex-1 items-center gap-v2-media-gap">
      <ContentMedia
        source={
          hidden
            ? { kind: "placeholder" }
            : event.logoContentUid
              ? { kind: "logo", contentUid: event.logoContentUid }
              : { kind: "type" }
        }
        contentType="pickup"
        typeLabel={typeLabel}
        size={size}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-v2-fg">{hidden ? "???" : event.name}</span>
        <span className="mt-0.5 block text-xs text-v2-fg-tertiary tabular-nums">
          {typeLabel} · {period(event)}
        </span>
        {withPickups && pickups.length > 0 ? (
          <>
            <span className="sr-only">픽업 학생 {pickups.map(({ name }) => name).join(", ")}</span>
            <span aria-hidden="true" className="mt-1.5 flex flex-wrap gap-1">
              {pickups.map(({ uid }) => (
                <RoundStudentImage key={uid} studentUid={uid} size="md" />
              ))}
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}

// The event the record belongs to. A new record picks it from the list of started pickup recruitments; an existing
// record keeps its event, so the same block shows it without a way to change it.
export default function PickupEventPicker({
  events,
  value,
  onSelect,
  locked = false,
}: {
  events: PickupEventOption[];
  value: string | null;
  onSelect: (eventUid: string) => void;
  locked?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const revealed = useRevealedSpoilers();
  const current = value ? events.find((event) => event.uid === value) : undefined;
  const matches = events.filter((event) => matchesPickupEventSearch(event, query, revealed));
  const visible = matches.slice(0, MAX_VISIBLE_EVENTS);

  if (locked) {
    return current ? (
      <div className="flex min-h-14 items-center rounded-md px-3 py-2 ring-1 ring-v2-control-border">
        <EventSummary event={current} revealed={revealed} size="timeline" />
      </div>
    ) : null;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={current ? undefined : "이벤트 선택"}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-md bg-v2-surface px-3 py-2 text-left ring-1 ring-v2-control-border hover:bg-v2-hover",
          v2FocusRing,
        )}
      >
        {current ? (
          <EventSummary event={current} revealed={revealed} size="timeline" />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-v2-media-gap text-sm text-v2-fg-tertiary">
            <ContentMedia source={{ kind: "type" }} contentType="pickup" typeLabel="모집" size="timeline" />
            이벤트 선택
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-v2-fg-tertiary transition-transform duration-v2-base",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <Popover
        open={open}
        label="이벤트 찾기"
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-[min(32rem,calc(100vw-2rem))] p-2"
      >
        <SearchInput
          aria-label="이벤트 찾기"
          placeholder="이벤트 또는 모집 학생 이름으로 찾기"
          value={query}
          onChange={setQuery}
        />
        <div className="mt-2 max-h-80 overflow-y-auto">
          {visible.length > 0 ? (
            visible.map((event) => (
              <button
                key={event.uid}
                type="button"
                aria-current={event.uid === value ? "true" : undefined}
                onClick={() => {
                  onSelect(event.uid);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-v2-hover",
                  event.uid === value && "bg-v2-inset",
                  v2FocusRing,
                )}
              >
                <EventSummary event={event} revealed={revealed} size="row" withPickups />
              </button>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
          )}
        </div>
      </Popover>
    </>
  );
}
