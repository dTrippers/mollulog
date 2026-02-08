import { ResourceCard } from "~/components/atoms/item";
import { RELATIONSHIP_EXP_TABLE, RELATIONSHIP_ITEMS } from "~/models/constants";
import { Section } from "~/components/ui";

type RequiredGiftsProps = {
  currentExp: number | null;
  currentLevel: number;
  targetLevel: number;
};

export default function RequiredGifts({ currentExp: currentExpProp, currentLevel, targetLevel }: RequiredGiftsProps) {
  const currentExp = currentExpProp ?? getAccumulatedExpForLevel(currentLevel);
  return (
    <Section title="목표 랭크까지 필요한 선물 개수">
      <div className="grid grid-cols-4 xl:grid-cols-8 gap-1 md:gap-2">
        {RELATIONSHIP_ITEMS.map(({ type, name, exp, item }) => {
          const remainingExp = getAccumulatedExpForLevel(targetLevel) - currentExp;
          return (
            <div key={`${type}-${name}-${exp}`} className="py-2 flex flex-col items-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              {item && <ResourceCard rarity={item.rarity} imageUrl={`https://assets.mollulog.net/assets/images/ui/gift-reaction-${item.favoriteLevel}.png`} />}
              {(type === "schedule") && <ResourceCard rarity={1} imageUrl="https://assets.mollulog.net/assets/images/ui/menu-schedule.webp" />}
              {(type === "cafe") && <ResourceCard rarity={1} imageUrl="https://assets.mollulog.net/assets/images/ui/menu-cafe.webp" />}
              <p className="mt-1 text-sm">{name}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {Math.max(Math.ceil(remainingExp / exp), 0).toLocaleString()}{item ? "개" : "번"}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function getAccumulatedExpForLevel(level: number): number {
  return RELATIONSHIP_EXP_TABLE.find((entry) => entry.level === level)?.accumulatedExp ?? 0;
}
