import { ResourceCard, Section } from "~/components/primitives";
import { RELATIONSHIP_EXP_TABLE, RELATIONSHIP_ITEMS } from "~/models/constants";

type RequiredGiftsProps = {
  currentExp: number | null;
  currentLevel: number;
  targetLevel: number;
};

export default function RequiredGifts({ currentExp: currentExpProp, currentLevel, targetLevel }: RequiredGiftsProps) {
  const currentExp = currentExpProp ?? getAccumulatedExpForLevel(currentLevel);
  return (
    <Section title="필요 선물" className="mb-3 pb-4 md:mb-4 md:pb-8" bodyClassName="mt-3">
      <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-4 xl:grid-cols-8 gap-1">
        {RELATIONSHIP_ITEMS.map(({ type, name, exp, item }) => {
          const remainingExp = getAccumulatedExpForLevel(targetLevel) - currentExp;
          return (
            <div key={`${type}-${name}-${exp}`} className="flex min-w-0 flex-col items-center rounded-md border border-neutral-200 bg-white px-1 py-1.5 dark:border-neutral-800 dark:bg-neutral-900 md:py-2">
              {item && <ResourceCard rarity={item.rarity} imageUrl={`https://assets.mollulog.net/assets/images/ui/gift-reaction-${item.favoriteLevel}.png`} />}
              {(type === "schedule") && <ResourceCard rarity={1} imageUrl="https://assets.mollulog.net/assets/images/ui/menu-schedule.webp" />}
              {(type === "cafe") && <ResourceCard rarity={1} imageUrl="https://assets.mollulog.net/assets/images/ui/menu-cafe.webp" />}
              <p className="mt-1 max-w-full truncate text-xs md:text-sm">{name}</p>
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
