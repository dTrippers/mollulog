import { ResourceTypeEnum } from "~/graphql/graphql";
import type { GrowthResourceRepository } from "~/repositories/growth-resource";
import type { StudentMap } from "./student";

export type GrowthResourceSource = "level" | "skill" | "equipment" | "tier" | "gear" | "relationship";

export type GrowthResourceItem = {
  uid: string;
  type: ResourceTypeEnum;
  rarity: number;
  amount: number;
  name?: string;
  category?: string | null;
  subCategory?: string | null;
  source: GrowthResourceSource;
};

export type StudentGrowthResourceRequirements = {
  items: GrowthResourceItem[];
  characterExp: number;
  skillUnavailable: boolean;
};

export type RelationshipGiftResourceInput = {
  items: Record<string, number>;
};

export type RelationshipGiftResourceMetadata = {
  uid: string;
  name?: string;
  rarity: number;
  type: ResourceTypeEnum;
  category?: string | null;
  subCategory?: string | null;
};

export type AggregatedGrowthResourceRequirements = {
  items: GrowthResourceItem[];
  characterExp: number;
  skillUnavailable: boolean;
};

export type GrowthResourceStudentInput = {
  uid: string;
  isRecruited?: boolean;
  hasGear?: boolean;
  initialTier: number;
  tier: number | null;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  targetLevel: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  targetTier: number | null;
};

type MutableRequirements = {
  items: Map<string, GrowthResourceItem>;
  characterExp: number;
  skillUnavailable: boolean;
};

type SkillCostItem = {
  amount: number;
  item: {
    uid: string;
    rarity: number;
  };
};

type SkillCostLevelKey =
  | "ex2"
  | "ex3"
  | "ex4"
  | "ex5"
  | "normal2"
  | "normal3"
  | "normal4"
  | "normal5"
  | "normal6"
  | "normal7"
  | "normal8"
  | "normal9";

export type SkillCostStudent = {
  uid: string;
} & Partial<Record<SkillCostLevelKey, SkillCostItem[]>>;

export type ItemMetadata = {
  uid: string;
  name: string;
  rarity: number;
  type: ResourceTypeEnum;
  category?: string | null;
  subCategory?: string | null;
};

export type EquipmentMetadata = {
  uid: string;
  name: string;
  rarity: number;
  type: ResourceTypeEnum;
  category?: string | null;
};

export type StudentGearData = {
  name: string;
  growthItems: {
    gearTier: number;
    amount: number;
    item: ItemMetadata;
  }[];
};

type GearCostStudent = {
  uid: string;
  gear: {
    name: string;
    growthItems: StudentGearData["growthItems"];
  } | null;
};

const CHARACTER_TOTAL_EXP_BY_LEVEL: Record<number, number> = {
  1: 0,
  2: 10,
  3: 35,
  4: 75,
  5: 130,
  6: 200,
  7: 275,
  8: 355,
  9: 445,
  10: 540,
  11: 645,
  12: 760,
  13: 890,
  14: 1035,
  15: 1195,
  16: 1370,
  17: 1555,
  18: 1755,
  19: 1970,
  20: 2200,
  21: 2585,
  22: 3010,
  23: 3490,
  24: 4025,
  25: 4605,
  26: 5240,
  27: 6025,
  28: 6870,
  29: 7765,
  30: 8690,
  31: 9665,
  32: 10675,
  33: 11770,
  34: 12935,
  35: 14185,
  36: 15520,
  37: 16945,
  38: 18490,
  39: 20115,
  40: 21800,
  41: 23535,
  42: 25335,
  43: 27310,
  44: 29475,
  45: 31845,
  46: 34430,
  47: 37245,
  48: 40310,
  49: 43650,
  50: 47295,
  51: 51280,
  52: 55645,
  53: 60435,
  54: 65700,
  55: 71495,
  56: 77880,
  57: 84920,
  58: 92685,
  59: 101250,
  60: 110695,
  61: 121105,
  62: 132570,
  63: 145185,
  64: 159050,
  65: 174270,
  66: 190955,
  67: 209220,
  68: 229185,
  69: 250975,
  70: 274720,
  71: 300420,
  72: 328075,
  73: 357685,
  74: 389250,
  75: 422770,
  76: 458245,
  77: 495675,
  78: 535060,
  79: 574445,
  80: 613830,
  81: 653215,
  82: 692600,
  83: 731985,
  84: 771370,
  85: 814665,
  86: 866930,
  87: 936130,
  88: 1020550,
  89: 1123540,
  90: 1249185,
};

export const CHARACTER_EXP_REPORTS = [
  { uid: "13", exp: 10000, rarity: 4 },
  { uid: "12", exp: 2000, rarity: 3 },
  { uid: "11", exp: 500, rarity: 2 },
  { uid: "10", exp: 50, rarity: 1 },
] as const;

