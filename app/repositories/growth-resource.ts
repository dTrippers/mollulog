import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { DEFAULT_KV_EXPIRATION_TTL, cacheKey, cacheQuery } from "~/models/base";
import type { EquipmentMetadata, ItemMetadata, SkillCostStudent, StudentGearData } from "~/models/growth-resource";

type CacheEnvelope<T> = {
  _ver: 2;
  data: T;
  cachedAt: number;
};

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

  async getStudentGearData(studentUids: string[]): Promise<Map<string, StudentGearData | null>> {
    const uniqueStudentUids = [...new Set(studentUids)].sort();
    if (uniqueStudentUids.length === 0) {
      return new Map();
    }

    const cachedStates = await Promise.all(
      uniqueStudentUids.map(async (uid) => {
        const raw = await this.env.KV_CACHE.get(this.buildStudentGearDataCacheKey(uid));
        return { uid, cached: this.parseCacheEnvelope<StudentGearData | null>(raw) };
      }),
    );

    const cachedDataMap = new Map<string, StudentGearData | null>();
    const staleDataMap = new Map<string, StudentGearData | null>();
    const missingUids: string[] = [];

    for (const { uid, cached } of cachedStates) {
      if (!cached) {
        missingUids.push(uid);
        continue;
      }

      staleDataMap.set(uid, cached.data);
      if (this.isCacheFresh(cached.cachedAt, STUDENT_GEAR_DATA_TTL)) {
        cachedDataMap.set(uid, cached.data);
        continue;
      }

      missingUids.push(uid);
    }

    if (missingUids.length === 0) {
      return cachedDataMap;
    }

    try {
      const fetchedMap = new Map(await this.fetchStudentGearDataFromBaql(missingUids));
      const cachedAt = Date.now();

      await Promise.all(
        missingUids.map((uid) => {
          const data = fetchedMap.get(uid) ?? null;
          cachedDataMap.set(uid, data);
          const envelope: CacheEnvelope<StudentGearData | null> = { _ver: 2, data, cachedAt };
          return this.env.KV_CACHE.put(this.buildStudentGearDataCacheKey(uid), JSON.stringify(envelope), {
            expirationTtl: DEFAULT_KV_EXPIRATION_TTL,
          });
        }),
      );
    } catch (error) {
      const missingWithoutStale = missingUids.filter((uid) => !staleDataMap.has(uid));
      if (missingWithoutStale.length > 0) {
        throw error;
      }

      for (const uid of missingUids) {
        cachedDataMap.set(uid, staleDataMap.get(uid) ?? null);
      }
    }

    return new Map(uniqueStudentUids.map((uid) => [uid, cachedDataMap.get(uid) ?? staleDataMap.get(uid) ?? null]));
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
    return cacheKey("cache", "student-gear-data", 1, cacheQuery({ uid }));
  }

  private parseCacheEnvelope<T>(raw: string | null): CacheEnvelope<T> | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as CacheEnvelope<T> | T;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "_ver" in parsed &&
        parsed._ver === 2 &&
        "cachedAt" in parsed &&
        typeof parsed.cachedAt === "number" &&
        "data" in parsed
      ) {
        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }

  private isCacheFresh(cachedAt: number, ttlInSeconds: number): boolean {
    return Date.now() - cachedAt < ttlInSeconds * 1000;
  }
}
