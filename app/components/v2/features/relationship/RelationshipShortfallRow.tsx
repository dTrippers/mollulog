import { HoverTooltip } from "../../primitives/HoverTooltip";
import { itemImageUrl } from "~/models/assets";
import type { RelationshipShortfallRow as RelationshipShortfallRowData } from "~/domain/relationship-gifts";

const rarityBackground: Record<number, string> = {
  1: "bg-v2-rarity-1",
  2: "bg-v2-rarity-2",
  3: "bg-v2-rarity-3",
  4: "bg-v2-rarity-4",
};

export function RelationshipShortfallRow({ row }: { row: RelationshipShortfallRowData }) {
  const rarityRuns: Array<{ rarity: number; gifts: typeof row.gifts }> = [];
  const visibleGifts = row.gifts.slice(0, 5);
  const remainingGiftCount = row.gifts.length - visibleGifts.length;
  for (const gift of visibleGifts) {
    const lastRun = rarityRuns.at(-1);
    if (!lastRun || lastRun.rarity !== gift.item.rarity) {
      rarityRuns.push({ rarity: gift.item.rarity, gifts: [gift] });
    } else {
      lastRun.gifts.push(gift);
    }
  }

  return (
    <div className="col-span-full grid grid-cols-subgrid items-center py-2">
      <span className="text-right text-xl font-semibold leading-none tabular-nums text-v2-fg">
        {row.quantity.toLocaleString()}
        <span className="ml-0.5 text-sm font-normal text-v2-fg-secondary">개</span>
      </span>
      <span className="text-right text-xs tabular-nums text-v2-fg-tertiary">{row.exp.toLocaleString()} EXP</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {rarityRuns.map((run) => (
          <span key={run.rarity} className="flex flex-wrap items-center gap-1">
            {run.gifts.map((gift) => (
              <HoverTooltip key={gift.item.uid} content={gift.item.name} focusable>
                <span
                  role="img"
                  aria-label={`${gift.item.name}, 희귀도 ${gift.item.rarity}`}
                  className={`relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md ${rarityBackground[gift.item.rarity] ?? rarityBackground[1]}`}
                >
                  <img src={itemImageUrl(gift.item.uid)} alt="" loading="lazy" className="size-6 object-contain" />
                </span>
              </HoverTooltip>
            ))}
          </span>
        ))}
        {remainingGiftCount > 0 ? (
          <span className="text-xs tabular-nums text-v2-fg-tertiary">외 {remainingGiftCount.toLocaleString()}개</span>
        ) : null}
      </span>
    </div>
  );
}