const EQUIPMENT_BLUEPRINT_BASE_UID = {
  hat: 100999,
  gloves: 101999,
  shoes: 102999,
  bag: 103999,
  badge: 104999,
  hairpin: 105999,
  charm: 106999,
  watch: 107999,
  necklace: 108999,
} as const;

export const EQUIPMENT_BLUEPRINT_CHOICE_BOX_UID_BY_TIER: Record<number, string> = {
  2: "150028",
  3: "150029",
  4: "150030",
  5: "150031",
  6: "150032",
  7: "150033",
  8: "150041",
  9: "150045",
  10: "150048",
};

const EQUIPMENT_BLUEPRINT_CHOICE_BOX_TIER_BY_UID = Object.fromEntries(
  Object.entries(EQUIPMENT_BLUEPRINT_CHOICE_BOX_UID_BY_TIER).map(([tier, uid]) => [uid, Number(tier)]),
) as Record<string, number>;

export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  hat: "모자",
  gloves: "장갑",
  shoes: "신발",
  bag: "가방",
  badge: "배지",
  hairpin: "헤어핀",
  charm: "부적",
  watch: "시계",
  necklace: "목걸이",
};

const EQUIPMENT_UID_PREFIX_TO_TYPE = Object.fromEntries(
  Object.entries(EQUIPMENT_BLUEPRINT_BASE_UID).map(([type, baseUid]) => [Math.floor(baseUid / 1000) + 1, type]),
) as Record<number, string>;

export function getEquipmentTypeKey(uid: string): string | null {
  const prefix = Math.floor(Number(uid) / 1000);
  return EQUIPMENT_UID_PREFIX_TO_TYPE[prefix] ?? null;
}

export function getEquipmentTier(uid: string): number {
  return (Number(uid) % 1000) + 1;
}

export function getEquipmentTierLabel(uid: string): string | null {
  if (getEquipmentTypeKey(uid) === null) {
    return null;
  }

  return `T${getEquipmentTier(uid)}`;
}

export function getEquipmentResourceTierLabel(uid: string): string | null {
  const equipmentTierLabel = getEquipmentTierLabel(uid);
  if (equipmentTierLabel !== null) {
    return equipmentTierLabel;
  }

  const choiceBoxTier = getEquipmentBlueprintChoiceBoxTier(uid);
  return choiceBoxTier === null ? null : `T${choiceBoxTier}`;
}

export function getEquipmentBlueprintChoiceBoxTier(uid: string): number | null {
  return EQUIPMENT_BLUEPRINT_CHOICE_BOX_TIER_BY_UID[uid] ?? null;
}

export function getEquipmentBlueprintChoiceBoxUid(tier: number): string | null {
  return EQUIPMENT_BLUEPRINT_CHOICE_BOX_UID_BY_TIER[tier] ?? null;
}

export type EquipmentTierCoverage = {
  tier: number;
  requiredAmount: number;
  directOwnedAmount: number;
  directDeficit: number;
  choiceBoxUid: string;
  choiceBoxQuantity: number;
  finalDeficit: number;
};

type EquipmentCoverageItem = Pick<GrowthResourceItem, "uid" | "type" | "amount"> &
  Partial<Pick<GrowthResourceItem, "source">>;

const EQUIPMENT_TIER_RECIPE: Record<number, readonly { tier: number; amount: number }[]> = {
  2: [{ tier: 2, amount: 15 }],
  3: [{ tier: 3, amount: 20 }],
  4: [
    { tier: 4, amount: 30 },
    { tier: 2, amount: 10 },
  ],
  5: [
    { tier: 5, amount: 35 },
    { tier: 3, amount: 20 },
    { tier: 2, amount: 15 },
  ],
  6: [
    { tier: 6, amount: 40 },
    { tier: 4, amount: 15 },
    { tier: 3, amount: 5 },
  ],
  7: [
    { tier: 7, amount: 40 },
    { tier: 5, amount: 15 },
    { tier: 4, amount: 5 },
  ],
  8: [
    { tier: 8, amount: 40 },
    { tier: 6, amount: 15 },
    { tier: 5, amount: 5 },
  ],
  9: [
    { tier: 9, amount: 50 },
    { tier: 7, amount: 15 },
    { tier: 6, amount: 10 },
  ],
  10: [
    { tier: 10, amount: 60 },
    { tier: 8, amount: 20 },
    { tier: 7, amount: 10 },
  ],
};

const EX_SKILL_LEVELS = [2, 3, 4, 5] as const;
const NORMAL_SKILL_LEVELS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

// BAQL currently omits non-EX level 10 materials. Public references indicate 9->10 uses Secret Tech Sheet.
const SECRET_TECH_SHEET = {
  uid: "9998",
  rarity: 4,
};

