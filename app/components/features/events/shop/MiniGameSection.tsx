import { useMemo } from "react";
import { FilterButtons, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { MinigameConfig } from "~/domain/event-shop";
import { minigameDescription } from "~/locales/ko";
import { ClueSearchSection } from "./ClueSearchSection";
import type { ClueSearchExchange } from "./clue-search";
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
  exchange?: ClueSearchExchange | null;
};

export function MiniGameSection({ config, state, actions, exchange = null }: MiniGameSectionProps) {
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

  if (config.minigameType === "clue_search") {
    return <ClueSearchSection config={config} state={state} actions={actions} exchange={exchange} />;
  }

  return (
    <Section
      title="미니 게임"
      description={minigameDescription(config.minigameType) ?? undefined}
      collapsible
      persistenceKey="event-shop-section::mini-game"
      defaultExpanded={true}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{isDiceType ? "주사위 횟수" : "플레이 회차"}</p>
        <NumberInput value={state.minigamePlayCount} onChange={actions.setMinigamePlayCount} />
      </div>

      {showPaymentQuantityMode && (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">소모 재화 기준</p>
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
        <div className="mt-4 rounded-md bg-card p-3">
          <p className="text-sm font-semibold text-foreground">필요 재화</p>
          <div className="mt-2 flex flex-wrap gap-1">
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

      <div className="my-4 rounded-md bg-card p-3">
        <p className="text-sm font-semibold text-foreground">획득 보상</p>
        {isDiceType && diceStats && state.minigamePlayCount > 0 && (
          <p className="my-2 text-sm text-muted-foreground">
            예상 완주 횟수 : <span className="font-medium">{diceStats.estimatedLaps.toFixed(2)}</span>바퀴
          </p>
        )}
        {state.minigamePlayCount > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
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
            <p className="text-sm text-muted-foreground">
              {isDiceType ? "주사위 던지기 횟수를 입력해주세요" : "플레이 횟수를 입력해주세요"}
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
