import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { LoadingSkeleton, NumberInput, ResourceCard, SubTitle, Toggle } from "~/components/primitives";
import type { loader as favoriteItemsLoader } from "~/routes/api.students.$uid.items";

type FavoriteItemSelectorProps = {
  studentUid: string;

  quantities: Record<string, number>;
  onQuantitiesChange: (quantities: Record<string, number>) => void;
  onSelectedItemExpChange: (exp: number) => void;
};

export default function FavoriteItemSelector({ studentUid, quantities, onQuantitiesChange, onSelectedItemExpChange }: FavoriteItemSelectorProps) {
  const [filterFavorited, setFilterFavorited] = useState(true);

  const fetcher = useFetcher<typeof favoriteItemsLoader>();
  const [cachedFavoriteItems, setCachedFavoriteItems] = useState<Record<string, NonNullable<typeof fetcher.data>["favoriteItems"]>>({});
  useEffect(() => {
    fetcher.load(`/api/students/${studentUid}/items`);
  }, [fetcher.load, studentUid]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data?.uid) return;
    setCachedFavoriteItems((prev) => ({
      ...prev,
      [data.uid]: data.favoriteItems,
    }));
  }, [fetcher.data]);

  const favoriteItems = fetcher.data?.uid === studentUid ? fetcher.data.favoriteItems : cachedFavoriteItems[studentUid];
  const filteredItems = useMemo(() => {
    if (!favoriteItems) {
      return [];
    }

    return favoriteItems
      .filter(({ favorited }) => filterFavorited ? favorited : true)
      .sort((a, b) => {
        if (a.item.rarity !== b.item.rarity) {
          return b.item.rarity - a.item.rarity;
        }
        if (a.favoriteLevel !== b.favoriteLevel) {
          return b.favoriteLevel - a.favoriteLevel;
        }
        return Number.parseInt(a.item.uid, 10) - Number.parseInt(b.item.uid, 10);
      });
  }, [favoriteItems, filterFavorited]);

  useEffect(() => {
    if (!favoriteItems) {
      return;
    }
    onSelectedItemExpChange(favoriteItems.reduce((acc, item) => acc + item.exp * (quantities[item.item.uid] ?? 0), 0));
  }, [favoriteItems, onSelectedItemExpChange, quantities]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SubTitle text="선물 목록" className="my-0" />
        <Toggle label="좋아하는 선물만 보기" initialState={filterFavorited} onChange={setFilterFavorited} />
      </div>

      {!favoriteItems ?
        <LoadingSkeleton /> :
        <div className="grid min-w-0 gap-1 grid-cols-4 md:grid-cols-8 lg:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-12 gap-1">
          {filteredItems.map(({ item, favoriteLevel, exp }) => {
            const quantity = quantities[item.uid] || 0;
            const totalItemExp = exp * quantity;
            return (
              <div key={item.uid} className="group min-w-0 overflow-hidden rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex flex-col items-center">
                  <ResourceCard rarity={item.rarity} favoriteLevel={favoriteLevel} itemUid={item.uid} name={item.name} />
                  <div className="mt-0.5 text-center text-xs text-neutral-500 dark:text-neutral-400">{exp} EXP</div>
                  <div className="mt-1 flex w-full min-w-0 items-center gap-2 md:mt-3">
                    <NumberInput
                      value={quantity}
                      size="sm"
                      onChange={(value) => onQuantitiesChange({ ...quantities, [item.uid]: value })}
                    />
                  </div>
                  {quantity > 0 && (
                    <span className="mt-1 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300 md:mt-2 md:px-2">
                      +{totalItemExp.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      }
    </>
  );
}
