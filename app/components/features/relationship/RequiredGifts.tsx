import { ResourceInventoryGroup, ResourceInventoryTile } from "~/components/features/growth";
import { RELATIONSHIP_EXP_TABLE, RELATIONSHIP_ITEMS } from "~/models/constants";

type RequiredGiftsProps = {
  currentExp: number | null;
  currentLevel: number;
  targetLevel: number;
};

export default function RequiredGifts({ currentExp: currentExpProp, currentLevel, targetLevel }: RequiredGiftsProps) {
  const currentExp = currentExpProp ?? getAccumulatedExpForLevel(currentLevel);
  return (
    <ResourceInventoryGroup title="필요 선물" className="mb-3 md:mb-4">
      {RELATIONSHIP_ITEMS.map(({ type, name, exp, item }) => {
        const remainingExp = getAccumulatedExpForLevel(targetLevel) - currentExp;
        const requiredAmount = Math.max(Math.ceil(remainingExp / exp), 0);
        const imageUrl = getRelationshipItemImageUrl(type, item?.favoriteLevel);
        return (
          <ResourceInventoryTile
            key={`${type}-${name}-${exp}`}
            resource={{
              imageUrl,
              rarity: item?.rarity ?? 1,
              name,
            }}
            showQuantityInput={false}
            showName
            metrics={[
              {
                value: `${requiredAmount.toLocaleString()}${item ? "개" : "번"}`,
              },
            ]}
          />
        );
      })}
    </ResourceInventoryGroup>
  );
}

function getAccumulatedExpForLevel(level: number): number {
  return RELATIONSHIP_EXP_TABLE.find((entry) => entry.level === level)?.accumulatedExp ?? 0;
}

function getRelationshipItemImageUrl(type: string, favoriteLevel?: number): string {
  if (favoriteLevel) {
    return `https://assets.mollulog.net/assets/images/ui/gift-reaction-${favoriteLevel}.png`;
  }
  if (type === "schedule") {
    return "https://assets.mollulog.net/assets/images/ui/menu-schedule.webp";
  }
  return "https://assets.mollulog.net/assets/images/ui/menu-cafe.webp";
}
