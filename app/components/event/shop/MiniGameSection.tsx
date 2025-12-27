import { useMemo } from "react";
import { NumberInput } from "~/components/atoms/form";
import { ResourceCard } from "~/components/atoms/item";
import { Section } from "~/components/ui";
import type { ShopState, ShopActions } from "./hooks";
import { resourceCountLabel, calculateMinigameRewards } from "./utils";
import type { MinigameConfig } from "./constants";

type MiniGameSectionProps = {
  title: string;
  config: MinigameConfig;
  state: ShopState;
  actions: ShopActions;
};

export function MiniGameSection({ title, config, state, actions }: MiniGameSectionProps) {
  const rewards = useMemo(
    () => calculateMinigameRewards(config, state.minigamePlayCount),
    [config, state.minigamePlayCount],
  );

  return (
    <Section
      title="미니 게임"
      description={title}
      foldable
      foldStateKey="event-shop-section::mini-game"
      defaultExpanded={true}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">플레이 회차</p>
        <NumberInput value={state.minigamePlayCount} onChange={actions.setMinigamePlayCount} />
      </div>
      <div className="my-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">획득 보상</p>
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
            <p className="text-sm text-neutral-500 dark:text-neutral-400">플레이 횟수를 입력해주세요</p>
          </div>
        )}
      </div>

      <p className="my-4 text-sm text-neutral-500 dark:text-neutral-400">
        {config.description}
      </p>
    </Section>
  );
}
