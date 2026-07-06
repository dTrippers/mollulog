import type { Attack, Defense } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { ParsedRaidRankDocument } from "~/lib/ranks/ranks";
import type { Role } from "~/models/content.d";
import type { RaidPartyRow } from "./RaidPartyCard";

export type RaidPartyStudentInfo = {
  name: string;
  attackType: Attack;
  defenseType: Defense;
  role: Role;
};

export type RaidPartyStudentMap = Record<string, RaidPartyStudentInfo>;

const maximumLevels: Record<string, number> = {
  "2021-11-09": 70,
  "2022-03-22": 73,
  "2022-05-17": 75,
  "2022-09-06": 78,
  "2022-12-20": 80,
  "2023-03-28": 83,
  "2023-07-25": 85,
  "2024-01-30": 88,
  "2024-07-23": 90,
};

export function getMaxLevelAt(date: UtcIsoString | Date): number {
  const targetDate = date instanceof Date ? date : new Date(date);
  const dates = Object.keys(maximumLevels).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (targetDate >= new Date(dates[i])) {
      return maximumLevels[dates[i]];
    }
  }
  return 70;
}

export function toRaidPartyRow({
  party,
  allStudents,
  maxLevel,
  recruitedStudentTiers,
  showUnrecruitedStudents = false,
}: {
  party: ParsedRaidRankDocument["parties"][number];
  allStudents: RaidPartyStudentMap;
  maxLevel: number;
  recruitedStudentTiers?: Record<string, number>;
  showUnrecruitedStudents?: boolean;
}): RaidPartyRow {
  return {
    key: `party-${party.partyIndex}`,
    label: `${party.partyIndex + 1}편성`,
    slots: party.slots.map(({ studentUid, tier, level, isAssist }) => {
      if (!studentUid) {
        return { uid: null };
      }

      const student = allStudents[studentUid];
      if (!student) {
        return { uid: null };
      }

      const isUnrecruited =
        showUnrecruitedStudents &&
        recruitedStudentTiers !== undefined &&
        recruitedStudentTiers[studentUid] === undefined;

      return {
        uid: studentUid,
        name: student.name,
        attackType: student.attackType,
        defenseType: student.defenseType,
        role: student.role,
        tier,
        level: level && level < maxLevel ? level : undefined,
        isAssist,
        grayscale: isUnrecruited,
        unrecruited: isUnrecruited,
      };
    }),
  };
}
