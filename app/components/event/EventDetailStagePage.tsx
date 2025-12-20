import { BoltIcon } from "@heroicons/react/16/solid";
import ResourceCard from "~/components/atoms/item/ResourceCard";
import { SubTitle } from "~/components/atoms/typography";
import EventItemBonus from "./EventItemBonus";
import { useBonusCalculation } from "./shop/hooks";
import type { EventRewardBonus } from "./shop/types";

type EventDetailStagePageProps = {
  stages: {
    uid: string;
    name: string;
    entryAp: number;
    index: string;
    rewards: {
      amount: number;
      rewardRequirement: string | null;
      chance: string | null;
      item: {
        uid: string;
        category: string;
        rarity: number;
      } | null;
    }[];
  }[];

  eventRewardBonus: EventRewardBonus[];

  recruitedStudentUids: string[];
  signedIn: boolean;
};

export default function EventDetailStagePage({ stages, eventRewardBonus, recruitedStudentUids, signedIn }: EventDetailStagePageProps) {
  const { bonusSummary } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: recruitedStudentUids,
  });

  return (
    <div>
      <SubTitle text="이벤트 아이템" />
      {bonusSummary.map(({ uid, appliedStrikerRatio, appliedSpecialRatio, maxStrikerRatio, maxSpecialRatio }) => {
        const itemBonus = eventRewardBonus.find(({ uid: appliedUid }) => appliedUid === uid);
        return (
          <EventItemBonus
            key={uid}
            itemUid={uid}
            itemName={itemBonus?.name ?? ""}
            appliedRatio={appliedStrikerRatio.plus(appliedSpecialRatio)}
            maxRatio={maxStrikerRatio.plus(maxSpecialRatio)}
            rewardBonuses={itemBonus?.rewardBonuses ?? []}
            selectedBonusStudentUids={recruitedStudentUids}
            signedIn={signedIn}
          />
        );
      })}

      <SubTitle text="퀘스트" />
      {stages.map(({ uid, name, entryAp, index, rewards }) => {
        const sortedRewards = [...rewards].sort((a, b) => {
          // Place rewards with rewardRequirement first
          const aHasRequirement = a.rewardRequirement !== null;
          const bHasRequirement = b.rewardRequirement !== null;
          if (aHasRequirement !== bHasRequirement) {
            return aHasRequirement ? -1 : 1;
          }

          // Sort by category
          const aCategory = a.item?.category ?? "";
          const bCategory = b.item?.category ?? "";
          if (aCategory !== bCategory) {
            return aCategory.localeCompare(bCategory);
          }

          // Sort by item uid
          const aUid = a.item?.uid ?? "";
          const bUid = b.item?.uid ?? "";
          return aUid.localeCompare(bUid);
        });

        return (
          <div key={uid} className="my-2 p-4 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <div className="rounded-lg flex items-center gap-2">
              <div className="shrink-0 size-6 border border-neutral-200 dark:border-neutral-700 rounded flex items-center justify-center text-sm">
                {index}
              </div>
              <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100 grow">{name}</p>
              <div className="flex items-center gap-0.5 border border-green-600 text-green-600 text-xs font-medium px-1 rounded">
                <BoltIcon className="size-2.5" />
                <span>{entryAp}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1">
              {sortedRewards.map(({ amount, item, rewardRequirement, chance }) => {
                if (!item) {
                  return null;
                }

                const label = itemLabel({ rewardRequirement, chance });
                return (
                  <div key={`${item.uid}-${amount}-${rewardRequirement}`}>
                    <ResourceCard itemUid={item.uid} rarity={item.rarity} label={amount} />
                    {label && <p className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">{label}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function itemLabel({ rewardRequirement, chance }: { rewardRequirement: string | null; chance: string | null }): string {
  const labels = [];
  if (rewardRequirement === "first_clear") {
    labels.push("초회");
  }
  if (chance) {
    const percentage = (Number(chance) * 100).toFixed(2).replace(/\.?0+$/, "");
    labels.push(`${percentage}%`);
  }

  return labels.join("·");
}