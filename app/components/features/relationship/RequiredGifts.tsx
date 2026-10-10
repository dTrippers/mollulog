import { ResourceInventoryTile } from "~/components/features/growth";
import { SectionCard } from "~/components/primitives";
import { getAccumulatedRelationshipExpForLevel } from "~/domain/relationship-level";
import { RELATIONSHIP_ITEMS } from "~/models/constants";

type RequiredGiftsProps = {
  currentExp: number | null;
  currentLevel: number | null;
  targetLevel: number | null;
};

export default function RequiredGifts({ currentExp: currentExpProp, currentLevel, targetLevel }: RequiredGiftsProps) {
  const canCalculate = currentLevel != null && targetLevel != null;
  const currentExp =
    currentExpProp ?? (currentLevel == null ? null : getAccumulatedRelationshipExpForLevel(currentLevel));
  return (
    <SectionCard title="필요 선물" description="목표 랭크까지 도달하기 위해 필요한 개수에요" className="mb-3 md:mb-4">
      <fieldset
        className={`grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] justify-items-center gap-x-1 gap-y-0 min-w-0 border-0 p-0`}
        aria-label={!canCalculate ? "계산 보류" : undefined}
      >
        {RELATIONSHIP_ITEMS.map(({ type, name, exp, item }) => {
          const remainingExp =
            canCalculate && currentExp != null && targetLevel != null
              ? getAccumulatedRelationshipExpForLevel(targetLevel) - currentExp
              : null;
          const requiredAmount = remainingExp == null ? null : Math.max(Math.ceil(remainingExp / exp), 0);
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
                  value:
                    requiredAmount == null ? (
                      <span aria-hidden="true">-</span>
                    ) : (
                      `${requiredAmount.toLocaleString()}${item ? "개" : "번"}`
                    ),
                  dimmed: requiredAmount == null,
                },
              ]}
            />
          );
        })}
      </fieldset>
    </SectionCard>
  );
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
