import type { RaidRecordSnapshotField } from "~/domain/raid-record";
import { splitVisibleStudentName } from "../students/split-student-name";

export type RaidPartyStudent = {
  uid: string;
  name: string;
  // Other names the student goes by, which the search also matches.
  altNames: string[];
  role: "striker" | "special";
  initialTier: number;
  equipmentSlots: number;
};

// "시로코*테러" reads as "시로코(테러)", as the other v2 pickers show it.
export function formatRaidStudentName(rawName: string): string {
  const { name, variant } = splitVisibleStudentName(rawName);
  return variant ? `${name}(${variant})` : name;
}

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