const TIER_UP_ELEPH_REQUIREMENTS: Record<number, number> = {
  2: 30,
  3: 80,
  4: 100,
  5: 120,
  6: 0,
  7: 120,
  8: 180,
  9: 200,
};

export async function getStudentGrowthResourceRequirements(
  repository: GrowthResourceRepository,
  students: GrowthResourceStudentInput[],
  allStudentsMap: StudentMap,
  studentGearDataMap: Map<string, StudentGearData | null>,
): Promise<Record<string, StudentGrowthResourceRequirements>> {
  const normalizedStudents = students.map(normalizeStudentGrowthInputForCalculation);
  const requirements = students.reduce(
    (acc, student) => {
      acc[student.uid] = { items: new Map<string, GrowthResourceItem>(), characterExp: 0, skillUnavailable: false };
      return acc;
    },
    {} as Record<string, MutableRequirements>,
  );

  for (const student of normalizedStudents) {
    addItems(requirements[student.uid], calculateTierResourceItems(student));
    requirements[student.uid].characterExp += calculateLevelRequiredExp(student);
    addItems(
      requirements[student.uid],
      calculateEquipmentResourceItems(student, allStudentsMap[student.uid]?.equipments ?? []),
    );
    addItems(
      requirements[student.uid],
      calculateGearResourceItems(student, studentGearDataMap.get(student.uid) ?? null),
    );
  }

  const studentsNeedingSkillCosts = normalizedStudents.filter(needsSkillResources);
  if (studentsNeedingSkillCosts.length > 0) {
    try {
      const skillCostMap = await repository.getSkillCosts(studentsNeedingSkillCosts.map(({ uid }) => uid));
      for (const student of studentsNeedingSkillCosts) {
        const skillCost = skillCostMap.get(student.uid);
        if (!skillCost) {
          requirements[student.uid].skillUnavailable = true;
          continue;
        }

        addItems(requirements[student.uid], calculateSkillResourceItems(student, skillCost));
      }
    } catch {
      for (const student of studentsNeedingSkillCosts) {
        requirements[student.uid].skillUnavailable = true;
      }
    }
  }

  try {
    const itemUids = new Set<string>();
    const equipmentUids = new Set<string>();
    for (const requirement of Object.values(requirements)) {
      for (const item of requirement.items.values()) {
        if (item.source === "equipment") {
          equipmentUids.add(item.uid);
          continue;
        }
        itemUids.add(item.uid);
      }
    }

    // TODO: Remove this metadata enrichment pass once item/equipment metadata is sourced from browser-local data.
    const [itemMetadataMap, equipmentMetadataMap] = await Promise.all([
      repository.getItemMetadata([...itemUids]),
      repository.getEquipmentMetadata([...equipmentUids]),
    ]);

    for (const requirement of Object.values(requirements)) {
      applyItemMetadata(requirement.items, itemMetadataMap);
      applyEquipmentMetadata(requirement.items, equipmentMetadataMap);
    }
  } catch {
    // Keep quantities visible even if BAQL item metadata cannot be loaded.
  }

  return Object.fromEntries(
    Object.entries(requirements).map(([studentUid, requirement]) => [
      studentUid,
      {
        items: sortGrowthResourceItems(Array.from(requirement.items.values())),
        characterExp: requirement.characterExp,
        skillUnavailable: requirement.skillUnavailable,
      },
    ]),
  );
}

export function calculateCharacterExpDifference(currentLevel: number, targetLevel: number): number {
  const currentTotalExp = CHARACTER_TOTAL_EXP_BY_LEVEL[currentLevel];
  const targetTotalExp = CHARACTER_TOTAL_EXP_BY_LEVEL[targetLevel];
  if (currentTotalExp == null || targetTotalExp == null) {
    return 0;
  }
  return Math.max(0, targetTotalExp - currentTotalExp);
}

export function calculateLevelRequiredExp(student: Pick<GrowthResourceStudentInput, "level" | "targetLevel">): number {
  if (student.level == null || student.targetLevel == null || student.targetLevel <= student.level) {
    return 0;
  }

  return calculateCharacterExpDifference(student.level, student.targetLevel);
}

export function breakdownCharacterExpToBooks(exp: number): GrowthResourceItem[] {
  if (exp <= 0) {
    return [];
  }

  const bestCounts = findBestExpBookCounts(exp);
  const resources: GrowthResourceItem[] = [];
  for (const [index, book] of CHARACTER_EXP_REPORTS.entries()) {
    const amount = bestCounts[index];
    if (amount <= 0) {
      continue;
    }

    resources.push({
      uid: book.uid,
      type: ResourceTypeEnum.Item,
      rarity: book.rarity,
      amount,
      source: "level",
    });
  }

  return resources;
}

