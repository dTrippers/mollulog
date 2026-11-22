import { nanoid } from "nanoid/non-secure";
import { RAID_RECORD_SNAPSHOT_FIELDS, type RaidRecordSnapshot } from "~/domain/raid-record";
import type {
  TimelineAction,
  TimelineStep,
  WalkthroughParty,
  WalkthroughTimelineDocument,
  WalkthroughUnit,
} from "~/domain/walkthrough-timeline";
import type { RaidFormUnit } from "../raid-records/raid-record-form-state";

export function emptyWalkthroughParty(order: number): WalkthroughParty {
  return { uid: nanoid(8), order, startingSkillStudentUids: [], units: [], steps: [] };
}

export function emptyActionStep(order: number): TimelineStep {
  return { uid: nanoid(8), order, kind: "actions", marker: { kind: "manual", value: "" }, actions: [] };
}

export function emptyDividerStep(order: number): TimelineStep {
  return { uid: nanoid(8), order, kind: "divider", actions: [], note: "" };
}

export function moveItem<T>(values: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= values.length || from < 0 || from >= values.length) return [...values];
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function renumberSteps(steps: readonly TimelineStep[]): TimelineStep[] {
  return steps.map((step, order) => (step.order === order ? step : { ...step, order }));
}

export function renumberParties(parties: readonly WalkthroughParty[]): WalkthroughParty[] {
  return parties.map((party, order) => (party.order === order ? party : { ...party, order }));
}

function toSnapshot(value: WalkthroughUnit["snapshot"]): RaidRecordSnapshot {
  const snapshot: RaidRecordSnapshot = {};
  for (const field of RAID_RECORD_SNAPSHOT_FIELDS) {
    const fieldValue = value?.[field];
    if (typeof fieldValue === "number") snapshot[field] = fieldValue;
  }
  return snapshot;
}

// The "모집한 학생" values each slot was filled with in this visit, by student, so the growth table can mark the values
// the Sensei changed. They are not saved.
export type WalkthroughPartyBaselines = Readonly<Record<string, RaidRecordSnapshot>>;

// A guide party in the slot shape the record form's slot picker and growth table edit.
export function walkthroughPartySlots(
  party: Pick<WalkthroughParty, "units">,
  partySize: WalkthroughTimelineDocument["partySize"],
  baselines: WalkthroughPartyBaselines = {},
): (RaidFormUnit | null)[] {
  const slots: (RaidFormUnit | null)[] = Array.from({ length: partySize }, () => null);
  for (const unit of party.units) {
    if (!unit.studentUid || unit.slot < 0 || unit.slot >= partySize) continue;
    slots[unit.slot] = {
      studentUid: unit.studentUid,
      assist: false,
      snapshot: toSnapshot(unit.snapshot),
      baseline: baselines[unit.studentUid] ?? null,
    };
  }
  return slots;
}

// The slots back as a guide party's units, and the baselines of the students still in it.
export function walkthroughUnitsFromSlots(slots: readonly (RaidFormUnit | null)[]): {
  units: WalkthroughUnit[];
  baselines: Record<string, RaidRecordSnapshot>;
} {
  const units: WalkthroughUnit[] = [];
  const baselines: Record<string, RaidRecordSnapshot> = {};
  slots.forEach((unit, slot) => {
    if (!unit) return;
    const snapshot = toSnapshot(unit.snapshot);
    units.push(
      Object.keys(snapshot).length > 0
        ? { slot, studentUid: unit.studentUid, snapshot }
        : { slot, studentUid: unit.studentUid },
    );
    if (unit.baseline) baselines[unit.studentUid] = unit.baseline;
  });
  return { units, baselines };
}

// The party's students in slot order.
export function walkthroughPartyStudentUids(party: Pick<WalkthroughParty, "units">): string[] {
  return [...party.units]
    .sort((left, right) => left.slot - right.slot)
    .flatMap((unit) => (unit.studentUid ? [unit.studentUid] : []));
}

// A skill whose student or target is no longer in the party, such as after a slot changed.
export function isActionOutsideParty(action: TimelineAction, partyStudentUids: ReadonlySet<string>): boolean {
  return (
    (action.studentUid ? !partyStudentUids.has(action.studentUid) : false) ||
    (action.targetStudentUid ? !partyStudentUids.has(action.targetStudentUid) : false)
  );
}
