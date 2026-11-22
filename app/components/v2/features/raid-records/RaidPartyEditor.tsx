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
import { STUDENT_GROWTH_EDIT_RANGES } from "~/domain/student-growth-edit";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { NumberInput } from "../../primitives/NumberInput";
import {
  type NumberInputFlowNavigationInputProps,
  useNumberInputFlowNavigation,
} from "../../primitives/use-number-input-flow-navigation";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { TierInput } from "../students/TierInput";
import { useBundledGrowthTable } from "./use-bundled-growth-table";
import {
  changedRaidFormFields,
  fillRaidFormUnit,
  isStrikerSlot,
  type RaidFormParty,
  type RaidFormUnit,
  raidFormPartyStudentCount,
  refillRaidFormParty,
  setRaidFormUnitValue,
} from "./raid-record-form-state";

export type RaidPartyStudent = {
  uid: string;
  name: string;
  // Other names the student goes by, which the search also matches.
  altNames: string[];
  role: "striker" | "special";
  initialTier: number;
  equipmentSlots: number;
};

export type RaidPartyEditorContext = {
  studentsByUid: ReadonlyMap<string, RaidPartyStudent>;
  // The students a slot can take on this server, in menu order.
  pickableStudents: readonly RaidPartyStudent[];
  recruited: Readonly<Record<string, Partial<Record<RaidRecordSnapshotField, number>>>>;
};

const MAX_LISTED_STUDENTS = 12;

const noop = () => {};

// "시로코*테러" reads as "시로코(테러)", as the other v2 pickers show it.
export function formatRaidStudentName(rawName: string): string {
  const { name, variant } = splitVisibleStudentName(rawName);
  return variant ? `${name}(${variant})` : name;
}