export function calculateLevelResourceItems(
  student: Pick<GrowthResourceStudentInput, "level" | "targetLevel">,
): GrowthResourceItem[] {
  if (student.level == null || student.targetLevel == null || student.targetLevel <= student.level) {
    return [];
  }

  return breakdownCharacterExpToBooks(calculateLevelRequiredExp(student));
}

export function calculateTierResourceItems(
  student: Pick<GrowthResourceStudentInput, "uid" | "initialTier" | "tier" | "targetTier">,
): GrowthResourceItem[] {
  const currentTier = normalizeCurrentTierForCalculation(student);
  if (currentTier == null || student.targetTier == null || student.targetTier <= currentTier) {
    return [];
  }

  const requiredEleph = Math.max(
    0,
    calculateCumulativeTierEleph(student.initialTier, student.targetTier) -
      calculateCumulativeTierEleph(student.initialTier, currentTier),
  );
  if (requiredEleph <= 0) {
    return [];
  }

  return [
    {
      uid: student.uid,
      type: ResourceTypeEnum.Item,
      rarity: 1,
      amount: requiredEleph,
      source: "tier",
    },
  ];
}

export function calculateEquipmentResourceItems(
  student: Pick<
    GrowthResourceStudentInput,
    "equip1" | "targetEquip1" | "equip2" | "targetEquip2" | "equip3" | "targetEquip3"
  >,
  equipmentSlots: string[],
): GrowthResourceItem[] {
  const items = new Map<string, GrowthResourceItem>();

  accumulateEquipmentSlot(items, equipmentSlots[0], student.equip1, student.targetEquip1);
  accumulateEquipmentSlot(items, equipmentSlots[1], student.equip2, student.targetEquip2);
  accumulateEquipmentSlot(items, equipmentSlots[2], student.equip3, student.targetEquip3);

  return Array.from(items.values());
}

export function calculateEquipmentTierCoverage(
  requiredItems: EquipmentCoverageItem[],
  quantities: Record<string, number>,
): EquipmentTierCoverage[] {
  const coverageByTier = new Map<
    number,
    Pick<EquipmentTierCoverage, "tier" | "requiredAmount" | "directOwnedAmount" | "directDeficit" | "choiceBoxUid">
  >();

  for (const item of requiredItems) {
    if (!isEquipmentBlueprintRequirement(item)) {
      continue;
    }

    const tier = getEquipmentTier(item.uid);
    const choiceBoxUid = getEquipmentBlueprintChoiceBoxUid(tier);
    if (!choiceBoxUid) {
      continue;
    }

    const current = coverageByTier.get(tier) ?? {
      tier,
      requiredAmount: 0,
      directOwnedAmount: 0,
      directDeficit: 0,
      choiceBoxUid,
    };
    const requiredAmount = Math.max(0, item.amount);
    const ownedAmount = Math.max(0, quantities[item.uid] ?? 0);

    current.requiredAmount += requiredAmount;
    current.directOwnedAmount += ownedAmount;
    current.directDeficit += Math.max(0, requiredAmount - ownedAmount);
    coverageByTier.set(tier, current);
  }

  for (const [tier, choiceBoxUid] of Object.entries(EQUIPMENT_BLUEPRINT_CHOICE_BOX_UID_BY_TIER)) {
    const choiceBoxQuantity = Math.max(0, quantities[choiceBoxUid] ?? 0);
    if (choiceBoxQuantity <= 0 || coverageByTier.has(Number(tier))) {
      continue;
    }

    coverageByTier.set(Number(tier), {
      tier: Number(tier),
      requiredAmount: 0,
      directOwnedAmount: 0,
      directDeficit: 0,
      choiceBoxUid,
    });
  }

  return Array.from(coverageByTier.values())
    .map((coverage) => {
      const choiceBoxQuantity = Math.max(0, quantities[coverage.choiceBoxUid] ?? 0);
      return {
        ...coverage,
        choiceBoxQuantity,
        finalDeficit: Math.max(0, coverage.directDeficit - choiceBoxQuantity),
      };
    })
    .sort((a, b) => a.tier - b.tier);
}

