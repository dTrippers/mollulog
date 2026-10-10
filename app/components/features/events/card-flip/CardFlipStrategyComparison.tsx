import { Callout, NumberInput, ResourceCard, Section } from "~/components/primitives";
import {
  CARD_FLIP_STRATEGIES,
  type MinigameConfig,
} from "~/domain/event-shop";
import type { CardFlipStrategyResult } from "~/domain/card-flip-strategy";
import { cardFlipLocale } from "~/locales/ko";
import type { EventShopPlanContext } from "../shop/ShopCalculatorScreen";
import { resourceCountLabel } from "../shop/utils";

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

  return (
    <Section title={cardFlipLocale.strategyTitle} description={cardFlipLocale.strategyDescription}>
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {CARD_FLIP_STRATEGIES.map((strategy) => {
            const result = comparison.find((item) => item.strategy === strategy);
            const selected = plan.state.cardFlipStrategy === strategy;
            const strategyCopy = cardFlipLocale.strategies[strategy];
            const label = strategyCopy.label(maxDrawCount);
            const rule = strategyCopy.rule(maxDrawCount);
            const labelId = `card-flip-strategy-${strategy}-label`;
            const ruleId = `card-flip-strategy-${strategy}-rule`;

            return (
              <label
                key={strategy}
                className={`flex cursor-pointer flex-col gap-4 rounded-md border bg-card p-3 has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${
                  selected ? "border-primary ring-1 ring-primary bg-primary/5" : "border-transparent"
                }`}
              >
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

                <div className="flex min-w-0 items-start gap-2 lg:min-h-20">
                  <span
                    aria-hidden="true"
                    className={`mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                      selected ? "border-primary" : "border-muted-foreground/50"
                    }`}
                  >
                    {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="flex min-w-0 items-center gap-2">
                      <span id={labelId} className="min-w-0 break-keep font-semibold" title={label}>
                        {label}
                      </span>
                      {selected ? (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 text-xs font-medium text-primary">
                          {cardFlipLocale.selectedBadge}
                        </span>
                      ) : null}
                    </div>
                    <p id={ruleId} className="text-xs text-muted-foreground">
                      {rule}
                    </p>
                  </div>
                </div>

                {cardCount > 0 && result ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground">{cardFlipLocale.costLabel}</p>
                      {result.costs.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity }) => (
                        <div
                          key={`${resourceType}:${resourceUid}`}
                          className="flex h-8 min-w-0 items-center gap-2"
                        >
                          <ResourceCard
                            resourceType={resourceType}
                            itemUid={resourceUid}
                            imageUrl={imageUrl ?? undefined}
                            size="sm"
                            name={resourceName}
                          />
                          <span className="min-w-0 truncate text-sm" title={resourceName}>
                            {resourceName}
                          </span>
                          <span className="ml-auto shrink-0 font-semibold tabular-nums">
                            {quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-xs text-muted-foreground">{cardFlipLocale.rewardLabel}</p>
                      <table className="w-full table-fixed text-sm">
                        <thead>
                          <tr className="h-5 text-xs text-muted-foreground">
                            <th scope="col" className="text-left font-normal">
                              {cardFlipLocale.rewardHeaders.resource}
                            </th>
                            <th scope="col" className="w-16 text-right font-normal">
                              {cardFlipLocale.rewardHeaders.quantity}
                            </th>
                            <th scope="col" className="w-[72px] pl-2 text-right font-normal">
                              {cardFlipLocale.rewardHeaders.per100}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rewards.map(
                            ({ resourceType, resourceUid, resourceName, imageUrl, rarity, quantity, per100Cards }) => (
                              <tr key={`${resourceType}:${resourceUid}:${rarity ?? ""}`} className="h-8">
                                <td className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <ResourceCard
                                      resourceType={resourceType}
                                      itemUid={resourceUid}
                                      imageUrl={imageUrl ?? undefined}
                                      rarity={rarity}
                                      size="sm"
                                      name={resourceName}
                                    />
                                    <span className="min-w-0 truncate" title={resourceName}>
                                      {resourceName}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-right tabular-nums">
                                  {formatStrategyAmount(quantity, 1)}
                                </td>
                                <td className="pl-2 text-right tabular-nums">
                                  {formatStrategyAmount(per100Cards, 2)}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
    </Section>
  );
}

function formatStrategyAmount(value: number, maximumFractionDigits: number): string {
  if (value >= 10000) return resourceCountLabel(value);
  return value.toLocaleString(undefined, { maximumFractionDigits });
}
