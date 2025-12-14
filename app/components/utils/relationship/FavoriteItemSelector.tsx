import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { NumberInput, Toggle } from "~/components/atoms/form";
import { ResourceCard } from "~/components/atoms/item";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { SubTitle } from "~/components/atoms/typography";
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
  useEffect(() => {
    fetcher.load(`/api/students/${studentUid}/items`);
  }, [studentUid]);

  const favoriteItems = fetcher.data?.favoriteItems;
  const filteredItems = useMemo(() => {
    if (!favoriteItems) {
      return [];
    }

    return favoriteItems.filter(({ favorited }) => filterFavorited ? favorited : true).sort((a, b) => {
      if (a.item.rarity === b.item.rarity) {
        return b.favoriteLevel - a.favoriteLevel;
      }
      return b.item.rarity - a.item.rarity;
    });
  }, [favoriteItems, filterFavorited]);

  useEffect(() => {
    if (!favoriteItems) {
      return;
    }
    onSelectedItemExpChange(favoriteItems.reduce((acc, item) => acc + item.exp * (quantities[item.item.uid] ?? 0), 0));
  }, [favoriteItems, quantities]);

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-3">
        <SubTitle text="선물 목록" />
        <Toggle label="좋아하는 선물만 보기" initialState={filterFavorited} onChange={setFilterFavorited} />
      </div>

      {fetcher.state === "loading" ?
        <LoadingSkeleton /> :
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredItems.map(({ item, favoriteLevel, exp }) => {
            const quantity = quantities[item.uid] || 0;
            const totalItemExp = exp * quantity;
            return (
              <div key={item.uid} className="group p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <div className="flex items-start">
                  <ResourceCard rarity={item.rarity} favoriteLevel={favoriteLevel} itemUid={item.uid} />

                  <div className="ml-3 grow min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{item.name}</p>
                      {quantity > 0 && (
                        <span className="shrink-0 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 text-xs border border-green-200 dark:border-green-800">
                          +{totalItemExp.toLocaleString()} EXP
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{exp} EXP</div>

                    <div className="mt-3 flex items-center gap-2">
                      <label className="shrink-0 text-sm text-neutral-600 dark:text-neutral-400">수량</label>
                      <NumberInput
                        value={quantity}
                        onChange={(value) => onQuantitiesChange({ ...quantities, [item.uid]: value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }
    </>
  );
}
