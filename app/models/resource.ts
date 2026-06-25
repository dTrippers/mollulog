import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "./base";

const ALL_STUDENTS_FAVORITE_ITEMS_CACHE_KEY = cacheKey("source", "student-favorite-item", 1, "all");

const allStudentsFavoriteItemsQuery = graphql(`
  query AllStudentsFavoriteItems {
    students {
      uid name
      favoriteItems {
        favorited favoriteLevel exp
        item { uid name rarity }
      }
    }
  }
`);

export type AllStudentsFavoriteItems = {
  itemUid: string;
  itemName: string;
  itemRarity: number;

  favoriteLevels: Record<
    number,
    {
      exp: number;
      students: { uid: string; name: string }[];
    }
  >;
};

export const COMMON_FAVORITE_ITEM_UIDS = ["5996", "5997", "5998", "5999"];

export async function getAllStudentsFavoriteItems(env: Env, forceRefresh = false): Promise<AllStudentsFavoriteItems[]> {
  return fetchSourceCached(
    env,
    ALL_STUDENTS_FAVORITE_ITEMS_CACHE_KEY,
    async () => {
      const { data } = await runQuery(allStudentsFavoriteItemsQuery, {});
      if (!data?.students) {
        return [];
      }

      const items = new Map<string, AllStudentsFavoriteItems>();
      for (const student of data.students) {
        for (const { item, favoriteLevel, exp, favorited } of student.favoriteItems) {
          if (!favorited && !COMMON_FAVORITE_ITEM_UIDS.includes(item.uid)) {
            continue;
          }

          let itemEntry = items.get(item.uid);
          if (!itemEntry) {
            itemEntry = {
              itemUid: item.uid,
              itemName: item.name,
              itemRarity: item.rarity,
              favoriteLevels: {},
            };
            items.set(item.uid, itemEntry);
          }

          let levelEntry = itemEntry.favoriteLevels[favoriteLevel];
          if (!levelEntry) {
            levelEntry = { exp, students: [] };
            itemEntry.favoriteLevels[favoriteLevel] = levelEntry;
          }

          levelEntry.students.push({ uid: student.uid, name: student.name });
        }
      }

      return Array.from(items.values()).sort((a, b) => {
        if (a.itemRarity === b.itemRarity) {
          return Number.parseInt(a.itemUid) - Number.parseInt(b.itemUid);
        }
        return b.itemRarity - a.itemRarity;
      });
    },
    forceRefresh,
  );
}
