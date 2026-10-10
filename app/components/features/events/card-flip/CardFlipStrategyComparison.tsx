import { Callout, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { CardFlipStrategyResult } from "~/domain/card-flip-strategy";
import { CARD_FLIP_STRATEGIES, type CardFlipStrategy, type MinigameConfig, type RewardItem } from "~/domain/event-shop";
import { cardFlipLocale } from "~/locales/ko";
import type { EventShopPlanContext } from "../shop/ShopCalculatorScreen";
import { formatCardFlipAmount } from "../shop/card-flip";

export function CardFlipStrategyComparison({
  plan,
  cardFlip,
  comparison,
}: {
  plan: EventShopPlanContext;
  cardFlip: Extract<NonNullable<MinigameConfig["cardFlip"]>, { status: "available" }>;
  comparison: CardFlipStrategyResult[];
}) {
  const cardCount = plan.state.minigamePlayCount;
  const maxDrawCount = cardFlip.drawRules.maxDrawCount;
  const selectedStrategy = plan.state.cardFlipStrategy;
  const columns = CARD_FLIP_STRATEGIES.map((strategy) => comparison.find((result) => result.strategy === strategy));
  const rewardResources = uniqueResources(comparison.flatMap(({ rewards }) => rewards));
  const costResources = uniqueResources(comparison.flatMap(({ costs }) => costs));
  const firstCosts = columns[0]?.costs;
  const hasCommonCosts =
    firstCosts !== undefined &&
    columns.every(
      (result) =>
        result !== undefined &&
        result.costs.length === firstCosts.length &&
        firstCosts.every((payment) => {
          const cost = result.costs.find((item) => resourceKey(item) === resourceKey(payment));
          // Ignore floating-point noise from the expectation calculation, not meaningful cost differences.
          return (
            cost !== undefined &&
            Math.abs(cost.quantity - payment.quantity) <=
              Number.EPSILON * Math.max(1, cost.quantity, payment.quantity) * 32
          );
        }),
    );

  return (
    <Section title={cardFlipLocale.strategyTitle}>
      <NumberInput
        label={cardFlipLocale.countLabel}
        id="card-flip-detail-play-count"
        minValue={0}
        value={cardCount}
        onChange={plan.actions.setMinigamePlayCount}
      />

      {cardCount === 0 ? (
        <div className="mt-4">
          <Callout
            tone="info"
            title={cardFlipLocale.noCardCountTitle}
            description={cardFlipLocale.noCardCountDescription}
          />
        </div>
      ) : null}

      <fieldset className="mt-4">
        <legend className="sr-only">{cardFlipLocale.strategyControlLabel}</legend>
        <table className="w-full table-fixed text-sm" aria-label={cardFlipLocale.averageRewards}>
          <thead>
            <tr>
              <th scope="col" className="w-2/5 px-2 py-3 text-left text-xs font-normal text-muted-foreground sm:px-3">
                {cardCount > 0 ? cardFlipLocale.averageRewards : null}
              </th>
              {CARD_FLIP_STRATEGIES.map((strategy) => {
                const selected = selectedStrategy === strategy;
                const strategyCopy = cardFlipLocale.strategies[strategy];
                const labelId = `card-flip-strategy-${strategy}-label`;
                const ruleId = `card-flip-strategy-${strategy}-rule`;

                return (
                  <th
                    key={strategy}
                    scope="col"
                    className={`px-1 py-3 align-top font-normal sm:px-3 ${selected ? "bg-primary/10" : ""}`}
                  >
                    <label className="flex cursor-pointer flex-col gap-2 rounded-md has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary">
                      <input
                        type="radio"
                        name="card-flip-strategy"
                        value={strategy}
                        checked={selected}
                        onChange={() => plan.actions.setCardFlipStrategy(strategy)}
                        aria-labelledby={labelId}
                        aria-describedby={ruleId}
                        className="sr-only"
                      />
                      <span className="flex flex-col items-center gap-2 xl:flex-row xl:justify-end">
                        <span
                          aria-hidden="true"
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-primary" : "border-muted-foreground/50"
                          }`}
                        >
                          {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                        </span>
                        <span id={labelId} className="min-w-0 break-keep text-center text-sm font-medium xl:text-right">
                          {strategyCopy.shortLabel}
                        </span>
                      </span>
                      <span
                        id={ruleId}
                        className="break-words text-center text-xs font-normal text-muted-foreground xl:text-right"
                      >
                        {strategyCopy.rule(maxDrawCount)}
                      </span>
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          {cardCount > 0 ? (
            <tbody>
              {rewardResources.map((resource) => (
                <ResourceComparisonRow
                  key={resourceKey(resource)}
                  resource={resource}
                  quantities={columns.map(
                    (result) => result?.rewards.find((item) => resourceKey(item) === resourceKey(resource))?.quantity,
                  )}
                  selectedStrategy={selectedStrategy}
                  highlightMaximum
                />
              ))}
            </tbody>
          ) : null}
          {cardCount > 0 && !hasCommonCosts ? (
            <tfoot>
              <tr>
                <th colSpan={4} className="px-2 pb-1 pt-4 text-left text-xs font-normal text-muted-foreground sm:px-3">
                  {cardFlipLocale.costLabel}
                </th>
              </tr>
              {costResources.map((resource) => (
                <ResourceComparisonRow
                  key={resourceKey(resource)}
                  resource={resource}
                  quantities={columns.map(
                    (result) => result?.costs.find((item) => resourceKey(item) === resourceKey(resource))?.quantity,
                  )}
                  selectedStrategy={selectedStrategy}
                />
              ))}
            </tfoot>
          ) : null}
        </table>
      </fieldset>
    </Section>
  );
}

function ResourceComparisonRow({
  resource,
  quantities,
  selectedStrategy,
  highlightMaximum = false,
}: {
  resource: RewardItem;
  quantities: (number | undefined)[];
  selectedStrategy: CardFlipStrategy;
  highlightMaximum?: boolean;
}) {
  const availableQuantities = quantities.filter(
    (quantity): quantity is number => quantity !== undefined && Number.isFinite(quantity),
  );
  const maximum = Math.max(...availableQuantities);
  const tolerance = Number.EPSILON * Math.max(1, maximum) * 32;
  const hasDifferences =
    availableQuantities.length === CARD_FLIP_STRATEGIES.length &&
    availableQuantities.some((quantity) => maximum - quantity > tolerance);

  return (
    <tr className="even:bg-muted/30">
      <th scope="row" className="px-2 py-2 text-left font-normal sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ResourceCard
            resourceType={resource.resourceType}
            itemUid={resource.resourceUid}
            imageUrl={resource.imageUrl ?? undefined}
            rarity={resource.rarity}
            size="sm"
            name={resource.resourceName}
          />
          <span className="min-w-0 break-words text-foreground/85">
            {resource.resourceName ?? cardFlipLocale.resourceNameUnavailable}
          </span>
        </div>
      </th>
      {CARD_FLIP_STRATEGIES.map((strategy, index) => {
        const quantity = quantities[index];
        const isMaximum =
          highlightMaximum && hasDifferences && quantity !== undefined && maximum - quantity <= tolerance;
        return (
          <td
            key={strategy}
            className={`px-1 py-2 text-right tabular-nums text-foreground/85 dark:text-foreground/65 sm:px-3 ${
              selectedStrategy === strategy ? "bg-primary/10" : ""
            }`}
          >
            {quantity === undefined || !Number.isFinite(quantity) ? (
              cardFlipLocale.amountUnavailable
            ) : isMaximum ? (
              <strong className="font-semibold text-foreground" title={cardFlipLocale.maximumAmountDescription}>
                <span className="sr-only">{cardFlipLocale.maximumAmount} </span>
                {formatCardFlipAmount(quantity)}
              </strong>
            ) : (
              formatCardFlipAmount(quantity)
            )}
          </td>
        );
      })}
    </tr>
  );
}

function resourceKey(resource: RewardItem): string {
  return `${resource.resourceType}:${resource.resourceUid}:${resource.rarity ?? ""}`;
}

function uniqueResources(resources: RewardItem[]): RewardItem[] {
  return [...new Map(resources.map((resource) => [resourceKey(resource), resource])).values()];
}
