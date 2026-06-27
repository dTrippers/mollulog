import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, cacheQuery, fetchLazySourceCachedBatch } from "~/models/base";
import type { EquipmentMetadata, ItemMetadata, SkillCostStudent, StudentGearData } from "~/models/growth-resource";

const STUDENT_GEAR_DATA_TTL = 24 * 60 * 60;

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

const itemMetadataQuery = graphql(`
  query GrowthResourceItems($uids: [String!]) {
    items(uids: $uids) {
      uid name rarity type
      ... on Item { category subCategory }
    }
  }
`);

const equipmentMetadataQuery = graphql(`
  query GrowthResourceEquipments($uids: [String!]) {
    equipments(uids: $uids) {
      uid name rarity type category
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

export class GrowthResourceRepository {
  constructor(private env: Env) {}

  async getSkillCosts(studentUids: string[]): Promise<Map<string, SkillCostStudent>> {
    const { data, error } = await runQuery(skillCostQuery, { uids: studentUids });
    if (error) {
      throw error;
    }

    const students = data?.students ?? [];
    return new Map(
      students.map((student) => {
        const { __typename: _typename, ...skillCost } = student;
        return [student.uid, skillCost satisfies SkillCostStudent];
      }),
    );
  }

  async getItemMetadata(itemUids: string[]): Promise<Map<string, ItemMetadata>> {
    const uniqueItemUids = [...new Set(itemUids)];
    if (uniqueItemUids.length === 0) {
      return new Map();
    }

    // TODO: Replace BAQL item metadata lookups with browser-local metadata once the client stores the full item catalog.
    const { data, error } = await runQuery(itemMetadataQuery, { uids: uniqueItemUids });
    if (error) {
      throw error;
    }

    const items = data?.items ?? [];
    return new Map(
      items.map((item) => [
        item.uid,
        {
          ...item,
          name: item.name.replaceAll("\n", " ").trim(),
        },
      ]),
    );
  }

  async getEquipmentMetadata(equipmentUids: string[]): Promise<Map<string, EquipmentMetadata>> {
    const uniqueEquipmentUids = [...new Set(equipmentUids)];
    if (uniqueEquipmentUids.length === 0) {
      return new Map();
    }

    // TODO: Replace BAQL equipment metadata lookups with browser-local metadata once the client stores the full equipment catalog.
    const { data, error } = await runQuery(equipmentMetadataQuery, { uids: uniqueEquipmentUids });
    if (error) {
      throw error;
    }

    const equipments = data?.equipments ?? [];
    return new Map(
      equipments.map((equipment) => [
        equipment.uid,
        {
          ...equipment,
          name: equipment.name.replaceAll("\n", " ").trim(),
        },
      ]),
    );
  }

  async getStudentGearData(studentUids: string[], forceRefresh = false): Promise<Map<string, StudentGearData | null>> {
    const uniqueStudentUids = [...new Set(studentUids)].sort();
    if (uniqueStudentUids.length === 0) {
      return new Map();
    }

    return fetchLazySourceCachedBatch(
      this.env,
      uniqueStudentUids.map((uid) => ({ key: uid, dataKey: this.buildStudentGearDataCacheKey(uid) })),
      async (missingUids) => {
        const fetchedMap = new Map(await this.fetchStudentGearDataFromBaql(missingUids));
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

  private async fetchStudentGearDataFromBaql(studentUids: string[]): Promise<Array<[string, StudentGearData | null]>> {
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

  private buildStudentGearDataCacheKey(uid: string): string {
    return cacheKey("source", "student-gear-data", 1, cacheQuery({ uid }));
  }
}
