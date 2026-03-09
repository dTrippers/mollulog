import { memo } from "react";
import Decimal from "decimal.js";
import { BoltIcon } from "@heroicons/react/16/solid";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ResourceCard } from "~/components/atoms/item";
import { NumberInput, Toggle } from "~/components/atoms/form";
import type { Stage } from "./types";

type StageCardProps = {
  stage: Stage;
  isEnabled: boolean;
  calculatedRuns: number;
  extraRuns: number;
  appliedBonusRatio: Record<string, Decimal>;
  onToggleStage: (uid: string, enabled: boolean) => void;
  onChangeExtraRuns: (uid: string, value: number) => void;
};

export const StageCard = memo(function StageCard({ stage, isEnabled, calculatedRuns, extraRuns, appliedBonusRatio, onToggleStage, onChangeExtraRuns }: StageCardProps) {
  const { uid, entryAp, index, rewards } = stage;

  const coinRewards = rewards.filter(({ item, rewardRequirement }) => item?.category === "coin" && rewardRequirement === null);
  const nonCoinRewards = rewards.filter(({ item, rewardRequirement }) => item?.category !== "coin" && rewardRequirement === null);

  return (
    <div className="relative px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2">
        <div className="shrink-0 size-6 border border-neutral-200 dark:border-neutral-700 rounded flex items-center justify-center text-sm">
          {index}
        </div>
        <div className="grow">
          <div className="my-0.5 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 border border-green-600 text-green-600 text-xs font-medium px-1 rounded">
              <BoltIcon className="size-2.5" />
              <span>{entryAp}</span>
            </div>
            {calculatedRuns > 0 && (
              <span className="border border-blue-500 dark:border-blue-600 bg-blue-500 dark:bg-blue-600 text-white text-xs px-1.5 rounded">
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
            {coinRewards.map(({ amount, item }, idx) => {
              if (!item || amount === 0) {
                return null;
              }
              return (
                <ResourceCard key={`${item.uid}-${idx}`} itemUid={item.uid} resourceType={ResourceTypeEnum.Item} label={amount} name={item.name} />
              );
            })}
            {coinRewards.map(({ amount, item }, idx) => {
              if (!item || amount === 0 || appliedBonusRatio[item.uid]?.eq(0)) {
                return null;
              }
              const bonusRatio = appliedBonusRatio[item.uid] ?? new Decimal(0);
              const amountLabel = bonusRatio.mul(amount).ceil().toString();
              return (
                <ResourceCard key={`${item.uid}-${idx}-bonus`} itemUid={item.uid} resourceType={ResourceTypeEnum.Item} label={amountLabel} labelColor="yellow" name={item.name} />
              );
            })}
            {nonCoinRewards.map(({ amount, item }, idx) => {
              if (!item || amount === 0) {
                return null;
              }
              return (
                <ResourceCard key={`${item.uid}-${idx}`} itemUid={item.uid} resourceType={ResourceTypeEnum.Item} label={amount} rarity={item.rarity} name={item.name} />
              );
            })}
          </div>
        </div>
      )}

      {isEnabled && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">추가 소탕</label>
          <div className="grow">
            <NumberInput value={extraRuns} onChange={(value) => onChangeExtraRuns(uid, value)} />
          </div>
        </div>
      )}
    </div>
  );
});

