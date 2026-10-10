import { RectangleStackIcon } from "@heroicons/react/24/outline";
import { useMemo } from "react";
import PageLink from "~/components/features/layout/PageLink";
import { NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { MinigameConfig } from "~/domain/event-shop";
import { cardFlipLocale } from "~/locales/ko";
import type { ShopActions, ShopState } from "./hooks";
import { calculateMinigamePaymentCosts, calculateMinigameRewards, resourceCountLabel } from "./utils";

type CardFlipSectionProps = {
  config: MinigameConfig;
  eventUid: string;
  state: ShopState;
  actions: ShopActions;
};

export function CardFlipSection({ config, eventUid, state, actions }: CardFlipSectionProps) {
  const perCardCosts = useMemo(() => calculateMinigamePaymentCosts(config, 1), [config]);
  const totalCosts = useMemo(
    () => calculateMinigamePaymentCosts(config, state.minigamePlayCount),
    [config, state.minigamePlayCount],
  );
  const averageRewards = useMemo(
    () => calculateMinigameRewards(config, state.minigamePlayCount),
    [config, state.minigamePlayCount],
  );
  const cardCount = config.cardFlip?.status === "available" ? config.cardFlip.cards.length : null;

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
          aria-describedby="card-flip-count-description"
          minValue={0}
          value={state.minigamePlayCount}
          onChange={actions.setMinigamePlayCount}
        />
        <p id="card-flip-count-description" className="mt-1 text-sm text-muted-foreground">
          {cardFlipLocale.countDescription}
        </p>

        <div className="mt-4 rounded-md bg-card p-3">
          <p className="text-sm font-semibold text-foreground">{cardFlipLocale.requiredResources}</p>
          <div className="mt-2 flex flex-wrap gap-x-7 gap-y-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{cardFlipLocale.perCardCost}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {perCardCosts.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity }) => (
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
            {state.minigamePlayCount > 0 ? (
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{cardFlipLocale.totalCost(state.minigamePlayCount)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {totalCosts.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity }) => (
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
            ) : null}
          </div>
        </div>

        {state.minigamePlayCount > 0 ? (
          <div className="my-4 rounded-md bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{cardFlipLocale.averageRewards}</p>
              <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {cardFlipLocale.averageBadge}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{cardFlipLocale.averageDisclosure}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {averageRewards.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity, rarity }) => (
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
        ) : null}

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
      </Section>
    </div>
  );
}
