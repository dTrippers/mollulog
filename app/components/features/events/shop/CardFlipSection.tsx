import { RectangleStackIcon } from "@heroicons/react/24/outline";
import PageLink from "~/components/features/layout/PageLink";
import { NumberInput, ResourceCard, Section, SegmentedControl } from "~/components/primitives";
import { CARD_FLIP_STRATEGIES, type CardFlipStrategy, type MinigameConfig } from "~/domain/event-shop";
import type { CardFlipStrategyResult } from "~/domain/card-flip-strategy";
import { cardFlipLocale } from "~/locales/ko";
import type { ShopActions, ShopState } from "./hooks";
import { resourceCountLabel } from "./utils";



type CardFlipSectionProps = {
  config: MinigameConfig;
  eventUid: string;
  state: ShopState;
  actions: ShopActions;
  comparison: CardFlipStrategyResult[] | null;
};

export function CardFlipSection({ config, eventUid, state, actions, comparison }: CardFlipSectionProps) {
  const cardCount = config.cardFlip?.status === "available" ? config.cardFlip.cards.length : null;
  const selectedResult = comparison?.find(({ strategy }) => strategy === state.cardFlipStrategy) ?? null;
  const strategyText = cardFlipLocale.strategies[state.cardFlipStrategy];
  const strategyLabel = strategyText.label(config.cardFlip?.status === "available" ? config.cardFlip.drawRules.maxDrawCount : 4);
  const strategyRule = strategyText.rule(config.cardFlip?.status === "available" ? config.cardFlip.drawRules.maxDrawCount : 4);
  const hasResult = state.minigamePlayCount > 0 && selectedResult !== null;

  return (
    <div id="card-flip" className="scroll-mt-16">
      <Section
        title={cardFlipLocale.menuTitle}
        description={cardFlipLocale.minigameDescription}
        collapsible
        persistenceKey="event-shop-section::mini-game"
        defaultExpanded={true}
      >
        <NumberInput
          label={cardFlipLocale.countLabel}
          id="card-flip-play-count"
          minValue={0}
          value={state.minigamePlayCount}
          onChange={actions.setMinigamePlayCount}
        />

        <div className="mt-4">
          <SegmentedControl<CardFlipStrategy>
            ariaLabel={cardFlipLocale.strategyControlLabel}
            value={state.cardFlipStrategy}
            onChange={actions.setCardFlipStrategy}
            options={CARD_FLIP_STRATEGIES.map((strategy) => ({
              value: strategy,
              label:
                cardFlipLocale.strategies[strategy].shortLabel,
            }))}
          />
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {strategyLabel} · {strategyRule}
        </p>

        {hasResult && selectedResult ? (
          <div className="mt-4 flex flex-col gap-4 rounded-md bg-card p-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">{cardFlipLocale.costLabel}</p>
              <div className="flex flex-wrap items-center gap-2">
                {selectedResult.costs.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity }) => (
                  <ResourceCard
                    key={`${resourceType}:${resourceUid}`}
                    resourceType={resourceType}
                    itemUid={resourceUid}
                    imageUrl={imageUrl ?? undefined}
                    label={resourceCountLabel(quantity)}
                    name={resourceName}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">{cardFlipLocale.averageRewards}</p>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {cardFlipLocale.averageBadge}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{cardFlipLocale.averageDisclosure}</p>
              <div className="flex flex-wrap gap-1">
                {selectedResult.rewards.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity, rarity }) => (
                  <ResourceCard
                    key={`${resourceType}:${resourceUid}:${rarity ?? ""}`}
                    resourceType={resourceType}
                    itemUid={resourceUid}
                    imageUrl={imageUrl ?? undefined}
                    rarity={rarity}
                    label={resourceCountLabel(quantity)}
                    name={resourceName}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <PageLink
            Icon={RectangleStackIcon}
            title={cardFlipLocale.listLinkTitle}
            description={
              cardCount === null
                ? cardFlipLocale.listLinkDescriptionWithoutCount
                : cardFlipLocale.listLinkDescription(cardCount)
            }
            to={`/events/${eventUid}/shop/card-flip`}
          />
        </div>
      </Section>
    </div>
  );
}
