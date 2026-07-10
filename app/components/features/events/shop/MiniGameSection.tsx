import { useMemo } from "react";
import { FilterButtons, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { MinigameConfig } from "~/domain/event-shop";
import { minigameDescription } from "~/locales/ko";
import type { ShopActions, ShopState } from "./hooks";
import {
  calculateDiceMinigameStats,
  calculateMinigamePaymentCosts,
  calculateMinigameRewards,
  hasVariableMinigamePayment,
  resourceCountLabel,
} from "./utils";

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
  const paymentCosts = useMemo(
    () => calculateMinigamePaymentCosts(config, state.minigamePlayCount, state.minigamePaymentQuantityMode),
    [config, state.minigamePaymentQuantityMode, state.minigamePlayCount],
  );
  const showPaymentQuantityMode = hasVariableMinigamePayment(config);

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
      collapsible
      persistenceKey="event-shop-section::mini-game"
      defaultExpanded={true}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">
          {isDiceType ? "주사위 횟수" : "플레이 회차"}
        </p>
        <NumberInput value={state.minigamePlayCount} onChange={actions.setMinigamePlayCount} />
      </div>

      {showPaymentQuantityMode && (
        <div className="mt-3">
          <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">소모 재화 기준</p>
          <FilterButtons
            exclusive
            atLeastOne
            size="sm"
            buttonProps={[
              {
                text: "최소값",
                active: state.minigamePaymentQuantityMode === "min",
                onToggle: (activated) => {
                  if (activated) actions.setMinigamePaymentQuantityMode("min");
                },
              },
              {
                text: "기대값",
                active: state.minigamePaymentQuantityMode === "expected",
                onToggle: (activated) => {
                  if (activated) actions.setMinigamePaymentQuantityMode("expected");
                },
              },
              {
                text: "최대값",
                active: state.minigamePaymentQuantityMode === "max",
                onToggle: (activated) => {
                  if (activated) actions.setMinigamePaymentQuantityMode("max");
                },
              },
            ]}
          />
        </div>
      )}

      {state.minigamePlayCount > 0 && paymentCosts.length > 0 && (
        <div className="mt-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <p className="text-sm text-neutral-700 dark:text-neutral-200 font-semibold">필요 재화</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {paymentCosts.map(({ resourceType, resourceUid, resourceName, quantity }) => (
              <ResourceCard
                key={`${resourceType}:${resourceUid}`}
                resourceType={resourceType}
                itemUid={resourceUid}
                label={resourceCountLabel(quantity)}
                name={resourceName}
              />
            ))}
          </div>
        </div>
      )}

      <div className="my-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-semibold">획득 보상</p>
        {isDiceType && diceStats && state.minigamePlayCount > 0 && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300 my-2">
            예상 완주 횟수 : <span className="font-medium">{diceStats.estimatedLaps.toFixed(2)}</span>바퀴
          </p>
        )}
        {state.minigamePlayCount > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {rewards.map(({ resourceType, resourceUid, resourceName, quantity, rarity }) => {
              return (
                <ResourceCard
                  key={`${resourceType}:${resourceUid}:${rarity ?? ""}`}
                  resourceType={resourceType}
                  itemUid={resourceUid}
                  rarity={rarity}
                  label={resourceCountLabel(quantity)}
                  name={resourceName}
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
