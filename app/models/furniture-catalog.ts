import { parseFurnitureCategory, parseFurnitureRarity } from "~/domain/furniture-catalog";
import { graphql } from "~/graphql";
import type { FurnitureCatalogSourceQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "~/lib/cache";

const FURNITURE_CATALOG_CACHE_KEY = cacheKey("source", "furniture-catalog", 1, "all");

const furnitureCatalogQuery = graphql(`
  query FurnitureCatalogSource {
    furnitures {
      uid
      name
      imageUrl
      rarity
      category
      subCategory
      tags
    }
    furnitureThemes {
      uid
      name
      description
      previews {
        uid
        title
        imageUrl
        thumbnailUrl
      }
      furnitures {
        uid
      }
    }
  }
`);

type FurnitureCatalogFurnitureQueryItem = FurnitureCatalogSourceQuery["furnitures"][number];
type FurnitureCatalogThemeQueryItem = FurnitureCatalogSourceQuery["furnitureThemes"][number];

export type FurnitureCatalogItemSource = Omit<FurnitureCatalogFurnitureQueryItem, "category" | "rarity"> & {
  category: ReturnType<typeof parseFurnitureCategory>;
  rarity: ReturnType<typeof parseFurnitureRarity>;
};
export type FurnitureCatalogPreview = FurnitureCatalogThemeQueryItem["previews"][number];
export type FurnitureCatalogThemeSource = Omit<FurnitureCatalogThemeQueryItem, "furnitures"> & {
  furnitureUids: string[];
};

export type FurnitureCatalogSource = {
  furnitures: FurnitureCatalogItemSource[];
  themes: FurnitureCatalogThemeSource[];
};

export async function getFurnitureCatalogSource(env: Env, forceRefresh = false): Promise<FurnitureCatalogSource> {
  return fetchSourceCached(
    env,
    FURNITURE_CATALOG_CACHE_KEY,
    async () => {
      const { data, error } = await runQuery(furnitureCatalogQuery, {});
      if (error) throw error;
      if (!data || !Array.isArray(data.furnitures) || !Array.isArray(data.furnitureThemes)) {
        throw new Error("BAQL furniture catalog response is missing furnitures or furniture themes");
      }

      const furnitures = data.furnitures.map(normalizeFurnitureCatalogItemSource);

      const themes = data.furnitureThemes.map((theme) => {
        const name = theme.name.trim();
        if (!name) throw new Error(`BAQL furniture theme ${theme.uid} is missing its name`);
        return {
          uid: theme.uid,
          name,
          description: theme.description,
          previews: theme.previews.map((preview) => {
            const title = preview.title.trim();
            const imageUrl = preview.imageUrl.trim();
            const thumbnailUrl = preview.thumbnailUrl.trim();
            if (!title || !imageUrl || !thumbnailUrl) {
              throw new Error(`BAQL furniture theme preview ${preview.uid} is missing required display data`);
            }
            return { uid: preview.uid, title, imageUrl, thumbnailUrl };
          }),
          furnitureUids: theme.furnitures.map(({ uid }) => uid),
        };
      });

      return { furnitures, themes };
    },
    forceRefresh,
    { rejectOnForcedRefresh: true },
  );
}

export function normalizeFurnitureCatalogItemSource(
  furniture: FurnitureCatalogFurnitureQueryItem,
): FurnitureCatalogItemSource {
  const name = furniture.name.trim();
  const imageUrl = furniture.imageUrl.trim();
  if (!name || !imageUrl) {
    throw new Error(`BAQL furniture ${furniture.uid} is missing its name or image URL`);
  }
  return {
    uid: furniture.uid,
    name,
    imageUrl,
    rarity: parseFurnitureRarity(furniture.rarity),
    category: parseFurnitureCategory(furniture.category),
    subCategory: furniture.subCategory,
    tags: furniture.tags,
  };
}
