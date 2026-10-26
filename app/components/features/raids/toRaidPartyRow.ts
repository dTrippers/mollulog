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
  /** Set for records of a student with several forms. Ownership and statistics belong to the representative. */
  primaryUid?: string;
  formIndex?: number;
};

export type RaidPartyStudentMap = Record<string, RaidPartyStudentInfo>;

type RaidPartyStudentSource = Pick<RaidPartyStudentInfo, "name" | "attackType" | "defenseType" | "role">;

/**
 * Builds the student lookup for party slots. Party records name the exact form that was deployed, so every form
 * record is included with its representative and form number.
 */
export function buildRaidPartyStudentMap(
  students: Record<string, RaidPartyStudentSource>,
  forms: Record<string, RaidPartyStudentSource & { primaryUid: string; formIndex: number }>,
): RaidPartyStudentMap {
  const studentMap: RaidPartyStudentMap = {};
  for (const [uid, { name, attackType, defenseType, role }] of Object.entries(students)) {
    studentMap[uid] = { name, attackType, defenseType, role };
  }
  for (const [uid, { name, attackType, defenseType, role, primaryUid, formIndex }] of Object.entries(forms)) {
    studentMap[uid] = { name, attackType, defenseType, role, primaryUid, formIndex };
  }
  return studentMap;
}

/** Whether statistics keyed by this UID belong to a listed student rather than to one of its other forms. */
export function isRepresentativeStudent(uid: string, student: RaidPartyStudentInfo | undefined): boolean {
  return student !== undefined && (student.primaryUid === undefined || student.primaryUid === uid);
}

export function isRecruitedStudent(
  uid: string,
  student: RaidPartyStudentInfo | undefined,
  recruitedStudentTiers: Record<string, number>,
): boolean {
  return recruitedStudentTiers[student?.primaryUid ?? uid] !== undefined;
}

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
  showLevel = true,
}: {
  party: ParsedRaidRankDocument["parties"][number];
  allStudents: RaidPartyStudentMap;
  maxLevel: number;
  recruitedStudentTiers?: Record<string, number>;
  showUnrecruitedStudents?: boolean;
  showLevel?: boolean;
}): RaidPartyRow {
  return {
    key: `party-${party.partyIndex}`,
    label: `${party.partyIndex + 1}편성`,
    slots: party.slots.map(({ studentUid, tier, level, isAssist, startingSkillOrder }) => {
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
        !isRecruitedStudent(studentUid, student, recruitedStudentTiers);

      return {
        uid: studentUid,
        name: student.name,
        attackType: student.attackType,
        defenseType: student.defenseType,
        role: student.role,
        tier,
        level: showLevel && level && level < maxLevel ? level : undefined,
        startingSkillOrder,
        formIndex: student.formIndex,
        isAssist,
        grayscale: isUnrecruited,
        unrecruited: isUnrecruited,
      };
    }),
  };
}
