import type { AllStudentsFavoriteItems } from "~/models/resource";
import { itemImageUrl } from "~/models/assets";
import { HoverTooltip } from "../../primitives/HoverTooltip";
import { cn } from "~/lib/utils";

const rarityBackground: Record<number, string> = {
  1: "bg-v2-rarity-1",
  2: "bg-v2-rarity-2",
  3: "bg-v2-rarity-3",
  4: "bg-v2-rarity-4",
};

const formatNumber = (value: number) => value.toLocaleString("en-US");

export function RelationshipGiftList({
  items,
  activeItemUid,
  requiredQuantities,
  ownedQuantities,
  onSelect,
  className,
}: {
  items: AllStudentsFavoriteItems[];
  activeItemUid: string | null;
  requiredQuantities: Record<string, number>;
  ownedQuantities: Record<string, number> | null;
  onSelect: (itemUid: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-3 justify-items-center gap-x-1 gap-y-2 sm:grid-cols-4 lg:grid-cols-3", className)}
    >
      {items.map((item) => {
        const required = requiredQuantities[item.itemUid] ?? 0;
        const owned = ownedQuantities?.[item.itemUid] ?? 0;
        const insufficient = ownedQuantities !== null && owned < required;
        const selected = item.itemUid === activeItemUid;
        return (
          <HoverTooltip key={item.itemUid} content={item.itemName} className="w-full min-w-0">
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${item.itemName}, 희귀도 ${item.itemRarity}${ownedQuantities !== null ? `, 필요 ${required}, 보유 ${owned}${insufficient ? ", 부족" : ""}` : ""}`}
              onClick={() => onSelect(item.itemUid)}
              className={cn(
                "flex w-full min-w-0 flex-col items-center gap-1 rounded-md px-0.5 py-1.5 text-center hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
                selected && "bg-v2-inset ring-2 ring-v2-focus/60",
              )}
            >
              <span
                className={`flex size-14 items-center justify-center overflow-hidden rounded-lg ${rarityBackground[item.itemRarity] ?? rarityBackground[1]}`}
              >
                <img src={itemImageUrl(item.itemUid)} alt="" loading="lazy" className="size-12 object-contain" />
              </span>
              {ownedQuantities !== null ? (
                <span className="grid w-full min-w-0 gap-0.5 text-xs leading-tight tabular-nums text-v2-fg-tertiary">
                  <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-1 text-left">
                    <span>필요</span>
                    <span className="ml-auto min-w-0 text-right [overflow-wrap:anywhere]">
                      {formatNumber(required)}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-1 text-left">
                    <span>보유</span>
                    <span className="ml-auto min-w-0 text-right [overflow-wrap:anywhere]">{formatNumber(owned)}</span>
                  </span>
                  {insufficient ? <span className="text-center font-semibold text-v2-warning">부족</span> : null}
                </span>
              ) : (
                <span className="sr-only">필요 {required}개</span>
              )}
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}
