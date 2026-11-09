import { CalculatorIcon } from "@heroicons/react/16/solid";
import { useMemo } from "react";
import { useOutletContext } from "react-router";
import { ShopSection } from "~/components/v2/features/events/ShopSection";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { PageAside, PageMain, PanelSheet, useV2Page } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { CARD_FLIP_STRATEGIES, type CardFlipStrategy, type RewardItem } from "~/domain/event-shop";
import { cardFlipCardAccessibleName, formatCardFlipAmount, summarizeCardFlipPlan } from "~/domain/event-shop/card-flip";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { cardFlipLocale, getCardFlipRarity } from "~/locales/ko";
import { ShopResultContents } from "./EventShopCalculator";
import { ShopMobileResultBar } from "./ShopMobileResultBar";

export default function CardFlipScreen() {
  const plan = useOutletContext<EventShopPlanContext>();
  const { stacked } = useV2Page();
  const config = plan.minigameConfig?.minigameType === "card_flip" ? plan.minigameConfig : null;
  const cardFlip = config?.cardFlip ?? { status: "unavailable" as const };
  const comparison = plan.cardFlipComparison ?? [];
  const selected = comparison.find(({ strategy }) => strategy === plan.state.cardFlipStrategy) ?? null;
  const summary =
    config && selected
      ? summarizeCardFlipPlan({
          config,
          cardCount: plan.state.minigamePlayCount,
          strategy: plan.state.cardFlipStrategy,
          costs: selected.costs,
          rewards: selected.rewards,
          collectableResources: plan.collectableResources,
          itemBreakdown: plan.stageCalculations.itemBreakdown,
          overriddenRequiredQuantities: plan.state.overriddenRequiredQuantities,
        })
      : null;
  const rewards = useMemo(() => uniqueRewards(comparison.flatMap(({ rewards }) => rewards)), [comparison]);
  const costs = useMemo(() => uniqueRewards(comparison.flatMap(({ costs }) => costs)), [comparison]);

  return (
    <>
      <PageMain>
        <div className={`space-y-v2-block-gap ${stacked ? "pb-28" : ""}`}>
          {cardFlip.status === "unavailable" ? (
            <StatusNotice tone="neutral">
              {cardFlipLocale.unavailableTitle} · {cardFlipLocale.unavailableDescription}
            </StatusNotice>
          ) : cardFlip.status === "invalid" ? (
            <StatusNotice tone="danger">
              {cardFlipLocale.invalidTitle} · {cardFlipLocale.invalidDescription}
            </StatusNotice>
          ) : (
            <>
              <ShopSection
                title={cardFlipLocale.strategyTitle}
                persistenceKey="event-shop-section::card-flip-strategy"
                variant="shop"
              >
                <label htmlFor="card-flip-count" className="flex flex-wrap items-center gap-3 text-sm text-v2-fg">
                  <span>{cardFlipLocale.countLabel}</span>
                  <NumberInput
                    id="card-flip-count"
                    grouped
                    aria-label={cardFlipLocale.countLabel}
                    showMin={false}
                    showMax={false}
                    className="w-28"
                    min={0}
                    value={plan.state.minigamePlayCount}
                    onValueChange={(nextCount) => {
                      if (nextCount !== plan.state.minigamePlayCount && nextCount > 0) {
                        trackGoogleAnalyticsEvent("minigame_calculated", { game: "card_flip" });
                      }
                      plan.actions.setMinigamePlayCount(nextCount);
                    }}
                  />
                </label>
                <p className="mt-3 text-xs text-v2-fg-tertiary">{cardFlipLocale.strategyDescription}</p>
                {plan.state.minigamePlayCount === 0 ? (
                  <StatusNotice tone="neutral" className="mt-3 rounded-md bg-v2-inset p-v2-block-p">
                    <div>
                      <p className="font-medium text-v2-fg">{cardFlipLocale.noCardCountTitle}</p>
                      <p className="mt-1 text-sm text-v2-fg-secondary">{cardFlipLocale.noCardCountDescription}</p>
                    </div>
                  </StatusNotice>
                ) : null}
                <StrategyTable
                  rewards={rewards}
                  costs={costs}
                  comparison={comparison}
                  selected={plan.state.cardFlipStrategy}
                  maxDrawCount={cardFlip.drawRules.maxDrawCount}
                  showRows={plan.state.minigamePlayCount > 0}
                  onSelect={(strategy) => {
                    if (strategy !== plan.state.cardFlipStrategy && plan.state.minigamePlayCount > 0) {
                      trackGoogleAnalyticsEvent("minigame_calculated", { game: "card_flip" });
                    }
                    plan.actions.setCardFlipStrategy(strategy);
                  }}
                />
              </ShopSection>

              {summary ? (
                <ShopSection
                  title={cardFlipLocale.currentPlan}
                  persistenceKey="event-shop-section::card-flip-current-plan"
                  variant="shop"
                >
                  <p className="text-xs text-v2-fg-secondary">
                    {cardFlipLocale.strategies[summary.strategy].label(
                      cardFlip.status === "available" ? cardFlip.drawRules.maxDrawCount : 4,
                    )}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ResourceSummary label={cardFlipLocale.costLabel} resources={summary.costs} />
                    <ResourceSummary label={cardFlipLocale.averageRewards} resources={summary.rewards} />
                  </div>
                  <section
                    className={`mt-4 overflow-x-auto ${v2FocusRing}`}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: A horizontally scrollable table needs keyboard scrolling.
                    tabIndex={0}
                    aria-label="현재 계획 재화 표"
                  >
                    <table className="w-full min-w-[28rem] text-left text-sm">
                      <thead className="text-xs text-v2-fg-tertiary">
                        <tr>
                          <th className="p-2">재화</th>
                          <th className="p-2 text-right">필요</th>
                          <th className="p-2 text-right">획득</th>
                          <th className="p-2 text-right">남음/부족</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.resources.map(({ resource, breakdown }) => (
                          <tr key={`${resource.type}:${resource.uid}`} className="border-t border-v2-divider">
                            <th scope="row" className="p-2 font-medium text-v2-fg">
                              <span className="flex items-center gap-2">
                                <ResourceThumb
                                  itemUid={resource.uid}
                                  resourceType={resource.type}
                                  name={resource.name}
                                  size="sm"
                                />
                                {resource.name}
                              </span>
                            </th>
                            <td className="p-2 text-right tabular-nums text-v2-fg-secondary">
                              {breakdown.actualRequired.toLocaleString()}
                            </td>
                            <td className="p-2 text-right tabular-nums text-v2-fg-secondary">
                              {Math.round(breakdown.acquiredSubtotal).toLocaleString()}
                            </td>
                            <td
                              className={`p-2 text-right font-semibold tabular-nums ${breakdown.remaining >= 0 ? "text-v2-success" : "text-v2-danger"}`}
                            >
                              {breakdown.remaining >= 0 ? "+" : "−"}
                              {Math.abs(Math.round(breakdown.remaining)).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </ShopSection>
              ) : null}

              <ShopSection
                title={cardFlipLocale.cardListTitle(cardFlip.cards.length)}
                persistenceKey="event-shop-section::card-flip-cards"
                variant="shop"
              >
                <ul aria-label="카드별 보상" className="grid gap-v2-block-gap sm:grid-cols-2">
                  {cardFlip.cards.map((card) => {
                    const rarity = getCardFlipRarity(card.rarity);
                    return (
                      <li
                        key={card.uid}
                        className="flex min-w-0 items-start gap-3 rounded-md bg-v2-surface p-v2-tile-p"
                      >
                        <span className="sr-only">{cardFlipCardAccessibleName(card)}</span>
                        {card.imageUrl ? (
                          <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-v2-inset">
                            <img src={card.imageUrl} alt="" loading="lazy" className="size-full object-contain" />
                            {rarity ? (
                              <span className="absolute right-0 bottom-0 rounded-tl bg-v2-scrim px-1 text-[0.625rem] font-semibold leading-4 text-v2-on-media">
                                {rarity.text}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          {!card.imageUrl && rarity ? (
                            <span className="mr-2 inline-flex rounded bg-v2-filled px-1.5 py-0.5 text-xs font-semibold text-v2-fg">
                              {rarity.text}
                            </span>
                          ) : null}
                          <div className="flex flex-wrap gap-1">
                            {keyedRewards(card.rewards).map(({ key, reward }) => (
                              <RewardChip key={key} reward={reward} />
                            ))}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ShopSection>
            </>
          )}
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet panelId="result" title="계산 결과" Icon={CalculatorIcon}>
          <ShopResultContents plan={plan} />
        </PanelSheet>
      </PageAside>
      <ShopMobileResultBar plan={plan} />
    </>
  );
}

function StrategyTable({
  rewards,
  costs,
  comparison,
  selected,
  maxDrawCount,
  showRows,
  onSelect,
}: {
  rewards: RewardItem[];
  costs: RewardItem[];
  comparison: NonNullable<EventShopPlanContext["cardFlipComparison"]>;
  selected: CardFlipStrategy;
  maxDrawCount: number;
  showRows: boolean;
  onSelect: (strategy: CardFlipStrategy) => void;
}) {
  return (
    <div className="mt-3">
      <fieldset>
        <legend className="sr-only">{cardFlipLocale.strategyControlLabel}</legend>
        <table aria-label={cardFlipLocale.averageRewards} className="w-full table-fixed text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-10 p-1 text-left text-xs font-normal text-v2-fg-tertiary sm:w-2/5 sm:p-2">
                {showRows ? <span className="sr-only sm:not-sr-only">{cardFlipLocale.averageRewards}</span> : null}
              </th>
              {CARD_FLIP_STRATEGIES.map((strategy) => {
                const strategyCopy = cardFlipLocale.strategies[strategy];
                const labelId = `card-flip-strategy-${strategy}-label`;
                const ruleId = `card-flip-strategy-${strategy}-rule`;
                const isSelected = selected === strategy;

                return (
                  <th
                    key={strategy}
                    scope="col"
                    className={`p-1 align-top text-xs font-medium sm:p-2 ${isSelected ? "bg-v2-highlight text-v2-fg" : "text-v2-fg-secondary"}`}
                  >
                    <label
                      className={`flex h-full cursor-pointer flex-col gap-2 rounded-md p-1 text-center ${v2FocusRing}`}
                    >
                      <input
                        type="radio"
                        name="card-flip-strategy"
                        value={strategy}
                        checked={isSelected}
                        onChange={() => onSelect(strategy)}
                        aria-labelledby={labelId}
                        aria-describedby={ruleId}
                        className="sr-only"
                      />
                      <span className="flex flex-col items-center gap-1 sm:flex-row sm:justify-end sm:gap-2">
                        <span
                          aria-hidden="true"
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                            isSelected ? "border-v2-fg" : "border-v2-fg-tertiary"
                          }`}
                        >
                          {isSelected ? <span className="size-2 rounded-full bg-v2-fg" /> : null}
                        </span>
                        <span id={labelId} className="min-w-0 break-keep text-center text-xs font-medium sm:text-right">
                          {strategyCopy.shortLabel}
                        </span>
                      </span>
                      <span
                        id={ruleId}
                        className="break-keep text-center text-[0.625rem] font-normal leading-snug sm:text-right"
                      >
                        {strategyCopy.rule(maxDrawCount)}
                      </span>
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          {showRows ? (
            <tbody>
              {rewards.map((reward) => (
                <ComparisonRow
                  key={rewardKey(reward)}
                  resource={reward}
                  comparison={comparison}
                  field="rewards"
                  selected={selected}
                />
              ))}
              {costs.length > 0 ? (
                <tr>
                  <th colSpan={4} className="px-1 pt-4 text-left text-xs font-medium text-v2-fg-tertiary sm:px-2">
                    {cardFlipLocale.costLabel}
                  </th>
                </tr>
              ) : null}
              {costs.map((cost) => (
                <ComparisonRow
                  key={`cost-${rewardKey(cost)}`}
                  resource={cost}
                  comparison={comparison}
                  field="costs"
                  selected={selected}
                />
              ))}
            </tbody>
          ) : null}
        </table>
      </fieldset>
    </div>
  );
}

function ComparisonRow({
  resource,
  comparison,
  field,
  selected,
}: {
  resource: RewardItem;
  comparison: NonNullable<EventShopPlanContext["cardFlipComparison"]>;
  field: "rewards" | "costs";
  selected: CardFlipStrategy;
}) {
  const resourceName = resource.resourceName ?? cardFlipLocale.resourceNameUnavailable;
  const quantities = CARD_FLIP_STRATEGIES.map(
    (strategy) =>
      comparison
        .find((result) => result.strategy === strategy)
        ?.[field].find((item) => rewardKey(item) === rewardKey(resource))?.quantity,
  );
  const availableQuantities = quantities.filter(
    (quantity): quantity is number => quantity !== undefined && Number.isFinite(quantity),
  );
  const maximum = Math.max(...availableQuantities);
  const tolerance = Number.EPSILON * Math.max(1, maximum) * 32;
  const hasDifferences =
    availableQuantities.length === CARD_FLIP_STRATEGIES.length &&
    availableQuantities.some((quantity) => maximum - quantity > tolerance);

  return (
    <tr className="border-t border-v2-divider">
      <th scope="row" className="w-10 p-1 text-left font-normal text-v2-fg-secondary sm:w-2/5 sm:p-2">
        <span className="flex min-w-0 items-center">
          <ResourceThumb
            itemUid={resource.resourceUid}
            resourceType={resource.resourceType}
            name={resourceName}
            imageUrl={resource.imageUrl ?? undefined}
            rarity={resource.rarity}
            size="sm"
            nameTooltip
          />
          <span className="sr-only sm:not-sr-only sm:ml-2 sm:min-w-0 sm:break-words">{resourceName}</span>
        </span>
      </th>
      {CARD_FLIP_STRATEGIES.map((strategy, index) => {
        const amount = quantities[index];
        const isMaximum =
          field === "rewards" &&
          hasDifferences &&
          amount !== undefined &&
          Number.isFinite(amount) &&
          maximum - amount <= tolerance;
        return (
          <td
            key={strategy}
            className={`p-1 text-right tabular-nums sm:p-2 ${selected === strategy ? "bg-v2-highlight text-v2-fg" : "text-v2-fg-secondary"}`}
          >
            {amount === undefined || !Number.isFinite(amount) ? (
              cardFlipLocale.amountUnavailable
            ) : isMaximum ? (
              <strong className="font-semibold" title={cardFlipLocale.maximumAmountDescription}>
                <span className="sr-only">{cardFlipLocale.maximumAmount} </span>
                {formatCardFlipAmount(amount)}
              </strong>
            ) : (
              formatCardFlipAmount(amount)
            )}
          </td>
        );
      })}
    </tr>
  );
}

function ResourceSummary({ label, resources }: { label: string; resources: RewardItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-v2-fg">{label}</h3>
      <div className="mt-2 flex flex-wrap gap-1">
        {resources.map((resource) => (
          <RewardChip key={rewardKey(resource)} reward={resource} />
        ))}
      </div>
    </div>
  );
}

function RewardChip({ reward }: { reward: RewardItem }) {
  return (
    <ResourceThumb
      itemUid={reward.resourceUid}
      resourceType={reward.resourceType}
      name={reward.resourceName}
      imageUrl={reward.imageUrl ?? undefined}
      rarity={reward.rarity}
      quantity={Math.round(reward.quantity)}
      size="md"
    />
  );
}

function uniqueRewards(resources: RewardItem[]) {
  return [...new Map(resources.map((resource) => [rewardKey(resource), resource])).values()];
}

function rewardKey(resource: RewardItem) {
  return `${resource.resourceType}:${resource.resourceUid}:${resource.rarity ?? ""}`;
}

function keyedRewards(rewards: RewardItem[]) {
  const occurrences = new Map<string, number>();
  return rewards.map((reward) => {
    const identity = JSON.stringify(reward);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { reward, key: `${identity}:${occurrence}` };
  });
}
