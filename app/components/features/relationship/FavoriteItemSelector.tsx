import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { ResourceInventoryGroup, ResourceInventoryTile } from "~/components/features/growth";
import { LoadingSkeleton, Toggle, useNumberInputFlowNavigation } from "~/components/primitives";
import type { loader as favoriteItemsLoader } from "~/routes/api.students.$uid.items";
import { type ItemQuantityBreakdownEntry, QuantityBreakdownTooltipContent } from "./QuantityBreakdownTooltip";

type FavoriteItemSelectorProps = {
  studentUid: string;

  quantities: Record<string, number>;
  itemRequiredQuantities: Record<string, number> | null;
  itemQuantityBreakdowns: Record<string, ItemQuantityBreakdownEntry[]> | null;
  ownedQuantities: Record<string, number> | null;
  onQuantitiesChange: (quantities: Record<string, number>) => void;
  onSelectedItemExpChange: (exp: number) => void;
};

const INSUFFICIENT_QUANTITY_CLASS = "text-red-600 dark:text-red-400";

export default function FavoriteItemSelector({
  studentUid,
  quantities,
  itemRequiredQuantities,
  itemQuantityBreakdowns,
  ownedQuantities,
  onQuantitiesChange,
  onSelectedItemExpChange,
}: FavoriteItemSelectorProps) {
  const [filterFavorited, setFilterFavorited] = useState(true);
  const numberInputFlowNavigation = useNumberInputFlowNavigation();

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
    <ResourceInventoryGroup
      title="선물 목록"
      controls={
        <Toggle
          label="좋아하는 선물만 보기"
          initialState={filterFavorited}
          className="my-0"
          onChange={setFilterFavorited}
        />
      }
    >
      {!favoriteItems ?
        <LoadingSkeleton /> :
        <>
          {filteredItems.map(({ item, favoriteLevel, exp }) => {
            const quantity = quantities[item.uid] || 0;
            const totalItemExp = exp * quantity;
            const requiredQuantity = itemRequiredQuantities?.[item.uid] ?? 0;
            const ownedQuantity = ownedQuantities?.[item.uid] ?? 0;
            const showQuantityComparison = itemRequiredQuantities !== null && ownedQuantities !== null;
            const breakdown = itemQuantityBreakdowns?.[item.uid];
            const isDimmed = requiredQuantity === 0;
            return (
              <ResourceInventoryTile
                key={item.uid}
                resource={{
                  itemUid: item.uid,
                  rarity: item.rarity,
                  favoriteLevel,
                  name: item.name,
                }}
                currentQuantity={quantity}
                draftQuantity={quantity}
                quantityLabel="목표"
                inputProps={numberInputFlowNavigation.getInputProps()}
                metrics={[
                  { label: "EXP", value: exp.toLocaleString() },
                  ...(showQuantityComparison
                    ? [
                        {
                          label: "필요",
                          value: requiredQuantity.toLocaleString(),
                          tooltip: breakdown && breakdown.length > 0 ? <QuantityBreakdownTooltipContent breakdown={breakdown} /> : undefined,
                          dimmed: isDimmed,
                        },
                        {
                          label: "보유",
                          value: ownedQuantity.toLocaleString(),
                          valueClassName: ownedQuantity < requiredQuantity ? INSUFFICIENT_QUANTITY_CLASS : undefined,
                          dimmed: isDimmed,
                        },
                      ]
                    : []),
                  ...(quantity > 0
                    ? [{
                        value: `+${totalItemExp.toLocaleString()}`,
                        valueClassName: "text-emerald-600 dark:text-emerald-400",
                      }]
                    : []),
                ]}
                onQuantityChange={(value) => onQuantitiesChange({ ...quantities, [item.uid]: value })}
              />
            );
          })}
        </>
      }
    </ResourceInventoryGroup>
  );
}
