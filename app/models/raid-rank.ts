import type { DefenseType, RaidType } from "./content.d";

/**
 * Decode a single encoded slot string to slot object
 * Format: "AAAAABBCD" where:
 * - AAAAA = studentUid (5 characters)
 * - BB = level (hex, 2 characters)
 * - C = tier (hex, 1 character)
 * - D = isAssist ("1"/"0", 1 character)
 * Empty string means empty slot
 */
export function decodeSlotString(encodedSlot: string, slotIndex: number): {
  slotIndex: number;
  tier: number | null;
  level: number | null;
  isAssist: boolean | null;
  studentUid: string | null;
} {
  if (!encodedSlot || encodedSlot.length === 0) {
    return {
      slotIndex,
      tier: null,
      level: null,
      isAssist: null,
      studentUid: null,
    };
  }

  if (encodedSlot.length !== 9) {
    throw new Error(`Invalid slot encoding: expected 9 characters, got ${encodedSlot.length}`);
  }

  const studentUid = encodedSlot.substring(0, 5);
  const levelHex = encodedSlot.substring(5, 7);
  const tierHex = encodedSlot.substring(7, 8);
  const isAssistStr = encodedSlot.substring(8, 9);

  const level = Number.parseInt(levelHex, 16);
  const tier = Number.parseInt(tierHex, 16);
  const isAssist = isAssistStr === "1";
  return {
    slotIndex,
    tier: isNaN(tier) ? null : tier,
    level: isNaN(level) ? null : level,
    isAssist,
    studentUid: studentUid || null,
  };
}

/**
 * Encode raid rank components into numeric ID string
 * Format: ABBBCDDDDD
 *   A = raidType (1 = total_assault | 2 = elimination | 3 = unlimit)
 *   BBB = seasonIndex (1-999)
 *   C = defenseType (1 = light | 2 = heavy | 3 = special | 4 = elastic)
 *   DDDDD = rank (1-20000)
 */
const raidTypeCodeMap: Record<RaidType, number> = {
  total_assault: 1,
  elimination: 2,
  unlimit: 3,
};

const defenseTypeCodeMap: Record<DefenseType, number> = {
  light: 1,
  heavy: 2,
  special: 3,
  elastic: 4,
};

export function raidRankIdPrefix(raidType: RaidType, seasonIndex: number, defenseType: DefenseType): number {
  return raidTypeCodeMap[raidType] * 10000 + seasonIndex * 10 + defenseTypeCodeMap[defenseType];
}

export function encodeRaidRankId(raidType: RaidType, seasonIndex: number, defenseType: DefenseType, rank: number): number {
  return raidRankIdPrefix(raidType, seasonIndex, defenseType) * 100000 + rank;
}
