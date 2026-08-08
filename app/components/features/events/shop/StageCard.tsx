import { BoltIcon } from "@heroicons/react/16/solid";
import Decimal from "decimal.js";
import { memo } from "react";
import { NumberInput, ResourceCard, Toggle } from "~/components/primitives";
import type { Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

type StageCardProps = {
  stage: Stage;
  isEnabled: boolean;
  calculatedRuns: number;
  extraRuns: number;
  appliedBonusRatio: Record<string, Decimal>;
  onToggleStage: (uid: string, enabled: boolean) => void;
  onChangeExtraRuns: (uid: string, value: number) => void;
};

export const StageCard = memo(function StageCard({
  stage,
  isEnabled,
  calculatedRuns,
  extraRuns,
  appliedBonusRatio,
  onToggleStage,
  onChangeExtraRuns,
}: StageCardProps) {
  const { uid, entryAp, index, rewards } = stage;

  const coinRewards = rewards.filter(
    ({ item, rewardRequirement }) => item?.category === "coin" && rewardRequirement === null,
  );
  const nonCoinRewards = rewards.filter(
    ({ item, rewardRequirement }) => item?.category !== "coin" && rewardRequirement === null,
  );
  const coinRewardKeyCounts = new Map<string, number>();
  const bonusRewardKeyCounts = new Map<string, number>();
  const nonCoinRewardKeyCounts = new Map<string, number>();

  const getRewardKey = (keyCounts: Map<string, number>, itemUid: string, amount: number, suffix = "") => {
    const baseKey = `${itemUid}-${amount}${suffix}`;
    const occurrence = keyCounts.get(baseKey) ?? 0;
    keyCounts.set(baseKey, occurrence + 1);
    return `${baseKey}-${occurrence}`;
  };

  return (
    <div className="relative rounded-md bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-sm">{index}</div>
        <div className="grow">
          <div className="my-0.5 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-sm bg-green-500/10 px-1 text-xs font-medium text-green-600">
              <BoltIcon className="size-2.5" />
              <span>{entryAp}</span>
            </div>
            {calculatedRuns > 0 && (
              <span className="rounded-sm bg-blue-500 px-1.5 text-xs text-white dark:bg-blue-600">
                {calculatedRuns.toLocaleString()}회 소탕
              </span>
            )}
          </div>
        </div>
        <div className="-my-4 -mr-2">
          <Toggle initialState={isEnabled} onChange={(value) => onToggleStage(uid, value)} />
        </div>
      </div>

      {coinRewards.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-1">
            {coinRewards.map(({ amount, item }) => {
              if (!item || amount === 0) {
                return null;
              }
              return (
                <ResourceCard
                  key={getRewardKey(coinRewardKeyCounts, item.uid, amount, "-coin")}
                  itemUid={item.uid}
                  resourceType={ResourceTypeEnum.Item}
                  label={amount}
                  name={item.name}
                />
              );
            })}
            {coinRewards.map(({ amount, item }) => {
              if (!item || amount === 0 || appliedBonusRatio[item.uid]?.eq(0)) {
                return null;
              }
              const bonusRatio = appliedBonusRatio[item.uid] ?? new Decimal(0);
              const amountLabel = bonusRatio.mul(amount).ceil().toString();
              return (
                <ResourceCard
                  key={getRewardKey(bonusRewardKeyCounts, item.uid, amount, "-bonus")}
                  itemUid={item.uid}
                  resourceType={ResourceTypeEnum.Item}
                  label={amountLabel}
                  labelColor="yellow"
                  name={item.name}
                />
              );
            })}
            {nonCoinRewards.map(({ amount, item }) => {
              if (!item || amount === 0) {
                return null;
              }
              return (
                <ResourceCard
                  key={getRewardKey(nonCoinRewardKeyCounts, item.uid, amount, "-non-coin")}
                  itemUid={item.uid}
                  resourceType={ResourceTypeEnum.Item}
                  label={amount}
                  rarity={item.rarity}
                  name={item.name}
                />
              );
            })}
          </div>
        </div>
      )}

      {isEnabled && (
        <div className="mt-3 flex items-center gap-2">
          <div className="grow">
            <NumberInput label="추가 소탕" value={extraRuns} onChange={(value) => onChangeExtraRuns(uid, value)} />
          </div>
        </div>
      )}
    </div>
  );
});
