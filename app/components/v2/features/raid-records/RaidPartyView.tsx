import type { RaidRecordParty } from "~/domain/raid-record";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { PartyGrowthReadOnlyTable } from "./PartyGrowthTable";
import { PartySlotGroups } from "./PartySlotGroups";
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
  const strikers = party.units.filter((unit) => unit.slot < 4);
  const specials = party.units.filter((unit) => unit.slot >= 4);
  const renderThumb = (unit: RaidRecordParty["units"][number]) => {
    const student = studentsByUid.get(unit.studentUid);
    const { name, variant } = splitVisibleStudentName(student?.name ?? "알 수 없는 학생");
    return (
      <li key={unit.slot} className="w-10 sm:w-16">
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
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-lg border border-v2-divider p-3.5">
      <h3 className="text-sm font-semibold text-v2-fg">{title}</h3>
      <PartySlotGroups strikers={strikers.map(renderThumb)} specials={specials.map(renderThumb)} />
      <PartyGrowthReadOnlyTable units={party.units} title={title} studentsByUid={studentsByUid} />
    </section>
  );
}