export function calculateGearResourceItems(
  student: Pick<GrowthResourceStudentInput, "equipSpecial" | "targetEquipSpecial">,
  gearData: StudentGearData | null,
): GrowthResourceItem[] {
  if (
    !gearData ||
    student.equipSpecial == null ||
    student.targetEquipSpecial == null ||
    student.targetEquipSpecial <= student.equipSpecial
  ) {
    return [];
  }

  const items = new Map<string, GrowthResourceItem>();

  for (const growthItem of gearData.growthItems) {
    if (growthItem.gearTier <= student.equipSpecial || growthItem.gearTier > student.targetEquipSpecial) {
      continue;
    }

    const existing = items.get(growthItem.item.uid);
    if (existing) {
      existing.amount += growthItem.amount;
      continue;
    }

    items.set(growthItem.item.uid, {
      uid: growthItem.item.uid,
      type: growthItem.item.type,
      rarity: growthItem.item.rarity,
      amount: growthItem.amount,
      name: growthItem.item.name,
      category: growthItem.item.category ?? null,
      subCategory: growthItem.item.subCategory ?? null,
      source: "gear",
    });
  }

  return Array.from(items.values());
}

function calculateSkillResourceItems(
  student: GrowthResourceStudentInput,
  skillCost: SkillCostStudent,
): GrowthResourceItem[] {
  const items = new Map<string, GrowthResourceItem>();

  accumulateSkillRange(items, skillCost, "ex", student.skillEx, student.targetSkillEx);
  accumulateSkillRange(items, skillCost, "normal", student.skillNormal, student.targetSkillNormal);
  accumulateSkillRange(items, skillCost, "normal", student.skillEnhanced, student.targetSkillEnhanced);
  accumulateSkillRange(items, skillCost, "normal", student.skillSub, student.targetSkillSub);

  return Array.from(items.values());
}

function needsSkillResources(student: GrowthResourceStudentInput): boolean {
  return (
    hasTargetIncrease(student.skillEx, student.targetSkillEx) ||
    hasTargetIncrease(student.skillNormal, student.targetSkillNormal) ||
    hasTargetIncrease(student.skillEnhanced, student.targetSkillEnhanced) ||
    hasTargetIncrease(student.skillSub, student.targetSkillSub)
  );
}

function hasTargetIncrease(current: number | null, target: number | null): boolean {
  return current != null && target != null && target > current;
}

export function normalizeStudentGrowthInputForCalculation(
  student: GrowthResourceStudentInput,
): GrowthResourceStudentInput {
  const useMinimumCurrentGrowth = student.isRecruited === false;
  const hasGear = student.hasGear !== false;

  return {
    ...student,
    level: coerceCurrentGrowthValue(student.level, student.targetLevel, 1, useMinimumCurrentGrowth),
    skillEx: coerceCurrentGrowthValue(student.skillEx, student.targetSkillEx, 1, useMinimumCurrentGrowth),
    skillNormal: coerceCurrentGrowthValue(student.skillNormal, student.targetSkillNormal, 1, useMinimumCurrentGrowth),
    skillEnhanced: coerceCurrentGrowthValue(
      student.skillEnhanced,
      student.targetSkillEnhanced,
      1,
      useMinimumCurrentGrowth,
    ),
    skillSub: coerceCurrentGrowthValue(student.skillSub, student.targetSkillSub, 1, useMinimumCurrentGrowth),
    equip1: coerceCurrentGrowthValue(student.equip1, student.targetEquip1, 1, useMinimumCurrentGrowth),
    equip2: coerceCurrentGrowthValue(student.equip2, student.targetEquip2, 1, useMinimumCurrentGrowth),
    equip3: coerceCurrentGrowthValue(student.equip3, student.targetEquip3, 1, useMinimumCurrentGrowth),
    equipSpecial: hasGear
      ? coerceCurrentGrowthValue(student.equipSpecial, student.targetEquipSpecial, 1, useMinimumCurrentGrowth)
      : null,
    targetEquipSpecial: hasGear ? student.targetEquipSpecial : null,
  };
}

function coerceCurrentGrowthValue(
  current: number | null,
  target: number | null,
  minimum: number,
  forceMinimum: boolean,
): number | null {
  if (forceMinimum) {
    if (target == null) {
      return null;
    }
    return minimum;
  }

  if (current != null) {
    return current;
  }
  if (target == null) {
    return null;
  }
  return minimum;
}

function normalizeCurrentTierForCalculation(
  student: Pick<GrowthResourceStudentInput, "initialTier" | "tier" | "targetTier">,
): number | null {
  if (student.tier != null) {
    return student.tier;
  }
  if (student.targetTier == null) {
    return null;
  }
  return student.initialTier;
}

function addItems(requirement: MutableRequirements, items: GrowthResourceItem[]) {
  for (const item of items) {
    const existing = requirement.items.get(item.uid);
    if (existing) {
      existing.amount += item.amount;
      continue;
    }
    requirement.items.set(item.uid, { ...item });
  }
}

function isEquipmentBlueprintRequirement(
  item: Pick<GrowthResourceItem, "uid" | "type"> & Partial<Pick<GrowthResourceItem, "source">>,
): boolean {
  return (
    (item.source === "equipment" || item.type === ResourceTypeEnum.Equipment) && getEquipmentTypeKey(item.uid) !== null
  );
}

