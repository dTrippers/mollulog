import { RAID_RECORD_LIMITS, type RaidRecordParty } from "~/domain/raid-record";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { PartyGrowthReadOnlyTable } from "./PartyGrowthTable";
import { EmptyPartySlot, PartySlotGroups, partySlotWidthClassName } from "./PartySlotGroups";
import type { RaidPartyStudent } from "./raid-party-student";

// A saved party, read-only: its slots and the growth values recorded with it.
export function RaidPartyView({
  party,
  title,
  studentsByUid,
}: {
  party: RaidRecordParty;
  title: string;
  studentsByUid: ReadonlyMap<string, Pick<RaidPartyStudent, "name">>;
}) {
  const slots = Array.from({ length: RAID_RECORD_LIMITS.partySize }, (_, slot) => slot);
  const unitsBySlot = new Map(party.units.map((unit) => [unit.slot, unit]));
  const renderThumb = (unit: RaidRecordParty["units"][number]) => {
    const student = studentsByUid.get(unit.studentUid);
    const { name, variant } = splitVisibleStudentName(student?.name ?? "알 수 없는 학생");
    return (
      <li key={unit.slot} className={partySlotWidthClassName}>
        <StudentThumb
          studentUid={unit.studentUid}
          name={name}
          variant={variant}
          fluid
          recruitmentLabel={unit.assist ? "조력자" : undefined}
        />
      </li>
    );
  };
  const renderSlot = (slot: number) => {
    const unit = unitsBySlot.get(slot);
    return unit ? renderThumb(unit) : <EmptyPartySlot key={slot} className={partySlotWidthClassName} />;
  };
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-lg border border-v2-divider p-3.5">
      <h3 className="text-sm font-semibold text-v2-fg">{title}</h3>
      <PartySlotGroups
        strikers={slots.filter((slot) => slot < RAID_RECORD_LIMITS.strikerSlots).map(renderSlot)}
        specials={slots.filter((slot) => slot >= RAID_RECORD_LIMITS.strikerSlots).map(renderSlot)}
      />
      <PartyGrowthReadOnlyTable units={party.units} title={title} studentsByUid={studentsByUid} />
    </section>
  );
}
