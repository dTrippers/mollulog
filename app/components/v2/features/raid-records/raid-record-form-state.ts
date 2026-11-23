import {
  RAID_RECORD_LIMITS,
  RAID_RECORD_SNAPSHOT_FIELDS,
  type RaidRecordDefenseType,
  type RaidRecordParty,
  type RaidRecordSnapshot,
  type RaidRecordSnapshotField,
} from "~/domain/raid-record";

// One filled slot of a party being edited.
export type RaidFormUnit = {
  studentUid: string;
  assist: boolean;
  snapshot: RaidRecordSnapshot;
  // The "모집한 학생" values the slot was filled with in this visit. A value that differs from it is one the Sensei
  // corrected, and the table marks it. Null when the slot was not filled from "모집한 학생" in this visit.
  baseline: RaidRecordSnapshot | null;
};

export type RaidFormParty = {
  // A client-only key, so a party keeps its state while the list above it changes.
  id: string;
  defenseType: RaidRecordDefenseType;
  // Slots 0–3 are STRIKER and 4–5 are SPECIAL.
  slots: (RaidFormUnit | null)[];
};

let nextPartyId = 0;

export function newRaidFormPartyId(): string {
  nextPartyId += 1;
  return `party-${nextPartyId}`;
}

export function emptyRaidFormParty(defenseType: RaidRecordDefenseType): RaidFormParty {
  return {
    id: newRaidFormPartyId(),
    defenseType,
    slots: Array.from({ length: RAID_RECORD_LIMITS.partySize }, () => null),
  };
}

export function isStrikerSlot(slot: number): boolean {
  return slot < RAID_RECORD_LIMITS.strikerSlots;
}

export function raidFormPartiesFromRecord(parties: readonly RaidRecordParty[]): RaidFormParty[] {
  return parties.map((party) => {
    const slots: (RaidFormUnit | null)[] = Array.from({ length: RAID_RECORD_LIMITS.partySize }, () => null);
    for (const unit of party.units) {
      slots[unit.slot] = { studentUid: unit.studentUid, assist: unit.assist, snapshot: unit.snapshot, baseline: null };
    }
    return { id: newRaidFormPartyId(), defenseType: party.defenseType, slots };
  });
}

// The parties as the action reads them. A party without a student is left out.
export function raidFormPartiesToSubmit(parties: readonly RaidFormParty[]): RaidRecordParty[] {
  return parties.flatMap((party) => {
    const units = party.slots.flatMap((unit, slot) =>
      unit ? [{ slot, studentUid: unit.studentUid, assist: unit.assist, snapshot: unit.snapshot }] : [],
    );
    return units.length > 0 ? [{ defenseType: party.defenseType, units }] : [];
  });
}

// A student placed in a slot starts with their current "모집한 학생" values. A 조력자 is another Sensei's student, so
// their slot starts empty.
export function fillRaidFormUnit(
  studentUid: string,
  assist: boolean,
  recruited: Readonly<Record<string, RaidRecordSnapshot>>,
): RaidFormUnit {
  if (assist) return { studentUid, assist, snapshot: {}, baseline: null };
  const current = recruited[studentUid] ?? null;
  return { studentUid, assist, snapshot: current ? { ...current } : {}, baseline: current };
}

// "모집한 학생 정보로 다시 채우기": every non-조력자 slot takes the current values again.
export function refillRaidFormParty(
  party: RaidFormParty,
  recruited: Readonly<Record<string, RaidRecordSnapshot>>,
): RaidFormParty {
  return {
    ...party,
    slots: party.slots.map((unit) => (unit && !unit.assist ? fillRaidFormUnit(unit.studentUid, false, recruited) : unit)),
  };
}

export function changedRaidFormFields(unit: RaidFormUnit): Set<RaidRecordSnapshotField> {
  const changed = new Set<RaidRecordSnapshotField>();
  if (!unit.baseline) return changed;
  for (const field of RAID_RECORD_SNAPSHOT_FIELDS) {
    if (unit.snapshot[field] !== unit.baseline[field]) changed.add(field);
  }
  return changed;
}

export function setRaidFormUnitValue(
  unit: RaidFormUnit,
  field: RaidRecordSnapshotField,
  value: number | null,
): RaidFormUnit {
  const snapshot = { ...unit.snapshot };
  if (value === null) delete snapshot[field];
  else snapshot[field] = value;
  return { ...unit, snapshot };
}

export function raidFormPartyStudentCount(party: RaidFormParty): number {
  return party.slots.filter((unit) => unit !== null).length;
}