function accumulateEquipmentSlot(
  items: Map<string, GrowthResourceItem>,
  equipmentType: string | undefined,
  currentTier: number | null,
  targetTier: number | null,
) {
  if (!equipmentType || currentTier == null || targetTier == null || targetTier <= currentTier) {
    return;
  }

  const baseUid = EQUIPMENT_BLUEPRINT_BASE_UID[equipmentType as keyof typeof EQUIPMENT_BLUEPRINT_BASE_UID];
  if (!baseUid) {
    return;
  }

  for (let tier = currentTier + 1; tier <= targetTier; tier++) {
    const recipe = EQUIPMENT_TIER_RECIPE[tier];
    if (!recipe) {
      continue;
    }

    for (const ingredient of recipe) {
      const uid = String(baseUid + ingredient.tier);
      const existing = items.get(uid);
      if (existing) {
        existing.amount += ingredient.amount;
        continue;
      }

      items.set(uid, {
        uid,
        type: ResourceTypeEnum.Equipment,
        rarity: 1,
        amount: ingredient.amount,
        source: "equipment",
      });
    }
  }
}

function accumulateSkillRange(
  items: Map<string, GrowthResourceItem>,
  skillCost: SkillCostStudent,
  prefix: "ex" | "normal",
  currentLevel: number | null,
  targetLevel: number | null,
) {
  if (currentLevel == null || targetLevel == null || targetLevel <= currentLevel) {
    return;
  }

  const levels = prefix === "ex" ? EX_SKILL_LEVELS : NORMAL_SKILL_LEVELS;
  for (const level of levels) {
    if (level <= currentLevel || level > targetLevel) {
      continue;
    }

    const levelKey = `${prefix}${level}` as SkillCostLevelKey;
    const levelItems = skillCost[levelKey] ?? [];
    for (const levelItem of levelItems) {
      const existing = items.get(levelItem.item.uid);
      if (existing) {
        existing.amount += levelItem.amount;
        continue;
      }

      items.set(levelItem.item.uid, {
        uid: levelItem.item.uid,
        type: ResourceTypeEnum.Item,
        rarity: levelItem.item.rarity,
        amount: levelItem.amount,
        source: "skill",
      });
    }
  }

  if (prefix === "normal" && currentLevel < 10 && targetLevel >= 10) {
    const existing = items.get(SECRET_TECH_SHEET.uid);
    if (existing) {
      existing.amount += 1;
      return;
    }

    items.set(SECRET_TECH_SHEET.uid, {
      uid: SECRET_TECH_SHEET.uid,
      type: ResourceTypeEnum.Item,
      rarity: SECRET_TECH_SHEET.rarity,
      amount: 1,
      source: "skill",
    });
  }
}

function findBestExpBookCounts(exp: number): [number, number, number, number] {
  let best: {
    counts: [number, number, number, number];
    totalBooks: number;
    totalExp: number;
  } | null = null;

  const superiorMax = Math.ceil(exp / CHARACTER_EXP_REPORTS[0].exp);
  const advancedMax = Math.ceil(exp / CHARACTER_EXP_REPORTS[1].exp);

  for (let superior = 0; superior <= superiorMax; superior++) {
    for (let advanced = 0; advanced <= advancedMax; advanced++) {
      const expFromLargeBooks = superior * CHARACTER_EXP_REPORTS[0].exp + advanced * CHARACTER_EXP_REPORTS[1].exp;
      const remainingAfterLargeBooks = Math.max(0, exp - expFromLargeBooks);
      const normalBase = Math.floor(remainingAfterLargeBooks / CHARACTER_EXP_REPORTS[2].exp);

      for (const normal of new Set([normalBase, normalBase + 1])) {
        const expFromMidBooks = expFromLargeBooks + normal * CHARACTER_EXP_REPORTS[2].exp;
        const novice = expFromMidBooks >= exp ? 0 : Math.ceil((exp - expFromMidBooks) / CHARACTER_EXP_REPORTS[3].exp);
        const totalExp = expFromMidBooks + novice * CHARACTER_EXP_REPORTS[3].exp;
        const totalBooks = superior + advanced + normal + novice;

        if (!best || totalBooks < best.totalBooks || (totalBooks === best.totalBooks && totalExp < best.totalExp)) {
          best = {
            counts: [superior, advanced, normal, novice],
            totalBooks,
            totalExp,
          };
        }
      }
    }
  }

  return best?.counts ?? [0, 0, 0, 0];
}

export function calculateCumulativeTierEleph(initialTier: number, targetTier: number): number {
  if (targetTier <= initialTier) {
    return 0;
  }

  let total = 0;
  for (let tier = initialTier + 1; tier <= targetTier; tier++) {
    total += TIER_UP_ELEPH_REQUIREMENTS[tier] ?? 0;
  }
  return total;
}

