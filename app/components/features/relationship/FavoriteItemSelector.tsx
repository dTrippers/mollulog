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
  }, [fetcher.load, studentUid]);

  const favoriteItems = fetcher.data?.favoriteItems;
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
      <div className="flex items-center justify-between gap-3">
        <SubTitle text="선물 목록" />
        <Toggle label="좋아하는 선물만 보기" initialState={filterFavorited} onChange={setFilterFavorited} />
      </div>

      {fetcher.state === "loading" ?
        <LoadingSkeleton /> :
        <div className="grid grid-cols-3 lg:grid-cols-8 gap-1 xl:gap-2">
          {filteredItems.map(({ item, favoriteLevel, exp }) => {
            const quantity = quantities[item.uid] || 0;
            const totalItemExp = exp * quantity;
            return (
              <div key={item.uid} className="group p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <div className="flex flex-col items-center">
                  <ResourceCard rarity={item.rarity} favoriteLevel={favoriteLevel} itemUid={item.uid} name={item.name} size="lg" />
                  <div className="mt-0.5 text-center text-xs text-neutral-500 dark:text-neutral-400">{exp} EXP</div>
                  <div className="mt-3 flex items-center gap-2">
                    <NumberInput
                      value={quantity}
                      onChange={(value) => onQuantitiesChange({ ...quantities, [item.uid]: value })}
                    />
                  </div>
                  {quantity > 0 && (
                    <span className="mt-2 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 text-xs border border-green-200 dark:border-green-800">
                      +{totalItemExp.toLocaleString()} EXP
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
