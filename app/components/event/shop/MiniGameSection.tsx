import { useMemo } from "react";
import { NumberInput } from "~/components/atoms/form";
import { ResourceCard } from "~/components/atoms/item";
import { Section } from "~/components/ui";
import type { ShopState, ShopActions } from "./hooks";
import {
  resourceCountLabel,
  calculateMinigameRewards,
  calculateDiceMinigameStats,
} from "./utils";
import type { MinigameConfig } from "./constants";
import { minigameDescription } from "~/locales/ko";

type MiniGameSectionProps = {
  config: MinigameConfig;
  state: ShopState;
  actions: ShopActions;
};

export function MiniGameSection({ config, state, actions }: MiniGameSectionProps) {
  const rewards = useMemo(
    () => calculateMinigameRewards(config, state.minigamePlayCount),
    [config, state.minigamePlayCount],
  );

  const diceStats = useMemo(() => {
    if (config.minigameType === "dice" && config.dice) {
      return calculateDiceMinigameStats(config.dice, state.minigamePlayCount);
    }
    return null;
  }, [config, state.minigamePlayCount]);

  const isDiceType = config.minigameType === "dice";

  return (
    <Section
      title="미니 게임"
      description={minigameDescription(config.minigameType) ?? undefined}
      foldable
      foldStateKey="event-shop-section::mini-game"
      defaultExpanded={true}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">
          {isDiceType ? "주사위 횟수" : "플레이 회차"}
        </p>
        <NumberInput value={state.minigamePlayCount} onChange={actions.setMinigamePlayCount} />
      </div>

      <div className="my-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-semibold">획득 보상</p>
        {isDiceType && diceStats && state.minigamePlayCount > 0 && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300 my-2">
            예상 완주 횟수 : <span className="font-medium">{diceStats.estimatedLaps.toFixed(2)}</span>바퀴
          </p>
        )}
        {state.minigamePlayCount > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {rewards.map(({ resourceType, resourceUid, quantity, rarity }) => {
              return (
                <ResourceCard
                  key={`${resourceType}:${resourceUid}:${rarity ?? ""}`}
                  resourceType={resourceType}
                  itemUid={resourceUid}
                  rarity={rarity}
                  label={resourceCountLabel(quantity)}
                />
              );
            })}
          </div>
        ) : (
          <div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {isDiceType ? "주사위 던지기 횟수를 입력해주세요" : "플레이 횟수를 입력해주세요"}
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
