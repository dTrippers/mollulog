import {
  addGrowthResourceItemToMap,
  calculateAbilityReleaseRequirements,
  calculateEquipmentResourceItems,
  calculateGearResourceItems,
  calculateLevelRequiredExp,
  calculateSkillResourceItems,
  calculateTierResourceItems,
  type GrowthResourceItem,
  type GrowthResourceStudentInput,
  type ItemMetadata,
  needsSkillResources,
  normalizeStudentGrowthInputForCalculation,
  type SkillCostStudent,
  type StudentGearData,
  type StudentGrowthResourceRequirements,
  sortGrowthResourceItems,
} from "~/domain/growth-resource";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, cacheQuery, fetchLazySourceCachedBatch } from "~/lib/cache";
import { getItemCatalogResourceMap } from "./item-catalog";
import type { StudentMap } from "./student";

const STUDENT_GEAR_DATA_TTL = 24 * 60 * 60;
const STUDENT_GROWTH_SKILL_COST_TTL = 7 * 24 * 60 * 60;

const skillCostQuery = graphql(`
  query GrowthSkillCosts($uids: [String!]) {
    students(uids: $uids) {
      uid
      ex2: skillItems(skillType: ex, skillLevel: 2) { amount item { uid rarity ... on Item { category subCategory } } }
      ex3: skillItems(skillType: ex, skillLevel: 3) { amount item { uid rarity ... on Item { category subCategory } } }
      ex4: skillItems(skillType: ex, skillLevel: 4) { amount item { uid rarity ... on Item { category subCategory } } }
      ex5: skillItems(skillType: ex, skillLevel: 5) { amount item { uid rarity ... on Item { category subCategory } } }
      normal2: skillItems(skillType: normal, skillLevel: 2) { amount item { uid rarity ... on Item { category subCategory } } }
      normal3: skillItems(skillType: normal, skillLevel: 3) { amount item { uid rarity ... on Item { category subCategory } } }
      normal4: skillItems(skillType: normal, skillLevel: 4) { amount item { uid rarity ... on Item { category subCategory } } }
      normal5: skillItems(skillType: normal, skillLevel: 5) { amount item { uid rarity ... on Item { category subCategory } } }
      normal6: skillItems(skillType: normal, skillLevel: 6) { amount item { uid rarity ... on Item { category subCategory } } }
      normal7: skillItems(skillType: normal, skillLevel: 7) { amount item { uid rarity ... on Item { category subCategory } } }
      normal8: skillItems(skillType: normal, skillLevel: 8) { amount item { uid rarity ... on Item { category subCategory } } }
      normal9: skillItems(skillType: normal, skillLevel: 9) { amount item { uid rarity ... on Item { category subCategory } } }
    }
  }
`);

const gearCostQuery = graphql(`
  query GrowthStudentGears($uids: [String!]) {
    students(uids: $uids) {
      uid
      gear {
        name
        growthItems {
          gearTier
          amount
          item {
            uid name rarity type
            ... on Item { category subCategory }
          }
        }
      }
    }
  }
`);

export async function getStudentSkillCosts(
  env: Env,
  studentUids: string[],
  forceRefresh = false,
): Promise<Map<string, SkillCostStudent>> {
  const uniqueStudentUids = [...new Set(studentUids)].sort();
  if (uniqueStudentUids.length === 0) {
    return new Map();
  }

  return fetchLazySourceCachedBatch(
    env,
    uniqueStudentUids.map((uid) => ({ key: uid, dataKey: buildStudentGrowthSkillCostCacheKey(uid) })),
    fetchStudentSkillCostsFromBaql,
    STUDENT_GROWTH_SKILL_COST_TTL,
    forceRefresh,
  );
}

function buildStudentGrowthSkillCostCacheKey(uid: string): string {
  return cacheKey("source", "student-growth-skill-cost", 1, cacheQuery({ uid }));
}

async function fetchStudentSkillCostsFromBaql(studentUids: string[]): Promise<Map<string, SkillCostStudent>> {
  const { data, error } = await runQuery(skillCostQuery, { uids: studentUids });
  if (error) {
    throw error;
  }

  const students = data?.students ?? [];
  const skillCosts = new Map<string, SkillCostStudent>(
    students.map((student) => {
      const { __typename: _typename, ...skillCost } = student;
      return [student.uid, skillCost satisfies SkillCostStudent];
    }),
  );

  for (const uid of studentUids) {
    if (!skillCosts.has(uid)) {
      skillCosts.set(uid, { uid });
    }
  }

  return skillCosts;
}