function slotLabel(slot: number): string {
  return isStrikerSlot(slot) ? `STRIKER ${slot + 1}` : `SPECIAL ${slot - 3}`;
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
          party={party}
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

const SLOT_COUNT = 6;

// The first empty slot after `slot`, wrapping around, or null when every other slot is filled.
function nextEmptySlot(slots: readonly (RaidFormUnit | null)[], slot: number): number | null {
  for (let step = 1; step < SLOT_COUNT; step += 1) {
    const candidate = (slot + step) % SLOT_COUNT;
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

// The slots and one search field under them. Typing a name and pressing Enter fills the selected slot and selects the
// next empty one, so a party is six names and six Enters. The arrow keys move through the result grid while the focus
// stays in the field. Once every slot is filled, focus moves to the growth table.
function PartySlots({
  party,
  title,
  context,
  autoFocus,
  onAutoFocused,
  onChange,
}: {
  party: RaidFormParty;
  title: string;
  context: RaidPartyEditorContext;
  autoFocus: boolean;
  onAutoFocused: () => void;
  onChange: (party: RaidFormParty) => void;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(() => party.slots.indexOf(null));
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedSlot = selected !== null && selected >= 0 ? selected : null;
  const selectedUnit = selectedSlot === null ? null : party.slots[selectedSlot];
  const role = selectedSlot === null || isStrikerSlot(selectedSlot) ? "striker" : "special";
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
    if (next === null) {
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
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown"
    ) {
      if (matches.length === 0) return;
      event.preventDefault();
      const columns = gridColumnCount(listRef.current);
      const last = matches.length - 1;
      const current = Math.max(activePosition, 0);
      if (event.key === "ArrowLeft") setActiveIndex(Math.max(current - 1, 0));
      else if (event.key === "ArrowRight") setActiveIndex(Math.min(current + 1, last));
      else if (event.key === "ArrowUp") setActiveIndex(current - columns >= 0 ? current - columns : current);
      // Down from the row above a shorter last row lands on the last result.
      else if (Math.floor(current / columns) < Math.floor(last / columns))
        setActiveIndex(Math.min(current + columns, last));
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
    }
  };

  const onSlotKeyDown = (event: KeyboardEvent<HTMLButtonElement>, slot: number) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.min(Math.max(slot + (event.key === "ArrowLeft" ? -1 : 1), 0), SLOT_COUNT - 1);
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
      <li key={slot} className="relative flex w-14 flex-col sm:w-16">
        <button
          ref={(element) => {
            slotRefs.current[slot] = element;
          }}
          type="button"
          aria-pressed={isSelected}
          aria-label={`${title} ${slotLabel(slot)}, ${studentName ? `${studentName}${unit?.assist ? " 조력자" : ""}` : "비어 있음"}`}
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
              recruitmentLabel={unit.assist ? "조력자" : undefined}
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
              <span aria-hidden="true" className="mt-1 block text-center text-xs leading-4 text-v2-fg-tertiary">
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
        </button>
      </li>
    );
  };

  const slotName = selectedSlot === null ? null : `${title} ${slotLabel(selectedSlot)}`;
  const listId = `${id}-results`;
  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-3">
        <SlotGroup label="STRIKER">{[0, 1, 2, 3].map(renderSlot)}</SlotGroup>
        <span aria-hidden="true" className="mx-1 hidden w-px self-stretch bg-v2-divider sm:block" />
        <SlotGroup label="SPECIAL">{[4, 5].map(renderSlot)}</SlotGroup>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
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
          !trimmed && "hidden",
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
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(student.uid)}
              className="relative block w-full cursor-pointer rounded-md text-left"
            >
              <StudentThumb
                studentUid={student.uid}
                name={name}
                variant={variant}
                recruitmentLabel={recruited ? undefined : "미모집"}
                captionPlacement="overlay"
                overlayOnMobile
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

function SlotGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p aria-hidden="true" className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-v2-fg-tertiary">
        {label}
      </p>
      <ul aria-label={label} className="flex gap-2">
        {children}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Growth table
// ---------------------------------------------------------------------------------------------------------------------

type GrowthColumn = { field: RaidRecordSnapshotField; label: string };
type GrowthBundle = { key: string; label: string; columns: GrowthColumn[] };

const BASIC: GrowthBundle = {
  key: "basic",
  label: "기본 정보",
  columns: [
    { field: "tier", label: "성급" },
    { field: "level", label: "Lv" },
    { field: "weaponLevel", label: "고유무기" },
  ],
};
const SKILL: GrowthBundle = {
  key: "skill",
  label: "스킬",
  columns: [
    { field: "skillEx", label: "EX" },
    { field: "skillNormal", label: "기본" },
    { field: "skillEnhanced", label: "강화" },
    { field: "skillSub", label: "서브" },
  ],
};
const EQUIPMENT_TIER: GrowthColumn[] = [
  { field: "equip1", label: "1" },
  { field: "equip2", label: "2" },
  { field: "equip3", label: "3" },
];
const GEAR: GrowthColumn = { field: "equipSpecial", label: "애용품" };
const ABILITY: GrowthBundle = {
  key: "ability",
  label: "능력 개방",
  columns: [
    { field: "abilityHp", label: "체력" },
    { field: "abilityAtk", label: "공격력" },
    { field: "abilityHeal", label: "치유력" },
  ],
};

// Side-by-side: every value in one row. 애용품 has its own box beside the equipment tiers.
export const RAID_GROWTH_WIDE_BUNDLES: GrowthBundle[] = [
  BASIC,
  SKILL,
  { key: "equipment", label: "장비 티어", columns: EQUIPMENT_TIER },
  { key: "gear", label: "", columns: [GEAR] },
  ABILITY,
];

// Stacked: one bundle at a time, the way the "모집한 학생" growth table stacks.
export const RAID_GROWTH_STACKED_BUNDLES: GrowthBundle[] = [
  BASIC,
  SKILL,
  { key: "equipment", label: "장비", columns: [...EQUIPMENT_TIER, GEAR] },
  ABILITY,
];

// A value the student cannot have: an equipment slot they lack, or a weapon or ability release below ★6.
export function isRaidGrowthFieldApplicable(
  field: RaidRecordSnapshotField,
  student: Pick<RaidPartyStudent, "equipmentSlots"> | undefined,
  tier: number | undefined,
): boolean {
  if (field === "equip1" || field === "equip2" || field === "equip3") {
    const index = Number(field.slice(-1)) - 1;
    return student !== undefined && index < student.equipmentSlots;
  }
  if (field === "weaponLevel" || field === "abilityHp" || field === "abilityAtk" || field === "abilityHeal") {
    return tier === undefined || tier > 5;
  }
  return true;
}

function PartyGrowthTable({
  party,
  title,
  studentsByUid,
  onChange,
}: {
  party: RaidFormParty;
  title: string;
  studentsByUid: ReadonlyMap<string, RaidPartyStudent>;
  onChange: (slot: number, unit: RaidFormUnit) => void;
}) {
  const { ref: tableBoxRef, bundled: stacked } = useBundledGrowthTable();
  const [bundleKey, setBundleKey] = useState(RAID_GROWTH_STACKED_BUNDLES[0].key);
  const { getInputProps } = useNumberInputFlowNavigation();
  const bundles = stacked
    ? RAID_GROWTH_STACKED_BUNDLES.filter((bundle) => bundle.key === bundleKey)
    : RAID_GROWTH_WIDE_BUNDLES;
  const rows = party.slots.flatMap((unit, slot) => (unit ? [{ unit, slot }] : []));
  const anyChanged = rows.some(({ unit }) => changedRaidFormFields(unit).size > 0);
  // The legend names what the highlight means; each changed cell points to it, so the change is not color alone.
  const changedLegendId = useId();

  return (
    <div className="min-w-0">
      {stacked ? (
        <fieldset className="mb-2 flex min-w-0 gap-1 overflow-x-auto border-0 border-b border-v2-divider p-0">
          <legend className="sr-only">성장 정보 묶음</legend>
          {RAID_GROWTH_STACKED_BUNDLES.map((bundle) => (
            <button
              key={bundle.key}
              type="button"
              aria-pressed={bundle.key === bundleKey}
              onClick={() => setBundleKey(bundle.key)}
              className={cn(
                "flex min-h-8 shrink-0 cursor-pointer items-center border-b-2 px-2.5 text-sm whitespace-nowrap",
                bundle.key === bundleKey
                  ? "border-v2-link font-semibold text-v2-fg"
                  : "border-transparent text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
                v2FocusRing,
              )}
            >
              {bundle.label}
            </button>
          ))}
        </fieldset>
      ) : null}
      <div ref={tableBoxRef} className="min-w-0 overflow-x-auto">
        <table className="border-separate border-spacing-x-1 border-spacing-y-1.5 text-sm">
          <caption className="sr-only">{title} 성장 정보</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                <span className="sr-only">학생</span>
              </th>
              {bundles.map((bundle) => (
                <th
                  key={bundle.key}
                  scope="colgroup"
                  colSpan={bundle.columns.length}
                  hidden={stacked}
                  className="pb-0 pl-3 text-center text-[0.6875rem] font-semibold text-v2-fg-secondary"
                >
                  {bundle.label || <span className="sr-only">애용품</span>}
                </th>
              ))}
            </tr>
            <tr>
              {bundles.flatMap((bundle) =>
                bundle.columns.map((column, index) => (
                  <th
                    key={column.field}
                    scope="col"
                    className={cn(
                      "px-0 text-center text-[0.6875rem] font-normal whitespace-nowrap text-v2-fg-tertiary",
                      index === 0 && "pl-3",
                    )}
                  >
                    {column.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ unit, slot }) => {
              const student = studentsByUid.get(unit.studentUid);
              const studentName = student ? formatRaidStudentName(student.name) : "알 수 없는 학생";
              const changed = changedRaidFormFields(unit);
              return (
                <tr key={slot}>
                  <th scope="row" className="w-28 max-w-28 text-left font-normal sm:w-36 sm:max-w-36">
                    <span className="flex min-w-0 items-center gap-2">
                      <RoundStudentImage studentUid={unit.studentUid} size="sm" />
                      <span className="min-w-0 truncate text-sm font-semibold text-v2-fg">{studentName}</span>
                      {unit.assist ? (
                        <span className="inline-flex min-h-[1.125rem] shrink-0 items-center rounded bg-v2-inset px-1.5 text-[0.6875rem] font-semibold text-v2-fg-secondary">
                          조력자
                        </span>
                      ) : null}
                    </span>
                  </th>
                  {bundles.flatMap((bundle) =>
                    bundle.columns.map((column, index) => (
                      <td key={column.field} className={cn("p-0", index === 0 && "pl-3")}>
                        <GrowthCellInput
                          field={column.field}
                          unit={unit}
                          student={student}
                          studentName={studentName}
                          changedDescriptionId={changed.has(column.field) ? changedLegendId : undefined}
                          flowProps={getInputProps()}
                          onChange={(value) => onChange(slot, setRaidFormUnitValue(unit, column.field, value))}
                        />
                      </td>
                    )),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyChanged ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-v2-fg-tertiary">
          <span
            aria-hidden="true"
            className={cn(
              "size-3.5 rounded-sm bg-v2-accent-subtle ring-1 ring-v2-accent ring-inset",
              CHANGED_FORCED_COLORS_MARK,
            )}
          />
          <span id={changedLegendId}>모집한 학생 정보에서 수정한 값</span>
        </p>
      ) : null}
    </div>
  );
}

// Forced colors drop the fill and ring that mark a changed value, so the cell and the legend swatch also get a dashed
// outline there.
const CHANGED_FORCED_COLORS_MARK =
  "forced-colors:outline-2 forced-colors:outline-offset-[-3px] forced-colors:outline-dashed";

function GrowthCellInput({
  field,
  unit,
  student,
  studentName,
  changedDescriptionId,
  flowProps,
  onChange,
}: {
  field: RaidRecordSnapshotField;
  unit: RaidFormUnit;
  student: RaidPartyStudent | undefined;
  studentName: string;
  // Set when the value differs from the recruited student's: the id of the text that says so.
  changedDescriptionId: string | undefined;
  flowProps: NumberInputFlowNavigationInputProps;
  onChange: (value: number | null) => void;
}) {
  const value = unit.snapshot[field] ?? null;
  const range = STUDENT_GROWTH_EDIT_RANGES[field];
  // A stored value that the tier no longer allows stays editable, so it can be corrected.
  const editable = isRaidGrowthFieldApplicable(field, student, unit.snapshot.tier) || value !== null;
  const changed = changedDescriptionId !== undefined;
  const cellClassName = cn(
    "w-10",
    changed && cn("bg-v2-accent-subtle ring-1 ring-v2-accent ring-inset", CHANGED_FORCED_COLORS_MARK),
  );
  if (!editable) {
    return <span aria-hidden="true" className="block min-h-7 w-10 rounded-md bg-v2-inset" />;
  }
  if (field === "tier") {
    return (
      <TierInput
        label={studentName}
        value={value}
        initialTier={student?.initialTier ?? 1}
        min={range.min}
        max={range.max}
        compact
        describedBy={changedDescriptionId}
        flowProps={flowProps}
        onChange={(tier) => onChange(tier)}
        className={cn(cellClassName, "w-12")}
      />
    );
  }
  const outOfRange = value !== null && (value < range.min || value > range.max);
  return (
    <NumberInput
      aria-label={`${studentName} ${range.label}`}
      aria-invalid={outOfRange || undefined}
      aria-describedby={changedDescriptionId}
      compact
      step={1}
      min={range.min}
      max={range.max}
      placeholder="–"
      value={value ?? ""}
      data-number-input-flow={flowProps["data-number-input-flow"]}
      onFocus={flowProps.onFocus}
      onKeyDown={flowProps.onKeyDown}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        onChange(raw === "" ? null : Number(raw));
      }}
      className={cn(
        cellClassName,
        "px-0 font-normal",
        outOfRange && "bg-v2-danger-subtle ring-2 ring-v2-danger ring-inset",
      )}
    />
  );
}
