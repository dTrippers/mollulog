import { BoltIcon, MagnifyingGlassIcon, UserPlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { StudentCard, TierSelector } from "~/components/features/students";
import {
  BottomSheet,
  Button,
  type NumberInputFlowNavigationInputProps,
  useNumberInputFlowNavigation,
} from "~/components/primitives";
import { ABILITY_RELEASE_MAX_LEVEL, getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import type { WalkthroughParty, WalkthroughUnit } from "~/domain/walkthrough-timeline";
import type { ImportStudent } from "~/domain/walkthrough-timeline-import";
import { filterStudentByName } from "~/filters/student";
import WalkthroughStartingSkillSequence from "./WalkthroughStartingSkillSequence";
import { getWalkthroughEquipmentLabel } from "./walkthrough-equipment-label";

type Props = {
  party: WalkthroughParty;
  partySize: 6 | 10;
  students: ImportStudent[];
  recruitedSnapshots: Record<string, NonNullable<WalkthroughUnit["snapshot"]>>;
  onChange: (party: WalkthroughParty) => void;
};

const GROWTH_FIELDS = [
  { field: "skillEx", label: "EX", min: 1, max: 5 },
  { field: "skillNormal", label: "기본", min: 1, max: 10 },
  { field: "skillEnhanced", label: "강화", min: 1, max: 10 },
  { field: "skillSub", label: "서브", min: 1, max: 10 },
] as const;

const EQUIPMENT_FIELDS = ["equip1", "equip2", "equip3"] as const;

const ABILITY_FIELDS = [
  { field: "abilityHp", label: "체력" },
  { field: "abilityAtk", label: "공격" },
  { field: "abilityHeal", label: "치유" },
] as const;

function CompactGrowthInput({
  label,
  value,
  min,
  max,
  disabled = false,
  hideLabel = false,
  grouped = false,
  inputProps,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  disabled?: boolean;
  hideLabel?: boolean;
  grouped?: boolean;
  inputProps: NumberInputFlowNavigationInputProps;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block space-y-1 text-center text-xs text-muted-foreground">
      <span className={hideLabel ? "sr-only" : "block whitespace-nowrap"}>{label}</span>
      <input
        {...inputProps}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={String(max).length}
        value={value ?? ""}
        disabled={disabled}
        aria-label={label}
        title={`${label} ${min}~${max}`}
        className={
          grouped
            ? "h-8 w-full min-w-0 border-0 bg-transparent px-1 text-center text-sm font-semibold text-foreground outline-none transition-colors focus:relative focus:z-10 focus:bg-background focus:ring-2 focus:ring-inset focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
            : "h-8 w-9 rounded-md border border-input bg-background px-1 text-center text-sm font-semibold text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
        }
        onChange={(event) => {
          const digits = event.target.value.replace(/[^0-9]/g, "").slice(0, String(max).length);
          if (!digits) {
            onChange(null);
            return;
          }
          onChange(Math.min(max, Math.max(min, Number(digits))));
        }}
      />
    </label>
  );
}

function strikerCount(size: 6 | 10) {
  return size === 6 ? 4 : 6;
}

function startingSkillLimit(size: 6 | 10) {
  return size - 1;
}

export function toggleStartingSkillStudentUid(order: string[], studentUid: string, limit: number) {
  if (order.includes(studentUid)) return order.filter((uid) => uid !== studentUid);
  if (order.length >= limit) return order;
  return [...order, studentUid];
}

export function resizeWalkthroughParty(party: WalkthroughParty, currentSize: 6 | 10, size: 6 | 10): WalkthroughParty {
  if (currentSize === size) return party;
  const remappedUnits = party.units.flatMap((unit) => {
    if (size === 10) {
      return [{ ...unit, slot: unit.slot < 4 ? unit.slot : unit.slot + 2 }];
    }
    if (unit.slot < 4) return [unit];
    if (unit.slot >= 6 && unit.slot < 8) return [{ ...unit, slot: unit.slot - 2 }];
    return [];
  });
  const selectedStudentUids = new Set(remappedUnits.flatMap((unit) => unit.studentUid ?? []));

  return {
    ...party,
    units: remappedUnits,
    startingSkillStudentUids: party.startingSkillStudentUids
      .filter((uid) => selectedStudentUids.has(uid))
      .slice(0, startingSkillLimit(size)),
  };
}

export default function WalkthroughPartyFormationEditor({
  party,
  partySize,
  students,
  recruitedSnapshots,
  onChange,
}: Props) {
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [search, setSearch] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [startingSkillAnnouncement, setStartingSkillAnnouncement] = useState("");
  const [startingSkillSheetOpen, setStartingSkillSheetOpen] = useState(false);
  const [stagedStartingSkillStudentUids, setStagedStartingSkillStudentUids] = useState<string[]>([]);
  const [startingSkillSheetAnnouncement, setStartingSkillSheetAnnouncement] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectingSlotRef = useRef<number | null>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const strikers = strikerCount(partySize);
  const selectedUnit = party.units.find((unit) => unit.slot === selectedSlot);
  const requiredRole = selectedSlot < strikers ? "striker" : "special";
  const startingSkillMaximum = startingSkillLimit(partySize);
  const stagedStartingSkillLimitReached = stagedStartingSkillStudentUids.length >= startingSkillMaximum;
  const studentsByUid = useMemo(
    () => Object.fromEntries(students.map((student) => [student.uid, student])),
    [students],
  );
  const hasSearch = search.trim().length > 0;
  const occupiedStudentUids = useMemo(
    () => new Set(party.units.flatMap((unit) => unit.studentUid ?? [])),
    [party.units],
  );
  const filteredStudents = useMemo(() => {
    if (!hasSearch) return [];
    const roleStudents = students.filter(
      (student) => student.role === requiredRole && !occupiedStudentUids.has(student.uid),
    );
    return filterStudentByName(search, roleStudents);
  }, [students, requiredRole, occupiedStudentUids, search, hasSearch]);
  const visibleStudents = filteredStudents.slice(0, 10);

  useEffect(() => {
    if (selectedSlot >= partySize) setSelectedSlot(0);
  }, [partySize, selectedSlot]);

  const selectStudent = (studentUid: string) => {
    if (selectingSlotRef.current === selectedSlot) return;
    selectingSlotRef.current = selectedSlot;
    const student = students.find((candidate) => candidate.uid === studentUid);
    const recruitedSnapshot = recruitedSnapshots[studentUid];
    onChange({
      ...party,
      units: [
        ...party.units.filter((unit) => unit.slot !== selectedSlot),
        {
          slot: selectedSlot,
          studentUid,
          snapshot:
            recruitedSnapshot || student?.initialTier
              ? { ...(student?.initialTier ? { tier: student.initialTier } : {}), ...recruitedSnapshot }
              : undefined,
        },
      ].sort((left, right) => left.slot - right.slot),
    });

    const nextEmptySlot = Array.from({ length: partySize }, (_, slot) => slot).find(
      (slot) => slot > selectedSlot && !party.units.some((unit) => unit.slot === slot),
    );
    if (nextEmptySlot !== undefined) setSelectedSlot(nextEmptySlot);
    setSearch("");
    searchInputRef.current?.focus();
  };

  const moveActiveResult = (direction: -1 | 1, moveFocus = false) => {
    if (visibleStudents.length === 0) return;
    const nextIndex = Math.min(Math.max(activeResultIndex + direction, 0), visibleStudents.length - 1);
    setActiveResultIndex(nextIndex);
    if (moveFocus) resultRefs.current[nextIndex]?.focus();
  };

  const handleResultNavigation = (event: KeyboardEvent<HTMLElement>, moveFocus = false) => {
    if (event.nativeEvent.isComposing || event.repeat) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveResult(-1, moveFocus);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveResult(1, moveFocus);
      return;
    }
    if (event.key === "Enter" && visibleStudents[activeResultIndex]) {
      event.preventDefault();
      selectStudent(visibleStudents[activeResultIndex].uid);
    }
  };

  const handleSlotNavigation = (event: KeyboardEvent<HTMLButtonElement>, slot: number) => {
    let nextSlot = slot;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextSlot = Math.max(slot - 1, 0);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextSlot = Math.min(slot + 1, partySize - 1);
    } else {
      return;
    }

    event.preventDefault();
    setSelectedSlot(nextSlot);
    slotRefs.current[nextSlot]?.focus();
  };

  const removeStudentAtSlot = (slot: number) => {
    const unit = party.units.find((candidate) => candidate.slot === slot);
    if (!unit) return;
    const studentName = unit.studentUid ? students.find((student) => student.uid === unit.studentUid)?.name : undefined;
    const removedStartingSkill = Boolean(unit.studentUid && party.startingSkillStudentUids.includes(unit.studentUid));
    selectingSlotRef.current = null;
    onChange({
      ...party,
      units: party.units.filter((candidate) => candidate.slot !== slot),
      startingSkillStudentUids: party.startingSkillStudentUids.filter((uid) => uid !== unit.studentUid),
    });
    setStartingSkillAnnouncement(
      `${studentName ? `${studentName} 학생` : "선택한 학생"}을 편성에서 제외했어요.${removedStartingSkill ? " 시작 스킬 순서에서도 제외하고 뒤 번호를 갱신했어요." : ""}`,
    );
  };

  const openStartingSkillSettings = () => {
    setStagedStartingSkillStudentUids([...party.startingSkillStudentUids]);
    setStartingSkillSheetAnnouncement("");
    setStartingSkillAnnouncement("");
    setStartingSkillSheetOpen(true);
  };

  const closeStartingSkillSettings = () => setStartingSkillSheetOpen(false);

  const confirmStartingSkillSettings = () => {
    const hasChanged =
      stagedStartingSkillStudentUids.length !== party.startingSkillStudentUids.length ||
      stagedStartingSkillStudentUids.some((uid, index) => uid !== party.startingSkillStudentUids[index]);
    if (hasChanged) {
      onChange({ ...party, startingSkillStudentUids: [...stagedStartingSkillStudentUids] });
      setStartingSkillAnnouncement("시작 스킬 순서를 적용했어요.");
    }
    closeStartingSkillSettings();
  };

  const toggleStagedStartingSkill = (studentUid: string) => {
    const index = stagedStartingSkillStudentUids.indexOf(studentUid);
    if (index >= 0) {
      setStagedStartingSkillStudentUids((current) =>
        toggleStartingSkillStudentUid(current, studentUid, startingSkillMaximum),
      );
      const studentName = students.find((student) => student.uid === studentUid)?.name ?? "학생 정보 없음";
      setStartingSkillSheetAnnouncement(`${studentName}: 시작 스킬 순서에서 제외했어요. 뒤 번호가 갱신됐어요.`);
      return;
    }
    const nextOrder = stagedStartingSkillStudentUids.length + 1;
    setStagedStartingSkillStudentUids((current) =>
      toggleStartingSkillStudentUid(current, studentUid, startingSkillMaximum),
    );
    const studentName = students.find((student) => student.uid === studentUid)?.name ?? "학생 정보 없음";
    setStartingSkillSheetAnnouncement(`${studentName}: 시작 스킬 ${nextOrder}번으로 추가했어요.`);
  };

  const renderSlot = (slot: number) => {
    const unit = party.units.find((candidate) => candidate.slot === slot);
    const student = students.find((candidate) => candidate.uid === unit?.studentUid);
    const roleLabel = slot < strikers ? "스트라이커" : "스페셜";
    const roleIndex = slot < strikers ? slot + 1 : slot - strikers + 1;
    return (
      <div
        // Slots have stable numeric identities within a party, even when the party size changes.
        key={`${party.uid}-slot-${slot}`}
        className="group relative min-w-0"
      >
        <button
          ref={(element) => {
            slotRefs.current[slot] = element;
          }}
          type="button"
          aria-label={`${roleLabel} ${roleIndex}${student ? `, ${student.name}` : ", 비어 있음"}`}
          aria-pressed={selectedSlot === slot}
          className={`relative w-full min-w-0 overflow-hidden rounded-lg text-left outline-none transition hover:brightness-95 ${
            student ? "bg-transparent" : "bg-muted"
          }`}
          onFocus={() => setSelectedSlot(slot)}
          onKeyDown={(event) => handleSlotNavigation(event, slot)}
          onClick={() => setSelectedSlot(slot)}
        >
          {student ? (
            <StudentCard uid={student.uid} name={student.name} role={student.role} namePlacement="overlay" flush />
          ) : (
            <div className="flex aspect-5/6 items-center justify-center text-muted-foreground">
              <UserPlusIcon className="size-6" />
            </div>
          )}
          {selectedSlot === slot ? (
            <span
              className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary"
              aria-hidden="true"
            />
          ) : null}
        </button>
        {student ? (
          <button
            type="button"
            aria-label={`${student.name} 슬롯에서 제외`}
            className="absolute top-1 right-1 z-10 rounded-full bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive hover:text-white"
            onClick={() => removeStudentAtSlot(slot)}
          >
            <XMarkIcon className="size-4" />
          </button>
        ) : null}
      </div>
    );
  };

  const formationGroups = [
    {
      label: "스트라이커",
      slots: Array.from({ length: strikers }, (_, slot) => slot),
      groupClass: partySize === 6 ? "col-span-4" : "col-span-6",
      gridClass: partySize === 6 ? "grid-cols-4" : "grid-cols-6",
    },
    {
      label: "스페셜",
      slots: Array.from({ length: partySize - strikers }, (_, index) => strikers + index),
      groupClass: partySize === 6 ? "col-span-2" : "col-span-4",
      gridClass: partySize === 6 ? "grid-cols-2" : "grid-cols-4",
    },
  ];

  return (
    <div className="space-y-5">
      <div className={`@container w-full min-w-0 ${partySize === 6 ? "sm:max-w-80" : "sm:max-w-[34rem]"}`}>
        <div className={`grid w-full min-w-0 grid-cols-6 gap-2 ${partySize === 10 ? "@min-[544px]:grid-cols-10" : ""}`}>
          {formationGroups.map((group) => (
            <section
              key={group.label}
              className={`min-w-0 space-y-2 ${group.groupClass}`}
              aria-label={`${group.label} 편성`}
            >
              <h3 className="text-xs font-semibold text-muted-foreground">
                {group.label} {group.slots.length}명
              </h3>
              <div className={`grid gap-2 ${group.gridClass}`}>{group.slots.map(renderSlot)}</div>
            </section>
          ))}
        </div>
      </div>

      {!selectedUnit?.studentUid && (
        <div className="space-y-3">
          <label
            className="flex min-h-11 items-center gap-2 rounded-md border border-transparent bg-muted px-3 transition-colors focus-within:border-ring/50"
            htmlFor={`${party.uid}-student-search`}
          >
            <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              id={`${party.uid}-student-search`}
              value={search}
              onChange={(event) => {
                selectingSlotRef.current = null;
                setSearch(event.target.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={(event) => handleResultNavigation(event)}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={visibleStudents.length > 0}
              aria-controls={hasSearch ? `${party.uid}-student-results` : undefined}
              aria-activedescendant={
                visibleStudents[activeResultIndex]
                  ? `${party.uid}-student-result-${visibleStudents[activeResultIndex].uid}`
                  : undefined
              }
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={`${requiredRole === "striker" ? "스트라이커" : "스페셜"} 학생 이름으로 찾기`}
            />
          </label>
          {hasSearch &&
            (visibleStudents.length > 0 ? (
              <div
                id={`${party.uid}-student-results`}
                role="listbox"
                aria-label="학생 검색 결과"
                className="grid grid-cols-5 gap-2 sm:grid-cols-10"
              >
                {visibleStudents.map((student, index) => (
                  <button
                    id={`${party.uid}-student-result-${student.uid}`}
                    key={student.uid}
                    ref={(element) => {
                      resultRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={activeResultIndex === index}
                    className="relative min-w-0 overflow-hidden rounded-lg bg-transparent outline-none transition hover:brightness-95"
                    onFocus={() => setActiveResultIndex(index)}
                    onKeyDown={(event) => handleResultNavigation(event, true)}
                    onClick={() => selectStudent(student.uid)}
                  >
                    <StudentCard
                      uid={student.uid}
                      name={student.name}
                      role={student.role}
                      namePlacement="overlay"
                      flush
                    />
                    {activeResultIndex === index && (
                      <span
                        className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p id={`${party.uid}-student-results`} className="py-4 text-center text-sm text-muted-foreground">
                선택할 수 있는 학생이 없어요.
              </p>
            ))}
        </div>
      )}

      <section className="space-y-2" aria-labelledby={`${party.uid}-starting-skills-heading`}>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${party.uid}-starting-skills-heading`} className="text-sm font-semibold">
              시작 스킬 순서
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {party.startingSkillStudentUids.length} / {startingSkillMaximum}
            </span>
          </div>
          <Button
            text="시작 스킬 설정"
            icon={BoltIcon}
            variant="secondary"
            size="sm"
            className="sm:ml-auto"
            onClick={openStartingSkillSettings}
          />
        </div>
        <WalkthroughStartingSkillSequence
          partyUid={party.uid}
          studentUids={party.startingSkillStudentUids}
          studentsByUid={studentsByUid}
          label="시작 스킬 순서"
          emptyMessage="지정된 시작 스킬이 없어요."
        />
      </section>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {startingSkillAnnouncement}
      </p>

      {startingSkillSheetOpen ? (
        <BottomSheet
          Icon={BoltIcon}
          title="시작 스킬 설정"
          description="학생을 누르면 순서에 추가되고, 다시 누르면 제외돼요."
          onClose={closeStartingSkillSettings}
        >
          <div className="space-y-5 px-2 pb-4">
            <div
              className={`grid w-full min-w-0 grid-cols-6 gap-2 ${partySize === 10 ? "md:grid-cols-10" : ""} ${
                partySize === 6 ? "sm:max-w-80" : "sm:max-w-[34rem]"
              }`}
            >
              {formationGroups.map((group) => {
                const occupiedSlots = group.slots.flatMap((slot) => {
                  const unit = party.units.find((candidate) => candidate.slot === slot);
                  return unit?.studentUid ? [unit] : [];
                });
                return (
                  <section
                    key={group.label}
                    className={`min-w-0 space-y-3 ${group.groupClass}`}
                    aria-label={`시작 스킬 설정 - ${group.label} 편성`}
                  >
                    <h3 className="text-xs font-semibold text-muted-foreground">
                      {group.label} {occupiedSlots.length}명
                    </h3>
                    <div className={`grid gap-2 ${group.gridClass}`}>
                      {occupiedSlots.map((unit) => {
                        const uid = unit.studentUid;
                        if (!uid) return null;

                        const student = students.find((candidate) => candidate.uid === uid);
                        const orderIndex = stagedStartingSkillStudentUids.indexOf(uid);
                        const selected = orderIndex >= 0;
                        const unavailableAtLimit = !selected && stagedStartingSkillLimitReached;
                        const buttonLabel = student?.name ?? "학생 정보 없음";
                        return (
                          <button
                            key={uid}
                            type="button"
                            aria-label={`${buttonLabel}, ${selected ? `시작 스킬 ${orderIndex + 1}번, 선택됨` : "시작 스킬에 선택 안 됨"}`}
                            aria-pressed={selected}
                            aria-describedby={
                              unavailableAtLimit ? `${party.uid}-starting-skill-sheet-limit` : undefined
                            }
                            disabled={unavailableAtLimit}
                            onClick={() => toggleStagedStartingSkill(uid)}
                            className="relative min-w-0 rounded-lg text-left outline-none transition hover:brightness-95 focus-visible:-translate-y-1 focus-visible:z-20 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-3 focus-visible:ring-offset-popover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {student ? (
                              <StudentCard
                                uid={student.uid}
                                name={student.name}
                                role={student.role}
                                namePlacement="overlay"
                                flush
                              />
                            ) : (
                              <span className="flex aspect-5/6 items-center justify-center rounded-lg bg-muted px-1 text-center text-xs text-muted-foreground">
                                학생 정보 없음
                              </span>
                            )}
                            {selected ? (
                              <span
                                className="pointer-events-none absolute inset-0 z-10 rounded-lg border-[3px] border-background outline outline-2 outline-foreground"
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <section className="space-y-2" aria-labelledby={`${party.uid}-starting-skill-staged-heading`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 id={`${party.uid}-starting-skill-staged-heading`} className="text-sm font-semibold">
                  선택한 시작 스킬 순서
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {stagedStartingSkillStudentUids.length} / {startingSkillMaximum}
                </span>
              </div>
              {stagedStartingSkillLimitReached ? (
                <p id={`${party.uid}-starting-skill-sheet-limit`} className="text-sm text-muted-foreground">
                  {partySize}인 편성은 시작 스킬을 최대 {startingSkillMaximum}명까지 지정할 수 있어요.
                </p>
              ) : null}
              <WalkthroughStartingSkillSequence
                partyUid={`${party.uid}-staged`}
                studentUids={stagedStartingSkillStudentUids}
                studentsByUid={studentsByUid}
                label="선택한 시작 스킬 순서"
                emptyMessage="선택한 학생이 없어요."
              />
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {startingSkillSheetAnnouncement}
              </p>
            </section>
          </div>
          <div className="sticky bottom-0 mt-auto flex shrink-0 gap-2 border-t border-border bg-popover/95 pt-3 pb-1">
            <Button text="취소" variant="secondary" fullWidth onClick={closeStartingSkillSettings} />
            <Button text="순서 적용" variant="inverse" fullWidth onClick={confirmStartingSkillSettings} />
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}

type GrowthEditorProps = Pick<Props, "party" | "students" | "onChange">;

export function WalkthroughPartyGrowthEditor({ party, students, onChange }: GrowthEditorProps) {
  const growthInputNavigation = useNumberInputFlowNavigation();
  const units = [...party.units].filter((unit) => unit.studentUid).sort((left, right) => left.slot - right.slot);

  const updateUnit = (slot: number, update: (unit: WalkthroughUnit) => WalkthroughUnit) => {
    onChange({
      ...party,
      units: party.units.map((unit) => (unit.slot === slot ? update(unit) : unit)),
    });
  };

  const updateSnapshotField = (
    unit: WalkthroughUnit,
    field: keyof NonNullable<WalkthroughUnit["snapshot"]>,
    value: number | null,
  ) => {
    updateUnit(unit.slot, (current) => ({
      ...current,
      snapshot: {
        ...current.snapshot,
        [field]: value ?? undefined,
      },
    }));
  };

  if (units.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">편성된 학생이 없어요.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[47rem] table-fixed border-collapse text-sm">
        <thead className="bg-muted/70 text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="w-14 px-3 py-2 text-center font-semibold">
              <span className="sr-only">학생</span>
            </th>
            <th scope="col" className="w-44 border-l border-border px-3 py-2 font-semibold">
              성급
            </th>
            <th scope="col" className="w-14 px-3 py-2 font-semibold">
              Lv
            </th>
            <th scope="col" className="w-44 border-l border-border px-2 py-2 font-semibold">
              <span>스킬</span>
              <span className="mt-1 flex font-medium">
                {GROWTH_FIELDS.map(({ field, label }) => (
                  <span key={field} className="min-w-0 flex-1">
                    {label}
                  </span>
                ))}
              </span>
            </th>
            <th scope="col" className="w-36 border-l border-border px-2 py-2 font-semibold">
              <span>장비</span>
              <span className="mt-1 block font-medium">종류별 레벨</span>
            </th>
            <th scope="col" className="w-36 border-l border-border px-2 py-2 font-semibold">
              <span>능력 해방</span>
              <span className="mt-1 flex font-medium">
                {ABILITY_FIELDS.map(({ field, label }) => (
                  <span key={field} className="min-w-0 flex-1">
                    {label}
                  </span>
                ))}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => {
            const student = students.find((candidate) => candidate.uid === unit.studentUid);
            if (!student) return null;
            const selectedTier = unit.snapshot?.tier ?? student.initialTier;
            const growthTier =
              typeof student.initialTier === "number" && typeof selectedTier === "number"
                ? { initial: student.initialTier, current: selectedTier }
                : null;

            return (
              <tr key={unit.slot} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-3 py-2 font-medium">
                  <span className="sr-only">{student.name}</span>
                  <div className="mx-auto size-9 overflow-hidden rounded-md" title={student.name}>
                    <StudentCard uid={student.uid} name={student.name} role={student.role} hideName flush />
                  </div>
                </th>
                {growthTier ? (
                  <>
                    <td className="border-l border-border px-2 py-2">
                      <div className="flex h-9 min-w-24 items-center justify-center px-2">
                        <TierSelector
                          initialTier={growthTier.initial}
                          currentTier={growthTier.current}
                          iconSize="sm"
                          onTierChange={(tier) => {
                            const weaponLevel = unit.snapshot?.weaponLevel;
                            const weaponLevelMax = getWeaponLevelMaxByTier(tier);
                            updateUnit(unit.slot, (current) => ({
                              ...current,
                              snapshot: {
                                ...current.snapshot,
                                tier,
                                ...(weaponLevel !== undefined && weaponLevel > weaponLevelMax
                                  ? { weaponLevel: weaponLevelMax }
                                  : {}),
                              },
                            }));
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <CompactGrowthInput
                        label={`${student.name} 학생 레벨`}
                        hideLabel
                        min={1}
                        max={90}
                        value={unit.snapshot?.level ?? null}
                        inputProps={growthInputNavigation.getInputProps()}
                        onChange={(value) => updateSnapshotField(unit, "level", value)}
                      />
                    </td>
                    <td className="border-l border-border px-2 py-2">
                      <div className="flex h-9 overflow-hidden rounded-md border border-input bg-background">
                        {GROWTH_FIELDS.map(({ field, label, min, max }, index) => (
                          <div key={field} className={`min-w-0 flex-1 ${index === 0 ? "" : "border-l border-input"}`}>
                            <CompactGrowthInput
                              label={`${student.name} ${label} 스킬`}
                              hideLabel
                              grouped
                              min={min}
                              max={max}
                              value={unit.snapshot?.[field] ?? null}
                              inputProps={growthInputNavigation.getInputProps()}
                              onChange={(value) => updateSnapshotField(unit, field, value)}
                            />
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="border-l border-border px-2 py-2">
                      <div className="space-y-1">
                        <div className="grid grid-cols-3 gap-1 text-center text-xs text-muted-foreground">
                          {EQUIPMENT_FIELDS.map((field, index) => {
                            const equipmentLabel = getWalkthroughEquipmentLabel(student.equipments, index);
                            return (
                              <span key={field} className="min-w-0 break-words leading-tight" title={equipmentLabel}>
                                {equipmentLabel}
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex h-9 overflow-hidden rounded-md border border-input bg-background">
                          {EQUIPMENT_FIELDS.map((field, index) => {
                            const equipmentLabel = getWalkthroughEquipmentLabel(student.equipments, index);
                            return (
                              <div
                                key={field}
                                className={`min-w-0 flex-1 ${index === 0 ? "" : "border-l border-input"}`}
                              >
                                <CompactGrowthInput
                                  label={`${student.name} ${equipmentLabel} 레벨`}
                                  hideLabel
                                  grouped
                                  min={1}
                                  max={10}
                                  value={unit.snapshot?.[field] ?? null}
                                  inputProps={growthInputNavigation.getInputProps()}
                                  onChange={(value) => updateSnapshotField(unit, field, value)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="border-l border-border px-2 py-2">
                      <div className="flex h-9 overflow-hidden rounded-md border border-input bg-background">
                        {ABILITY_FIELDS.map(({ field, label }, index) => (
                          <div key={field} className={`min-w-0 flex-1 ${index === 0 ? "" : "border-l border-input"}`}>
                            <CompactGrowthInput
                              label={`${student.name} 능력 해방 ${label}`}
                              hideLabel
                              grouped
                              disabled={growthTier.current <= 5}
                              min={0}
                              max={ABILITY_RELEASE_MAX_LEVEL}
                              value={unit.snapshot?.[field] ?? null}
                              inputProps={growthInputNavigation.getInputProps({ disabled: growthTier.current <= 5 })}
                              onChange={(value) => updateSnapshotField(unit, field, value)}
                            />
                          </div>
                        ))}
                      </div>
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="border-l border-border px-3 py-2 text-sm text-destructive">
                    학생의 기본 성급 정보를 불러올 수 없어요.
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
