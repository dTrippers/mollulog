import {
  ArrowPathIcon,
  ChevronDownIcon,
  HandRaisedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UserMinusIcon,
} from "@heroicons/react/16/solid";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import type { RaidRecordSnapshotField } from "~/domain/raid-record";
import { filterStudentByName } from "~/filters/student";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { PartyGrowthTable } from "./PartyGrowthTable";
import { PartySlotGroups, partySlotWidthClassName } from "./PartySlotGroups";
import { formatRaidStudentName, type RaidPartyStudent } from "./raid-party-student";
import {
  fillRaidFormUnit,
  type RaidFormParty,
  type RaidFormUnit,
  raidFormPartyStudentCount,
  refillRaidFormParty,
} from "./raid-record-form-state";

export type RaidPartyEditorContext = {
  studentsByUid: ReadonlyMap<string, RaidPartyStudent>;
  // The students a slot can take on this server, in menu order.
  pickableStudents: readonly RaidPartyStudent[];
  recruited: Readonly<Record<string, Partial<Record<RaidRecordSnapshotField, number>>>>;
};

const MAX_LISTED_STUDENTS = 12;

const noop = () => {};

function slotLabel(slot: number, strikerSlots: number): string {
  return slot < strikerSlots ? `STRIKER ${slot + 1}` : `SPECIAL ${slot - strikerSlots + 1}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Party card
// ---------------------------------------------------------------------------------------------------------------------

// One party: its slots and the growth table when expanded, or one row of small portraits when collapsed.
export function RaidPartyCard({
  party,
  title,
  expanded,
  context,
  focusSearch = false,
  onSearchFocused,
  onExpand,
  onChange,
  onRemove,
}: {
  party: RaidFormParty;
  title: string;
  expanded: boolean;
  context: RaidPartyEditorContext;
  // Focus the search field once, such as for a party just added.
  focusSearch?: boolean;
  onSearchFocused?: () => void;
  onExpand: () => void;
  onChange: (party: RaidFormParty) => void;
  onRemove: () => void;
}) {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`${title} 펼치기`}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-lg border border-v2-divider px-3.5 py-2.5 text-left hover:bg-v2-hover v2-interaction-transition",
          v2FocusRing,
        )}
      >
        <span className="w-12 shrink-0 text-sm font-semibold text-v2-fg">{title}</span>
        <PartyMiniRow party={party} studentsByUid={context.studentsByUid} />
        <span className="text-xs text-v2-fg-tertiary tabular-nums">{raidFormPartyStudentCount(party)}명</span>
        <ChevronDownIcon className="ml-auto size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      </button>
    );
  }
  const hasFilledSlot = party.slots.some((unit) => unit !== null && !unit.assist);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3.5 rounded-lg border border-v2-divider p-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-v2-fg">{title}</h3>
        <span className="ml-auto" />
        <Button
          variant="text"
          size="sm"
          disabled={!hasFilledSlot}
          onClick={() => onChange(refillRaidFormParty(party, context.recruited))}
        >
          <ArrowPathIcon className="size-3.5" aria-hidden="true" />
          모집한 학생 정보로 다시 채우기
        </Button>
        <IconButton icon={TrashIcon} label={`${title} 삭제`} danger onClick={onRemove} />
      </div>
      <PartySlots
        party={party}
        title={title}
        context={context}
        autoFocus={focusSearch}
        onAutoFocused={onSearchFocused ?? noop}
        onChange={onChange}
      />
      {raidFormPartyStudentCount(party) > 0 ? (
        <PartyGrowthTable
          slots={party.slots}
          title={title}
          studentsByUid={context.studentsByUid}
          onChange={(slot, unit) =>
            onChange({ ...party, slots: party.slots.map((current, index) => (index === slot ? unit : current)) })
          }
        />
      ) : null}
    </section>
  );
}

export function PartyMiniRow({
  party,
  studentsByUid,
}: {
  party: Pick<RaidFormParty, "slots">;
  studentsByUid: ReadonlyMap<string, Pick<RaidPartyStudent, "name">>;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {party.slots.map((unit, slot) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the six slots are fixed positions
        <span key={slot} className={cn("flex", slot === 4 && "ml-2")}>
          {unit ? (
            <RoundStudentImage
              studentUid={unit.studentUid}
              alt={formatRaidStudentName(studentsByUid.get(unit.studentUid)?.name ?? "")}
              size="sm"
            />
          ) : (
            <span
              aria-hidden="true"
              className="size-6 rounded-full border border-dashed border-v2-control-border-strong"
            />
          )}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------------------------------------------------

// The first empty slot after `slot`, wrapping around, or null when every other slot is filled.
function nextEmptySlot(slots: readonly (RaidFormUnit | null)[], slot: number): number | null {
  for (let step = 1; step < slots.length; step += 1) {
    const candidate = (slot + step) % slots.length;
    if (!slots[candidate]) return candidate;
  }
  return null;
}

// The number of results in one row of the result grid, read from the laid-out options.
function gridColumnCount(list: HTMLElement | null): number {
  const options = list ? [...list.querySelectorAll<HTMLElement>('[role="option"]')] : [];
  if (options.length === 0) return 1;
  const firstRowTop = options[0].offsetTop;
  return Math.max(options.filter((option) => option.offsetTop === firstRowTop).length, 1);
}

export type PartySlotsOptions = {
  // The front slots that take strikers; the rest take specials. A party's slot count is the length of its slots.
  strikerSlots?: number;
  // "조력자로 표시" for a record's borrowed student. A guide has no 조력자.
  allowAssist?: boolean;
  // "always" keeps the search field under the slots, disabled until a slot is selected. "selected" shows it only while
  // a slot is selected, so a filled party is one row of portraits; an empty party starts with its first slot selected.
  search?: "always" | "selected";
  // Extra marks on a filled slot's portrait, such as a guide's starting skill order and star tier.
  slotScrimLabel?: (unit: RaidFormUnit, slot: number) => ReactNode;
  slotScrimAriaLabel?: (unit: RaidFormUnit, slot: number) => string | undefined;
  slotBadge?: (unit: RaidFormUnit, slot: number) => ReactNode;
};

// The slots and one search field under them. Typing a name and pressing Enter fills the selected slot and selects the
// next empty one, so a party is six names and six Enters. The arrow keys move through the result grid while the focus
// stays in the field. Once every slot is filled, focus moves to the growth table.
export function PartySlots<P extends Pick<RaidFormParty, "slots">>({
  party,
  title,
  context,
  autoFocus,
  onAutoFocused,
  onChange,
  strikerSlots = 4,
  allowAssist = true,
  search = "always",
  slotScrimLabel,
  slotScrimAriaLabel,
  slotBadge,
}: {
  party: P;
  title: string;
  context: RaidPartyEditorContext;
  autoFocus: boolean;
  onAutoFocused: () => void;
  onChange: (party: P) => void;
} & PartySlotsOptions) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(() => {
    if (search === "always") return party.slots.indexOf(null);
    return party.slots.every((unit) => unit === null) ? 0 : null;
  });
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedSlot = selected !== null && selected >= 0 ? selected : null;
  const selectedUnit = selectedSlot === null ? null : party.slots[selectedSlot];
  const role = selectedSlot === null || selectedSlot < strikerSlots ? "striker" : "special";
  const trimmed = query.trim();
  const matches = useMemo(() => {
    if (!trimmed) return [];
    const usedUids = new Set(party.slots.flatMap((unit) => (unit ? [unit.studentUid] : [])));
    const candidates = context.pickableStudents.filter(
      (student) => student.role === role && !usedUids.has(student.uid),
    );
    return filterStudentByName(trimmed, candidates, MAX_LISTED_STUDENTS);
  }, [context.pickableStudents, role, party.slots, trimmed]);
  const activePosition = Math.min(activeIndex, matches.length - 1);
  const active = matches[activePosition] ?? null;

  useEffect(() => {
    if (!autoFocus) return;
    searchRef.current?.focus();
    onAutoFocused();
  }, [autoFocus, onAutoFocused]);

  const setSlot = (slot: number, unit: RaidFormUnit | null) =>
    party.slots.map((current, index) => (index === slot ? unit : current));

  const pick = (uid: string) => {
    if (selectedSlot === null) return;
    const slots = setSlot(selectedSlot, fillRaidFormUnit(uid, false, context.recruited));
    onChange({ ...party, slots });
    setQuery("");
    setActiveIndex(0);
    const next = nextEmptySlot(slots, selectedSlot);
    setSelected(next);
    if (next === null && search === "always") {
      // The party is full: continue in the growth table, which renders with the new slot on the next frame.
      requestAnimationFrame(() => {
        rootRef.current?.parentElement?.querySelector<HTMLElement>("[data-number-input-flow]")?.focus();
      });
    }
  };

  const clearSlot = (slot: number) => {
    onChange({ ...party, slots: setSlot(slot, null) });
    setSelected(slot);
  };

  const selectSlot = (slot: number) => {
    setSelected(slot);
    setQuery("");
    setActiveIndex(0);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // While a Korean syllable is composing, the IME takes the key to commit it and the browser sends the key again
    // after the commit. Acting only on that second key picks once, with the committed name.
    if (event.nativeEvent.isComposing) return;
    // With a modifier, an arrow key keeps its text editing meaning, such as Shift+← selecting a syllable.
    const modified = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
    if (
      !modified &&
      (event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown")
    ) {
      if (matches.length === 0) return;
      event.preventDefault();
      const columns = gridColumnCount(listRef.current);
      const last = matches.length - 1;
      const current = Math.max(activePosition, 0);
      let next = current;
      if (event.key === "ArrowLeft") next = Math.max(current - 1, 0);
      else if (event.key === "ArrowRight") next = Math.min(current + 1, last);
      else if (event.key === "ArrowUp") next = current - columns >= 0 ? current - columns : current;
      // Down from the row above a shorter last row lands on the last result.
      else if (Math.floor(current / columns) < Math.floor(last / columns)) next = Math.min(current + columns, last);
      setActiveIndex(next);
      // Keep the card Enter would pick on screen; the focus stays in the search field.
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active) pick(active.uid);
      return;
    }
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
      return;
    }
    if (event.key === "Escape" && search === "selected" && selectedSlot !== null) {
      event.preventDefault();
      const slot = selectedSlot;
      setSelected(null);
      slotRefs.current[slot]?.focus();
    }
  };

  const onSlotKeyDown = (event: KeyboardEvent<HTMLButtonElement>, slot: number) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.min(Math.max(slot + (event.key === "ArrowLeft" ? -1 : 1), 0), party.slots.length - 1);
      selectSlot(next);
      slotRefs.current[next]?.focus();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && party.slots[slot]) {
      event.preventDefault();
      clearSlot(slot);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectSlot(slot);
      searchRef.current?.focus();
    }
  };

  const renderSlot = (slot: number) => {
    const unit = party.slots[slot];
    const student = unit ? context.studentsByUid.get(unit.studentUid) : undefined;
    const { name, variant } = splitVisibleStudentName(student?.name ?? "");
    const isSelected = slot === selectedSlot;
    const studentName = unit ? (student ? formatRaidStudentName(student.name) : "알 수 없는 학생") : null;
    return (
      // Narrower portraits on a phone, so a six-student party fits one row inside a card.
      <li key={slot} className={cn("relative flex flex-col", partySlotWidthClassName)}>
        <button
          ref={(element) => {
            slotRefs.current[slot] = element;
          }}
          type="button"
          aria-pressed={isSelected}
          aria-label={`${title} ${slotLabel(slot, strikerSlots)}, ${studentName ? `${studentName}${unit?.assist ? " 조력자" : ""}` : "비어 있음"}`}
          aria-keyshortcuts={unit ? "Delete" : undefined}
          onClick={() => {
            selectSlot(slot);
            searchRef.current?.focus();
          }}
          onKeyDown={(event) => onSlotKeyDown(event, slot)}
          className={cn("relative block w-full cursor-pointer rounded-md text-left", v2FocusRing)}
        >
          {unit ? (
            <StudentThumb
              studentUid={unit.studentUid}
              name={student ? name : "알 수 없는 학생"}
              variant={student ? variant : null}
              fluid
              recruitmentLabel={unit.assist ? "조력자" : undefined}
              scrimLabel={slotScrimLabel?.(unit, slot)}
              scrimAriaLabel={slotScrimAriaLabel?.(unit, slot)}
            />
          ) : (
            <>
              <span
                className={cn(
                  "flex aspect-[5/6] w-full items-center justify-center rounded-md border border-dashed border-v2-control-border-strong text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg v2-interaction-transition",
                  isSelected && "border-solid border-v2-accent bg-v2-accent-subtle text-v2-accent",
                )}
              >
                <PlusIcon className="size-5" aria-hidden="true" />
              </span>
              {/* A phone-width slot is too narrow for the caption, and the dashed box already reads as empty. */}
              <span
                aria-hidden="true"
                className="mt-1 hidden text-center text-xs leading-4 text-v2-fg-tertiary sm:block"
              >
                비어 있음
              </span>
            </>
          )}
          {isSelected && unit ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 aspect-[5/6] rounded-md ring-2 ring-v2-accent"
            />
          ) : null}
          {unit ? slotBadge?.(unit, slot) : null}
        </button>
      </li>
    );
  };

  const slotName = selectedSlot === null ? null : `${title} ${slotLabel(selectedSlot, strikerSlots)}`;
  const listId = `${id}-results`;
  const slotIndexes = party.slots.map((_, slot) => slot);
  const showSearch = search === "always" || selectedSlot !== null;
  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-2.5">
      <PartySlotGroups
        strikers={slotIndexes.slice(0, strikerSlots).map(renderSlot)}
        specials={slotIndexes.slice(strikerSlots).map(renderSlot)}
      />
      <div className={cn("flex min-w-0 flex-wrap items-center gap-2", !showSearch && "hidden")}>
        <label
          className={cn(
            "flex h-v2-control-min min-h-v2-control-min w-full min-w-0 items-center gap-2 rounded-md bg-v2-surface px-3 text-v2-fg-secondary ring-1 ring-v2-control-border sm:max-w-80",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-v2-focus",
          )}
        >
          <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-label={slotName ? `${slotName} 학생 찾기` : `${title} 학생 찾기`}
            aria-autocomplete="list"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-activedescendant={active ? `${id}-${active.uid}` : undefined}
            placeholder={
              selectedSlot === null
                ? "학생을 넣을 슬롯을 고르세요"
                : `${role === "striker" ? "스트라이커" : "스페셜"} 이름으로 찾기`
            }
            disabled={selectedSlot === null}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            className="min-w-0 flex-1 appearance-none bg-transparent text-base text-v2-fg outline-none placeholder:text-v2-fg-tertiary disabled:text-v2-fg-disabled sm:text-sm"
          />
        </label>
        {selectedUnit && selectedSlot !== null ? (
          <span className="flex items-center gap-1">
            {allowAssist ? (
            <Button
              variant="text"
              size="sm"
              aria-pressed={selectedUnit.assist}
              onClick={() =>
                onChange({
                  ...party,
                  slots: setSlot(
                    selectedSlot,
                    fillRaidFormUnit(selectedUnit.studentUid, !selectedUnit.assist, context.recruited),
                  ),
                })
              }
            >
              <HandRaisedIcon className="size-3.5" aria-hidden="true" />
              {selectedUnit.assist ? "조력자 해제" : "조력자로 표시"}
            </Button>
            ) : null}
            <Button variant="text" size="sm" onClick={() => clearSlot(selectedSlot)}>
              <UserMinusIcon className="size-3.5" aria-hidden="true" />
              슬롯 비우기
            </Button>
          </span>
        ) : null}
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="학생 검색 결과"
        className={cn(
          "grid grid-cols-[repeat(auto-fill,3.5rem)] gap-2 sm:grid-cols-[repeat(auto-fill,4rem)]",
          (!trimmed || !showSearch) && "hidden",
        )}
      >
        {matches.map((student, index) => {
          const { name, variant } = splitVisibleStudentName(student.name);
          const isActive = student.uid === active?.uid;
          const recruited = Boolean(context.recruited[student.uid]);
          return (
            <button
              key={student.uid}
              id={`${id}-${student.uid}`}
              type="button"
              role="option"
              aria-selected={isActive}
              aria-label={`${formatRaidStudentName(student.name)}${recruited ? "" : ", 미모집"}`}
              // The keyboard stays in the search field, which moves the active option with the arrow keys.
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              // Only a pointer that moves picks the active card. Scrolling a card under a resting pointer sends
              // mouse events without movement, which would take the active card from the keyboard.
              onMouseMove={(event) => {
                if (event.movementX !== 0 || event.movementY !== 0) setActiveIndex(index);
              }}
              onClick={() => pick(student.uid)}
              // Scroll margins keep a scrolled-to card clear of the mobile header and of the form's save bar, which sits
              // 0.75rem above the mobile navigation (safe area included) and is about 3rem tall; from lg it sits 1rem
              // above the bottom edge.
              className={cn(
                "relative block w-full cursor-pointer rounded-md text-left",
                "scroll-mt-[calc(var(--mobile-header-height)+0.5rem)] scroll-mb-[calc(var(--mobile-nav-height)+4.75rem)]",
                "lg:scroll-mt-2 lg:scroll-mb-20",
              )}
            >
              <StudentThumb
                studentUid={student.uid}
                name={name}
                variant={variant}
                recruitmentLabel={recruited ? undefined : "미모집"}
                captionPlacement="overlay"
              />
              {isActive ? (
                // A thick ring set off from the portrait by a gap of the card's surface, so it reads on any portrait.
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 aspect-[5/6] rounded-md ring-3 ring-v2-accent ring-offset-2 ring-offset-v2-surface"
                />
              ) : null}
            </button>
          );
        })}
        {trimmed && matches.length === 0 ? (
          <p className="col-span-full py-1 text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
        ) : null}
      </div>
    </div>
  );
}