function applyItemMetadata(items: Map<string, GrowthResourceItem>, metadataMap: Map<string, ItemMetadata>) {
  for (const item of items.values()) {
    const metadata = metadataMap.get(item.uid);
    if (!metadata) {
      continue;
    }

    item.name = metadata.name;
    item.rarity = metadata.rarity;
    item.type = metadata.type;
    item.category = metadata.category ?? null;
    item.subCategory = metadata.subCategory ?? null;
  }
}

function applyEquipmentMetadata(items: Map<string, GrowthResourceItem>, metadataMap: Map<string, EquipmentMetadata>) {
  for (const item of items.values()) {
    const metadata = metadataMap.get(item.uid);
    if (!metadata) {
      continue;
    }

    item.name = metadata.name;
    item.rarity = metadata.rarity;
    item.type = metadata.type;
    item.category = metadata.category ?? null;
    item.subCategory = null;
  }
}

export function sortGrowthResourceItems(items: GrowthResourceItem[]): GrowthResourceItem[] {
  return items.sort((a, b) => {
    const kindOrderA = getResourceKindOrder(a);
    const kindOrderB = getResourceKindOrder(b);
    const kindDelta = compareGrowthResourceKindOrder(kindOrderA, kindOrderB);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    const subKindDelta = getResourceWithinKindOrder(a, kindOrderA) - getResourceWithinKindOrder(b, kindOrderB);
    if (subKindDelta !== 0) {
      return subKindDelta;
    }

    if (shouldSortGrowthResourceKindByUid(kindOrderA) && shouldSortGrowthResourceKindByUid(kindOrderB)) {
      return compareUidAscending(a.uid, b.uid);
    }

    if (a.source === "equipment" && b.source === "equipment") {
      return Number(a.uid) - Number(b.uid);
    }

    if (a.rarity !== b.rarity) {
      return a.rarity - b.rarity;
    }

    return Number(a.uid) - Number(b.uid);
  });
}

export function aggregateGrowthResourceRequirements(
  requirements: StudentGrowthResourceRequirements[],
): AggregatedGrowthResourceRequirements {
  const aggregatedItems = new Map<string, GrowthResourceItem>();
  let characterExp = 0;

  for (const requirement of requirements) {
    characterExp += requirement.characterExp;
    for (const item of requirement.items) {
      const existing = aggregatedItems.get(item.uid);
      if (existing) {
        existing.amount += item.amount;
        existing.name ??= item.name;
        existing.category ??= item.category ?? null;
        existing.subCategory ??= item.subCategory ?? null;
        continue;
      }

      aggregatedItems.set(item.uid, { ...item });
    }
  }

  return {
    items: sortGrowthResourceItems(Array.from(aggregatedItems.values())),
    characterExp,
    skillUnavailable: requirements.some((requirement) => requirement.skillUnavailable),
  };
}

export function buildRelationshipGiftResourceRequirements(
  relationships: RelationshipGiftResourceInput[],
  metadata: RelationshipGiftResourceMetadata[],
): StudentGrowthResourceRequirements {
  const metadataByUid = new Map(metadata.map((item) => [item.uid, item]));
  const quantities = new Map<string, number>();

  for (const relationship of relationships) {
    for (const [itemUid, quantity] of Object.entries(relationship.items)) {
      if (!Number.isInteger(quantity) || quantity <= 0) {
        continue;
      }
      quantities.set(itemUid, (quantities.get(itemUid) ?? 0) + quantity);
    }
  }

  return {
    items: sortGrowthResourceItems(
      Array.from(quantities.entries()).map(([uid, amount]) => {
        const itemMetadata = metadataByUid.get(uid);
        return {
          uid,
          type: itemMetadata?.type ?? ResourceTypeEnum.Item,
          rarity: itemMetadata?.rarity ?? 1,
          amount,
          name: itemMetadata?.name,
          category: itemMetadata?.category ?? "favor",
          subCategory: itemMetadata?.subCategory ?? null,
          source: "relationship",
        };
      }),
    ),
    characterExp: 0,
    skillUnavailable: false,
  };
}

export const GROWTH_RESOURCE_KIND_ORDER = {
  eleph: 0,
  characterExp: 1,
  bd: 2,
  techNote: 3,
  favor: 4,
  artifact: 5,
  equipment: 6,
  other: 7,
} as const;

export type GrowthResourceKindOrder =
  (typeof GROWTH_RESOURCE_KIND_ORDER)[keyof typeof GROWTH_RESOURCE_KIND_ORDER];