export async function getStudentGearData(
  env: Env,
  studentUids: string[],
  forceRefresh = false,
): Promise<Map<string, StudentGearData | null>> {
  const uniqueStudentUids = [...new Set(studentUids)].sort();
  if (uniqueStudentUids.length === 0) {
    return new Map();
  }

  return fetchLazySourceCachedBatch(
    env,
    uniqueStudentUids.map((uid) => ({ key: uid, dataKey: buildStudentGearDataCacheKey(uid) })),
    async (missingUids) => {
      const fetchedMap = new Map(await fetchStudentGearDataFromBaql(missingUids));
      for (const uid of missingUids) {
        if (!fetchedMap.has(uid)) {
          fetchedMap.set(uid, null);
        }
      }
      return fetchedMap;
    },
    STUDENT_GEAR_DATA_TTL,
    forceRefresh,
  );
}

async function fetchStudentGearDataFromBaql(studentUids: string[]): Promise<Array<[string, StudentGearData | null]>> {
  const { data, error } = await runQuery(gearCostQuery, { uids: studentUids });
  if (error) {
    throw error;
  }

  const students = data?.students ?? [];
  return students.map((student): [string, StudentGearData | null] => [
    student.uid,
    student.gear
      ? {
          name: student.gear.name.replaceAll("\n", " ").trim(),
          growthItems: student.gear.growthItems.map((growthItem) => ({
            gearTier: growthItem.gearTier,
            amount: growthItem.amount,
            item: {
              ...growthItem.item,
              name: growthItem.item.name.replaceAll("\n", " ").trim(),
            } satisfies ItemMetadata,
          })),
        }
      : null,
  ]);
}

function buildStudentGearDataCacheKey(uid: string): string {
  return cacheKey("source", "student-gear-data", 1, cacheQuery({ uid }));
}

type MutableRequirements = {
  items: Map<string, GrowthResourceItem>;
  characterExp: number;
  credit: number;
  skillUnavailable: boolean;
};

type GrowthResourceLogger = {
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
};

type GrowthResourceCalculationOptions = {
  logger?: GrowthResourceLogger;
};

export async function getStudentGrowthResourceRequirements(
  env: Env,
  students: GrowthResourceStudentInput[],
  allStudentsMap: StudentMap,
  studentGearDataMap: Map<string, StudentGearData | null>,
  options: GrowthResourceCalculationOptions = {},
): Promise<Record<string, StudentGrowthResourceRequirements>> {
  const normalizedStudents = students.map(normalizeStudentGrowthInputForCalculation);
  const requirements = students.reduce(
    (acc, student) => {
      acc[student.uid] = {
        items: new Map<string, GrowthResourceItem>(),
        characterExp: 0,
        credit: 0,
        skillUnavailable: false,
      };
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
      const skillCostMap = await getStudentSkillCosts(
        env,
        studentsNeedingSkillCosts.map(({ uid }) => uid),
      );
      for (const student of studentsNeedingSkillCosts) {
        const skillCost = skillCostMap.get(student.uid);
        if (!skillCost) {
          requirements[student.uid].skillUnavailable = true;
          continue;
        }

        addItems(requirements[student.uid], calculateSkillResourceItems(student, skillCost));
        const abilityRequirements = calculateAbilityReleaseRequirements(student, skillCost);
        addItems(requirements[student.uid], abilityRequirements.items);
        requirements[student.uid].credit += abilityRequirements.credit;
        requirements[student.uid].skillUnavailable ||= abilityRequirements.unavailable;
      }
    } catch {
      for (const student of studentsNeedingSkillCosts) {
        requirements[student.uid].skillUnavailable = true;
      }
    }
  }

  const resourceUids = new Set<string>();
  try {
    for (const requirement of Object.values(requirements)) {
      for (const item of requirement.items.values()) {
        resourceUids.add(item.uid);
      }
    }

    if (resourceUids.size > 0) {
      const resourceMetadataMap = await getItemCatalogResourceMap(env);
      for (const requirement of Object.values(requirements)) {
        applyResourceMetadata(requirement.items, resourceMetadataMap);
      }
    }
  } catch (error) {
    options.logger?.error("Failed to enrich growth resource metadata", error, {
      resourceCount: resourceUids.size,
    });
    // Keep quantities visible even if BAQL item metadata cannot be loaded.
  }

  return Object.fromEntries(
    Object.entries(requirements).map(([studentUid, requirement]) => [
      studentUid,
      {
        items: sortGrowthResourceItems(Array.from(requirement.items.values())),
        characterExp: requirement.characterExp,
        credit: requirement.credit,
        skillUnavailable: requirement.skillUnavailable,
      },
    ]),
  );
}

function addItems(requirement: MutableRequirements, items: GrowthResourceItem[]) {
  for (const item of items) {
    addGrowthResourceItemToMap(requirement.items, item);
  }
}

function applyResourceMetadata(
  items: Map<string, GrowthResourceItem>,
  metadataMap: Awaited<ReturnType<typeof getItemCatalogResourceMap>>,
) {
  for (const item of items.values()) {
    const metadata = metadataMap[item.uid];
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
