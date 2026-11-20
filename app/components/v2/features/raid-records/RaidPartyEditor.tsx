import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  HandRaisedIcon,
  PlusIcon,
  TrashIcon,
  UserMinusIcon,
} from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import type { RaidRecordSnapshotField } from "~/domain/raid-record";
import { STUDENT_GROWTH_EDIT_RANGES } from "~/domain/student-growth-edit";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { NumberInput } from "../../primitives/NumberInput";
import { Popover } from "../../primitives/Popover";
import { SearchInput } from "../../primitives/SearchInput";
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

const MAX_LISTED_STUDENTS = 50;

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
  onExpand,
  onChange,
  onRemove,
}: {
  party: RaidFormParty;
  title: string;
  expanded: boolean;
  context: RaidPartyEditorContext;
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
          "flex w-full cursor-pointer items-center gap-3 rounded-lg border border-v2-divider px-3.5 py-2.5 text-left hover:bg-v2-hover",
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
      <PartySlots party={party} title={title} context={context} onChange={onChange} />
      {raidFormPartyStudentCount(party) > 0 ? (
        <PartyGrowthTable
          party={party}
          title={title}
          studentsByUid={context.studentsByUid}
          onChange={(slot, unit) => onChange({ ...party, slots: party.slots.map((current, index) => (index === slot ? unit : current)) })}
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
            <span aria-hidden="true" className="size-6 rounded-full border border-dashed border-v2-control-border-strong" />
          )}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------------------------------------------------

function PartySlots({
  party,
  title,
  context,
  onChange,
}: {
  party: RaidFormParty;
  title: string;
  context: RaidPartyEditorContext;
  onChange: (party: RaidFormParty) => void;
}) {
  const setSlot = (slot: number, unit: RaidFormUnit | null) =>
    onChange({ ...party, slots: party.slots.map((current, index) => (index === slot ? unit : current)) });
  const usedUids = new Set(party.slots.flatMap((unit) => (unit ? [unit.studentUid] : [])));
  const renderSlot = (slot: number) => (
    <PartySlot
      key={slot}
      partyTitle={title}
      slot={slot}
      unit={party.slots[slot]}
      context={context}
      usedUids={usedUids}
      onChange={(unit) => setSlot(slot, unit)}
    />
  );
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-3">
      <SlotGroup label="STRIKER">{[0, 1, 2, 3].map(renderSlot)}</SlotGroup>
      <span aria-hidden="true" className="mx-1 hidden w-px self-stretch bg-v2-divider sm:block" />
      <SlotGroup label="SPECIAL">{[4, 5].map(renderSlot)}</SlotGroup>
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

function PartySlot({
  partyTitle,
  slot,
  unit,
  context,
  usedUids,
  onChange,
}: {
  partyTitle: string;
  slot: number;
  unit: RaidFormUnit | null;
  context: RaidPartyEditorContext;
  usedUids: ReadonlySet<string>;
  onChange: (unit: RaidFormUnit | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const student = unit ? context.studentsByUid.get(unit.studentUid) : undefined;
  const role = isStrikerSlot(slot) ? "striker" : "special";
  const slotName = `${partyTitle} ${slotLabel(slot)}`;
  const close = () => {
    setOpen(false);
    setChoosing(false);
  };
  const pick = (uid: string) => {
    onChange(fillRaidFormUnit(uid, unit?.assist ?? false, context.recruited));
    close();
    triggerRef.current?.focus();
  };

  const { name, variant } = splitVisibleStudentName(student?.name ?? "");
  return (
    <li className="relative flex w-14 flex-col sm:w-16">
      {unit ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${slotName} ${student ? formatRaidStudentName(student.name) : "알 수 없는 학생"}${unit.assist ? " 조력자" : ""} 메뉴`}
          onClick={() => setOpen((current) => !current)}
          className={cn("block w-full cursor-pointer rounded-md text-left", v2FocusRing)}
        >
          <StudentThumb
            studentUid={unit.studentUid}
            name={student ? name : "알 수 없는 학생"}
            variant={student ? variant : null}
            recruitmentLabel={unit.assist ? "조력자" : undefined}
          />
        </button>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`${slotName} 학생 넣기`}
            onClick={() => {
              setChoosing(true);
              setOpen((current) => !current);
            }}
            className={cn(
              "flex aspect-[5/6] w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-v2-control-border-strong text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg",
              v2FocusRing,
            )}
          >
            <PlusIcon className="size-5" aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="mt-1 text-center text-xs leading-4 text-v2-fg-tertiary">
            비어 있음
          </span>
        </>
      )}
      <Popover
        open={open}
        label={unit && !choosing ? `${slotName} 메뉴` : `${slotName} 학생 찾기`}
        onClose={close}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-[min(20rem,calc(100vw-2rem))] p-2"
      >
        {unit && !choosing ? (
          <div className="flex flex-col">
            <p className="truncate px-2.5 pt-1 pb-2 text-sm font-semibold text-v2-fg">
              {student ? formatRaidStudentName(student.name) : "알 수 없는 학생"}
            </p>
            <SlotMenuButton icon={ArrowsRightLeftIcon} onClick={() => setChoosing(true)}>
              다른 학생으로 바꾸기
            </SlotMenuButton>
            <SlotMenuButton
              icon={HandRaisedIcon}
              onClick={() => {
                onChange(fillRaidFormUnit(unit.studentUid, !unit.assist, context.recruited));
                close();
                triggerRef.current?.focus();
              }}
            >
              {unit.assist ? "조력자 표시 해제" : "조력자로 표시"}
            </SlotMenuButton>
            <SlotMenuButton
              icon={UserMinusIcon}
              danger
              onClick={() => {
                onChange(null);
                close();
                triggerRef.current?.focus();
              }}
            >
              슬롯 비우기
            </SlotMenuButton>
          </div>
        ) : (
          <StudentSearch
            label={`${slotName} 학생 찾기`}
            students={context.pickableStudents}
            role={role}
            usedUids={usedUids}
            currentUid={unit?.studentUid ?? null}
            recruited={context.recruited}
            onPick={pick}
          />
        )}
      </Popover>
    </li>
  );
}

function SlotMenuButton({
  icon: Icon,
  danger = false,
  onClick,
  children,
}: {
  icon: typeof UserMinusIcon;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-v2-hover",
        danger ? "text-v2-danger" : "text-v2-fg",
        v2FocusRing,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

function StudentSearch({
  label,
  students,
  role,
  usedUids,
  currentUid,
  recruited,
  onPick,
}: {
  label: string;
  students: readonly RaidPartyStudent[];
  role: RaidPartyStudent["role"];
  usedUids: ReadonlySet<string>;
  currentUid: string | null;
  recruited: RaidPartyEditorContext["recruited"];
  onPick: (uid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () =>
      students.filter(
        (student) =>
          student.role === role &&
          (student.uid === currentUid || !usedUids.has(student.uid)) &&
          hangul.search(student.name, query.trim()) >= 0,
      ),
    [students, role, usedUids, currentUid, query],
  );
  return (
    <>
      <SearchInput aria-label={label} placeholder="학생 이름으로 찾기" value={query} onChange={setQuery} />
      <div className="mt-2 max-h-72 overflow-y-auto">
        {matches.length > 0 ? (
          matches.slice(0, MAX_LISTED_STUDENTS).map((student) => {
            const { name, variant } = splitVisibleStudentName(student.name);
            return (
              <button
                key={student.uid}
                type="button"
                onClick={() => onPick(student.uid)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-v2-hover",
                  v2FocusRing,
                )}
              >
                <RoundStudentImage studentUid={student.uid} size="md" />
                <span className="min-w-0 flex-1 truncate text-sm text-v2-fg">
                  {name}
                  {variant ? <span className="ml-1 text-xs text-v2-fg-tertiary">{variant}</span> : null}
                </span>
                {student.uid === currentUid ? (
                  <span className="text-xs text-v2-fg-tertiary">지금 학생</span>
                ) : recruited[student.uid] ? null : (
                  <span className="text-xs text-v2-fg-tertiary">모집하지 않음</span>
                )}
              </button>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
        )}
      </div>
    </>
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
                  : "border-transparent text-v2-fg-secondary hover:text-v2-fg",
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
                    className={cn("px-0 text-center text-[0.6875rem] font-normal whitespace-nowrap text-v2-fg-tertiary", index === 0 && "pl-3")}
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
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-v2-fg-tertiary">
        {anyChanged ? (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="size-3.5 rounded-sm bg-v2-accent-subtle ring-1 ring-v2-accent ring-inset" />
            <span id={changedLegendId}>모집한 학생 정보에서 수정한 값</span>
          </span>
        ) : null}
        <span>–: 입력하지 않았거나 해당 없음</span>
      </p>
    </div>
  );
}

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
  const cellClassName = cn("w-10", changed && "bg-v2-accent-subtle ring-1 ring-v2-accent ring-inset");
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
      className={cn(cellClassName, "px-0 font-normal", outOfRange && "bg-v2-danger-subtle ring-2 ring-v2-danger ring-inset")}
    />
  );
}