export const GROWTH_RESOURCE_KIND_LABELS: Record<number, string> = {
  [GROWTH_RESOURCE_KIND_ORDER.eleph]: "엘레프",
  [GROWTH_RESOURCE_KIND_ORDER.characterExp]: "활동 보고서",
  [GROWTH_RESOURCE_KIND_ORDER.bd]: "BD",
  [GROWTH_RESOURCE_KIND_ORDER.techNote]: "기술 노트",
  [GROWTH_RESOURCE_KIND_ORDER.favor]: "선물",
  [GROWTH_RESOURCE_KIND_ORDER.artifact]: "오파츠",
  [GROWTH_RESOURCE_KIND_ORDER.equipment]: "장비 설계도",
  [GROWTH_RESOURCE_KIND_ORDER.other]: "기타",
} satisfies Record<GrowthResourceKindOrder, string>;

const GROWTH_RESOURCE_KIND_DISPLAY_ORDER = [
  GROWTH_RESOURCE_KIND_ORDER.characterExp,
  GROWTH_RESOURCE_KIND_ORDER.artifact,
  GROWTH_RESOURCE_KIND_ORDER.bd,
  GROWTH_RESOURCE_KIND_ORDER.techNote,
  GROWTH_RESOURCE_KIND_ORDER.favor,
  GROWTH_RESOURCE_KIND_ORDER.eleph,
  GROWTH_RESOURCE_KIND_ORDER.equipment,
  GROWTH_RESOURCE_KIND_ORDER.other,
] as const;

export function compareGrowthResourceKindOrder(a: number, b: number): number {
  return getGrowthResourceKindDisplayOrder(a) - getGrowthResourceKindDisplayOrder(b);
}

export function shouldSortGrowthResourceKindByUid(kindOrder: number): boolean {
  return (
    kindOrder === GROWTH_RESOURCE_KIND_ORDER.bd ||
    kindOrder === GROWTH_RESOURCE_KIND_ORDER.techNote ||
    kindOrder === GROWTH_RESOURCE_KIND_ORDER.artifact
  );
}

export function getResourceKindOrder(item: GrowthResourceItem): number {
  const itemUid = Number(item.uid);

  if (item.source === "tier") {
    return GROWTH_RESOURCE_KIND_ORDER.eleph;
  }

  if (getEquipmentBlueprintChoiceBoxTier(item.uid) !== null) {
    return GROWTH_RESOURCE_KIND_ORDER.equipment;
  }

  if (item.category === "character_exp_growth" || isUidInRange(itemUid, 10, 13)) {
    return GROWTH_RESOURCE_KIND_ORDER.characterExp;
  }

  if (item.subCategory === "cd_item" || isUidInRange(itemUid, 3000, 3999)) {
    return GROWTH_RESOURCE_KIND_ORDER.bd;
  }

  if (
    item.subCategory === "book_item" ||
    item.uid === "9998" ||
    item.uid === "9999" ||
    isUidInRange(itemUid, 4000, 4999)
  ) {
    return GROWTH_RESOURCE_KIND_ORDER.techNote;
  }

  if (item.category === "favor") {
    return GROWTH_RESOURCE_KIND_ORDER.favor;
  }

  if (item.subCategory === "artifact") {
    return GROWTH_RESOURCE_KIND_ORDER.artifact;
  }

  if (item.source === "equipment" || item.type === ResourceTypeEnum.Equipment) {
    return GROWTH_RESOURCE_KIND_ORDER.equipment;
  }

  if (item.source === "gear") {
    return GROWTH_RESOURCE_KIND_ORDER.favor;
  }

  if (item.source === "relationship") {
    return GROWTH_RESOURCE_KIND_ORDER.favor;
  }

  if (item.source === "skill") {
    return GROWTH_RESOURCE_KIND_ORDER.artifact;
  }

  return GROWTH_RESOURCE_KIND_ORDER.other;
}

function getResourceWithinKindOrder(item: GrowthResourceItem, kindOrder: number): number {
  const itemUid = Number(item.uid);

  if (kindOrder === GROWTH_RESOURCE_KIND_ORDER.techNote) {
    if (item.subCategory === "book_item" || isUidInRange(itemUid, 4000, 4999)) {
      return 0;
    }
    if (item.uid === "9998" || item.uid === "9999") {
      return 1;
    }
  }

  return 0;
}

function isUidInRange(uid: number, start: number, end: number): boolean {
  return Number.isFinite(uid) && uid >= start && uid <= end;
}

function getGrowthResourceKindDisplayOrder(kindOrder: number): number {
  const index = GROWTH_RESOURCE_KIND_DISPLAY_ORDER.indexOf(kindOrder as GrowthResourceKindOrder);
  return index === -1 ? GROWTH_RESOURCE_KIND_DISPLAY_ORDER.length : index;
}

function compareUidAscending(a: string, b: string): number {
  return Number(a) - Number(b);
}
