import { MagnifyingGlassIcon, UserPlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { StudentCard, TierSelector } from "~/components/features/students";
import { type NumberInputFlowNavigationInputProps, useNumberInputFlowNavigation } from "~/components/primitives";
import { ABILITY_RELEASE_MAX_LEVEL, getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import type { WalkthroughParty, WalkthroughUnit } from "~/domain/walkthrough-timeline";
import type { ImportStudent } from "~/domain/walkthrough-timeline-import";
import { filterStudentByName } from "~/filters/student";

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

const EQUIPMENT_FIELDS = [
  { field: "equip1", label: "1슬롯" },
  { field: "equip2", label: "2슬롯" },
  { field: "equip3", label: "3슬롯" },
] as const;

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
  inputProps,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  disabled?: boolean;
  inputProps: NumberInputFlowNavigationInputProps;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block space-y-1 text-center text-xs text-muted-foreground">
      <span className="block whitespace-nowrap">{label}</span>
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
        className="h-8 w-9 rounded-md border border-input bg-background px-1 text-center text-sm font-semibold text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
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
    startingSkillStudentUids: party.startingSkillStudentUids.filter((uid) => selectedStudentUids.has(uid)),
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectingSlotRef = useRef<number | null>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const growthInputNavigation = useNumberInputFlowNavigation();
  const strikers = strikerCount(partySize);
  const selectedUnit = party.units.find((unit) => unit.slot === selectedSlot);
  const selectedStudent = students.find((student) => student.uid === selectedUnit?.studentUid);
  const selectedTier = selectedUnit?.snapshot?.tier ?? selectedStudent?.initialTier;
  const requiredRole = selectedSlot < strikers ? "striker" : "special";
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

  const updateUnit = (update: (unit: WalkthroughUnit) => WalkthroughUnit) => {
    if (!selectedUnit) return;
    onChange({
      ...party,
      units: party.units.map((unit) => (unit.slot === selectedSlot ? update(unit) : unit)),
    });
  };

  const updateSnapshotField = (field: keyof NonNullable<WalkthroughUnit["snapshot"]>, value: number | null) => {
    updateUnit((unit) => ({
      ...unit,
      snapshot: {
        ...unit.snapshot,
        [field]: value ?? undefined,
      },
    }));
  };

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
    selectingSlotRef.current = null;
    onChange({
      ...party,
      units: party.units.filter((candidate) => candidate.slot !== slot),
      startingSkillStudentUids: party.startingSkillStudentUids.filter((uid) => uid !== unit.studentUid),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: partySize }, (_, slot) => {
            const unit = party.units.find((candidate) => candidate.slot === slot);
            const student = students.find((candidate) => candidate.uid === unit?.studentUid);
            const roleLabel = slot < strikers ? "스트라이커" : "스페셜";
            const roleIndex = slot < strikers ? slot + 1 : slot - strikers + 1;
            return (
              <div
                // Slots have stable numeric identities within a party, even when the party size changes.
                // biome-ignore lint/suspicious/noArrayIndexKey: the index is the persisted slot identifier.
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
                    <StudentCard
                      uid={student.uid}
                      name={student.name}
                      role={student.role}
                      namePlacement="overlay"
                      flush
                    />
                  ) : (
                    <div className="flex aspect-5/6 items-center justify-center text-muted-foreground">
                      <UserPlusIcon className="size-6" />
                    </div>
                  )}
                  {selectedSlot === slot && (
                    <span
                      className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary"
                      aria-hidden="true"
                    />
                  )}
                </button>
                {student && (
                  <button
                    type="button"
                    aria-label={`${student.name} 슬롯에서 제외`}
                    className="absolute top-1 right-1 z-10 rounded-full bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive hover:text-white"
                    onClick={() => removeStudentAtSlot(slot)}
                  >
                    <XMarkIcon className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
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
                className="grid grid-cols-10 gap-1"
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

      {selectedUnit?.studentUid && selectedStudent && (
        <div>
          {typeof selectedStudent.initialTier === "number" && typeof selectedTier === "number" ? (
            <div className="flex w-full flex-wrap items-stretch gap-2 xl:flex-nowrap">
              <fieldset className="shrink-0 rounded-md border border-border/70 px-2 py-1.5">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">기본 정보</legend>
                <div className="flex items-end gap-1.5">
                  <div className="space-y-1 text-center">
                    <span className="block text-xs text-muted-foreground">성급</span>
                    <div className="flex h-8 items-center">
                      <TierSelector
                        initialTier={selectedStudent.initialTier}
                        currentTier={selectedTier}
                        iconSize="sm"
                        onTierChange={(tier) => {
                          const weaponLevel = selectedUnit.snapshot?.weaponLevel;
                          const weaponLevelMax = getWeaponLevelMaxByTier(tier);
                          updateUnit((unit) => ({
                            ...unit,
                            snapshot: {
                              ...unit.snapshot,
                              tier,
                              ...(weaponLevel !== undefined && weaponLevel > weaponLevelMax
                                ? { weaponLevel: weaponLevelMax }
                                : {}),
                            },
                          }));
                        }}
                      />
                    </div>
                  </div>
                  <CompactGrowthInput
                    label="학생 Lv"
                    min={1}
                    max={90}
                    value={selectedUnit.snapshot?.level ?? null}
                    inputProps={growthInputNavigation.getInputProps()}
                    onChange={(value) => updateSnapshotField("level", value)}
                  />
                </div>
              </fieldset>
              <fieldset className="shrink-0 rounded-md border border-border/70 px-2 py-1.5">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">스킬</legend>
                <div className="flex items-end gap-1.5">
                  {GROWTH_FIELDS.map(({ field, label, min, max }) => (
                    <CompactGrowthInput
                      key={field}
                      label={label}
                      min={min}
                      max={max}
                      value={selectedUnit.snapshot?.[field] ?? null}
                      inputProps={growthInputNavigation.getInputProps()}
                      onChange={(value) => updateSnapshotField(field, value)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="shrink-0 rounded-md border border-border/70 px-2 py-1.5">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">장비</legend>
                <div className="flex items-end gap-1.5">
                  {EQUIPMENT_FIELDS.map(({ field, label }) => (
                    <CompactGrowthInput
                      key={field}
                      label={label}
                      min={1}
                      max={10}
                      value={selectedUnit.snapshot?.[field] ?? null}
                      inputProps={growthInputNavigation.getInputProps()}
                      onChange={(value) => updateSnapshotField(field, value)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="shrink-0 rounded-md border border-border/70 px-2 py-1.5">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">능력 해방</legend>
                <div className="flex items-end gap-1.5">
                  {ABILITY_FIELDS.map(({ field, label }) => (
                    <CompactGrowthInput
                      key={field}
                      label={label}
                      disabled={selectedTier <= 5}
                      min={0}
                      max={ABILITY_RELEASE_MAX_LEVEL}
                      value={selectedUnit.snapshot?.[field] ?? null}
                      inputProps={growthInputNavigation.getInputProps({ disabled: selectedTier <= 5 })}
                      onChange={(value) => updateSnapshotField(field, value)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="shrink-0 rounded-md border border-border/70 px-2 py-1.5">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">옵션</legend>
                <label className="flex h-full min-h-8 items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={party.startingSkillStudentUids.includes(selectedUnit.studentUid)}
                    disabled={
                      !party.startingSkillStudentUids.includes(selectedUnit.studentUid) &&
                      party.startingSkillStudentUids.length >= 3
                    }
                    onChange={(event) =>
                      onChange({
                        ...party,
                        startingSkillStudentUids: event.target.checked
                          ? [...new Set([...party.startingSkillStudentUids, selectedUnit.studentUid as string])]
                          : party.startingSkillStudentUids.filter((uid) => uid !== selectedUnit.studentUid),
                      })
                    }
                  />
                  시작 스킬
                </label>
              </fieldset>
            </div>
          ) : (
            <p className="text-sm text-destructive">학생의 기본 성급 정보를 불러올 수 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
