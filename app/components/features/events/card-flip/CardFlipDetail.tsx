import { ArrowPathIcon, ShoppingCartIcon } from "@heroicons/react/16/solid";
import PageLink from "~/components/features/layout/PageLink";
import { Callout, ResourceCard, Section } from "~/components/primitives";
import type { MinigamePayment, RewardItem } from "~/domain/event-shop";
import { cardFlipLocale } from "~/locales/ko";
import { summarizeCardFlipPlan } from "../shop/card-flip";
import type { EventShopPlanContext } from "../shop/ShopCalculatorScreen";
import { resourceCountLabel } from "../shop/utils";
import { CardFlipCardList } from "./CardFlipCardList";

type CardFlipDetailProps = {
  eventUid: string;
  plan: EventShopPlanContext;
};

export function CardFlipDetail({ eventUid, plan }: CardFlipDetailProps) {
  const config = plan.minigameConfig?.minigameType === "card_flip" ? plan.minigameConfig : null;
  const cardFlip = config?.cardFlip ?? { status: "unavailable" as const };
  const cardCount = plan.state.minigamePlayCount;
  const summary = config
    ? summarizeCardFlipPlan({
        config,
        cardCount,
        collectableResources: plan.collectableResources,
        itemBreakdown: plan.stageCalculations.itemBreakdown,
        overriddenRequiredQuantities: plan.state.overriddenRequiredQuantities,
      })
    : null;
  const cardCostStatement =
    cardFlip.status === "available" && cardFlip.cardCost.resourceName
      ? cardFlipLocale.cardCostStatement(cardFlip.cardCost.resourceName, cardFlip.cardCost.quantity)
      : null;
  const shopLink = `/events/${eventUid}/shop`;

  return (
    <div className="space-y-8">
      <CardFlipCardList cardFlip={cardFlip} />

      <Section title={cardFlipLocale.currentPlan} description={cardFlipLocale.currentPlanDescription}>
        {cardCount === 0 ? (
          <Callout
            tone="info"
            title={cardFlipLocale.noCardCountTitle}
            description={cardFlipLocale.noCardCountDescription}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-7 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{cardFlipLocale.cardCount}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{cardCount.toLocaleString()}</p>
              </div>
              {summary ? (
                <>
                  <PaymentSummary label={cardFlipLocale.perCardCost} payments={summary.perCardCosts} />
                  <PaymentSummary label={cardFlipLocale.totalCost(cardCount)} payments={summary.totalCosts} />
                  <RewardSummary rewards={summary.averageRewards} />
                </>
              ) : null}
            </div>

            {plan.isCalculating ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span>계산 중</span>
              </div>
            ) : null}

            {summary ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {summary.resources
                  .map(({ resource, breakdown }) => {
                    const requiredValue = Math.floor(breakdown.actualRequired);
                    const acquiredValue = Math.floor(breakdown.acquiredSubtotal);
                    const remainingValue = Math.floor(breakdown.remaining);
                    const requiredLines = breakdown.requiredLines.filter(({ value }) => Math.floor(value) !== 0);
                    const acquiredLines = breakdown.acquiredLines.filter(({ value }) => Math.floor(value) !== 0);
                    const showRequired = requiredValue !== 0;
                    const showAcquired = acquiredValue !== 0 || acquiredLines.length > 0;
                    const showRemaining = remainingValue !== 0;

                    return {
                      resource,
                      breakdown,
                      requiredValue,
                      acquiredValue,
                      remainingValue,
                      requiredLines,
                      acquiredLines,
                      showRequired,
                      showAcquired,
                      showRemaining,
                    };
                  })
                  .filter(
                    ({ showRequired, showAcquired, showRemaining }) => showRequired || showAcquired || showRemaining,
                  )
                  .map(
                    ({
                      resource,
                      breakdown,
                      requiredValue,
                      acquiredValue,
                      remainingValue,
                      requiredLines,
                      acquiredLines,
                      showRequired,
                      showAcquired,
                      showRemaining,
                    }) => (
                      <div key={resource.uid} className="flex items-start gap-2 rounded-md bg-card p-3">
                        <ResourceCard
                          itemUid={resource.uid}
                          resourceType={resource.type}
                          imageUrl={resource.imageUrl ?? undefined}
                          name={resource.name}
                        />
                        <div className="relative grow space-y-3 text-sm">
                          {showRequired ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground">필요 수량</span>
                                <span className="font-semibold text-foreground">{requiredValue.toLocaleString()}</span>
                              </div>
                              <div className="space-y-1 pl-2">
                                {breakdown.hasOverride ? (
                                  <p className="text-xs text-muted-foreground">입력한 목표 수량</p>
                                ) : (
                                  <BreakdownLines lines={requiredLines} />
                                )}
                              </div>
                            </div>
                          ) : null}

                          {showAcquired ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground">획득 수량</span>
                                <span className="font-semibold text-foreground">{acquiredValue.toLocaleString()}</span>
                              </div>
                              <div className="space-y-1 pl-2">
                                <BreakdownLines lines={acquiredLines} />
                              </div>
                            </div>
                          ) : null}

                          {showRemaining ? (
                            <div className="pt-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground">
                                  {remainingValue > 0 ? "남은 수량" : "부족 수량"}
                                </span>
                                <span
                                  className={`font-bold ${remainingValue > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                >
                                  {remainingValue.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ),
                  )}
              </div>
            ) : null}
          </>
        )}
      </Section>

      <PageLink
        Icon={ShoppingCartIcon}
        title={cardCount === 0 ? cardFlipLocale.enterCardCount : cardFlipLocale.returnToCalculator}
        description={
          cardCount === 0 && cardCostStatement ? cardCostStatement : cardFlipLocale.returnToCalculatorDescription
        }
        to={shopLink}
      />
    </div>
  );
}

function PaymentSummary({ label, payments }: { label: string; payments: MinigamePayment[] }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {payments.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity }) => (
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
  );
}

function RewardSummary({ rewards }: { rewards: RewardItem[] }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">{cardFlipLocale.averageRewards}</p>
        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          {cardFlipLocale.averageBadge}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{cardFlipLocale.averageDisclosure}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {rewards.map(({ resourceType, resourceUid, resourceName, imageUrl, quantity, rarity }) => (
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
  );
}

function BreakdownLines({ lines }: { lines: { label: string; value: number }[] }) {
  return (
    <>
      {lines
        .filter(({ value }) => Math.floor(value) !== 0)
        .map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-muted-foreground">
              <span className="mr-1.5">·</span>
              {label}
            </span>
            <span className="text-muted-foreground">{Math.floor(value).toLocaleString()}</span>
          </div>
        ))}
    </>
  );
}
