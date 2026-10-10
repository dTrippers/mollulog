import { AttributeBadge, Callout, ResourceCard, Section } from "~/components/primitives";
import type { CardFlipCard } from "~/domain/event-shop";
import { cardFlipLocale, getCardFlipRarity } from "~/locales/ko";
import { cardFlipCardAccessibleName } from "../shop/card-flip";
import { resourceCountLabel } from "../shop/utils";

type CardFlipDataState =
  | { status: "available"; cards: CardFlipCard[] }
  | { status: "unavailable" }
  | { status: "invalid" };

type CardFlipCardListProps = {
  cardFlip: CardFlipDataState;
};

export function CardFlipCardList({ cardFlip }: CardFlipCardListProps) {
  if (cardFlip.status === "unavailable") {
    return (
      <Section title="카드별 보상">
        <Callout title={cardFlipLocale.unavailableTitle} description={cardFlipLocale.unavailableDescription} />
      </Section>
    );
  }

  if (cardFlip.status === "invalid") {
    return (
      <Section title="카드별 보상">
        <div role="alert">
          <Callout
            tone="destructive"
            title={cardFlipLocale.invalidTitle}
            description={cardFlipLocale.invalidDescription}
          />
        </div>
      </Section>
    );
  }

  return (
    <Section
      title={cardFlipLocale.cardListTitle(cardFlip.cards.length)}
      description={cardFlipLocale.cardListDescription}
    >
      <ul aria-label="카드별 보상" className="flex flex-col gap-3 xl:grid xl:grid-cols-2">
        {cardFlip.cards.map((card) => {
          const rarity = getCardFlipRarity(card.rarity);
          const rewardKeyOccurrences = new Map<string, number>();

          return (
            <li key={card.uid} className="min-w-0 rounded-md bg-card p-3">
              <span className="sr-only">{cardFlipCardAccessibleName(card)}</span>
              <div aria-hidden="true" className="flex min-w-0 items-start gap-3">
                {card.imageUrl ? (
                  <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    <img
                      src={card.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={48}
                      height={64}
                      className="h-full w-full object-contain"
                    />
                    {rarity ? (
                      <span className="absolute right-0 bottom-0">
                        <AttributeBadge text={rarity.text} color={rarity.color} />
                      </span>
                    ) : null}
                  </span>
                ) : rarity ? (
                  <AttributeBadge text={rarity.text} color={rarity.color} />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {card.rewards.map((reward) => {
                    const baseKey = `${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}:${reward.quantity}`;
                    const occurrence = rewardKeyOccurrences.get(baseKey) ?? 0;
                    rewardKeyOccurrences.set(baseKey, occurrence + 1);
                    return (
                      <ResourceCard
                        key={`${baseKey}:${occurrence}`}
                        resourceType={reward.resourceType}
                        itemUid={reward.resourceUid}
                        imageUrl={reward.imageUrl ?? undefined}
                        rarity={reward.rarity}
                        label={resourceCountLabel(reward.quantity)}
                        name={reward.resourceName}
                      />
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
