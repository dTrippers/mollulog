import { useState, useMemo } from "react";
import { SubTitle } from "~/components/atoms/typography";
import ResourceCard from "~/components/atoms/item/ResourceCard";
import { Section } from "~/components/ui";
import type { ResourceTypeEnum } from "~/graphql/graphql";

type RewardType = "normal" | "growth" | "growth_plus";

type RewardOption = {
  type: RewardType;
  title: string;
  description: string;
  price: number;
};

type Reward = {
  resourceType: string;
  resourceUid: string;
  quantity: number;
};

type BattlePassInfoProps = {
  rewards: {
    normal: Reward;
    growth: Reward;
  }[];
};

type SummaryReward = {
  resourceType: string;
  resourceUid: string;
  normalQuantity: number;
  growthQuantity: number;
};

const REWARD_OPTIONS: RewardOption[] = [
  { type: "normal", title: "일반 CH", description: "기본 보상 획득 가능", price: 0 },
  { type: "growth", title: "성장 CH", description: "추가 보상 획득 가능", price: 29000 },
  { type: "growth_plus", title: "성장 CH+", description: "추가 보상 및 청휘석, 칭호 획득\n패스 레벨 10 즉시 상승", price: 34000 },
];

const TABLE_HEADERS = ["레벨", "일반 CH", "성장 CH"] as const;

export default function BattlePassInfo({ rewards }: BattlePassInfoProps) {
  const [selectedReward, setSelectedReward] = useState<RewardType>("normal");

  return (
    <>
      <SubTitle text="획득 가능 보상" />
      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-2">
        {REWARD_OPTIONS.map((option) => (
          <RewardOptionCard
            key={option.type}
            option={option}
            isSelected={selectedReward === option.type}
            onSelect={() => setSelectedReward(option.type)}
          />
        ))}
      </div>
      <RewardSummary rewards={rewards} selectedReward={selectedReward} />
      <RewardTable rewards={rewards} selectedReward={selectedReward} />
    </>
  );
}

function RewardOptionCard({ option, isSelected, onSelect }: { option: RewardOption; isSelected: boolean; onSelect: () => void }) {
  const cardClass = isSelected
    ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
    : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600";

  const radioClass = isSelected
    ? "border-blue-500 dark:border-blue-400 bg-blue-500 dark:bg-blue-400"
    : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800";

  return (
    <div className={`relative p-3 pr-12 border rounded-lg cursor-pointer transition-all duration-200 ${cardClass}`} onClick={onSelect}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{option.title}</p>
          {option.price > 0 && (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              ₩ {option.price.toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 whitespace-pre-line">
          {option.description}
        </p>
      </div>
      <div className="absolute top-1/2 right-3 -translate-y-1/2">
        <div className={`size-5 relative flex items-center justify-center rounded-full border-2 transition-all ${radioClass}`}>
          {isSelected && <div className="absolute size-2.5 rounded-full bg-white dark:bg-white" />}
        </div>
      </div>
    </div>
  );
}

function formatQuantity(quantity: number): string | number {
  return quantity > 1000 ? `${(quantity / 1000).toLocaleString()}k` : quantity;
}

function RewardSummary({ rewards, selectedReward }: { rewards: BattlePassInfoProps["rewards"]; selectedReward: RewardType }) {
  const { normalRewards, growthRewards } = useMemo(() => {
    const normalMap = new Map<string, { resourceType: string; resourceUid: string; quantity: number }>();
    const growthMap = new Map<string, { resourceType: string; resourceUid: string; quantity: number }>();

    rewards.forEach((reward) => {
      // Process normal rewards
      const normalKey = `${reward.normal.resourceType}:${reward.normal.resourceUid}`;
      const normalExisting = normalMap.get(normalKey);
      if (normalExisting) {
        normalExisting.quantity += reward.normal.quantity;
      } else {
        normalMap.set(normalKey, {
          resourceType: reward.normal.resourceType,
          resourceUid: reward.normal.resourceUid,
          quantity: reward.normal.quantity,
        });
      }

      // Process growth rewards
      const growthKey = `${reward.growth.resourceType}:${reward.growth.resourceUid}`;
      const growthExisting = growthMap.get(growthKey);
      if (growthExisting) {
        growthExisting.quantity += reward.growth.quantity;
      } else {
        growthMap.set(growthKey, {
          resourceType: reward.growth.resourceType,
          resourceUid: reward.growth.resourceUid,
          quantity: reward.growth.quantity,
        });
      }
    });

    const normalRewards = Array.from(normalMap.values()).sort((a, b) => {
      if (a.resourceType !== b.resourceType) {
        return a.resourceType.localeCompare(b.resourceType);
      }
      return a.resourceUid.localeCompare(b.resourceUid);
    });

    const growthRewards = Array.from(growthMap.values()).sort((a, b) => {
      if (a.resourceType !== b.resourceType) {
        return a.resourceType.localeCompare(b.resourceType);
      }
      return a.resourceUid.localeCompare(b.resourceUid);
    });

    return { normalRewards, growthRewards };
  }, [rewards]);

  const isGrowthDimmed = selectedReward === "normal";
  return (
    <Section title="보상 합계" description="최대 레벨을 달성하면 얻을 수 있는 보상">
      <div className="mb-4 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <div className="bg-neutral-100 dark:bg-neutral-900">
          <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">일반 CH</p>
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-800">
          <div className="px-3 py-3 flex flex-wrap gap-2">
            {normalRewards.length > 0 ? (
              normalRewards.map((reward, index) => (
                <ResourceCard
                  key={`normal-${reward.resourceType}-${reward.resourceUid}-${index}`}
                  resourceType={reward.resourceType as ResourceTypeEnum}
                  itemUid={reward.resourceUid}
                  label={formatQuantity(reward.quantity)}
                />
              ))
            ) : (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
            )}
          </div>
        </div>
      </div>
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <div className={`bg-neutral-100 dark:bg-neutral-900 ${isGrowthDimmed ? "opacity-40" : ""} transition-opacity`}>
          <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">성장 CH</p>
          </div>
        </div>
        <div className={`bg-white dark:bg-neutral-800 ${isGrowthDimmed ? "opacity-40" : ""} transition-opacity`}>
          <div className="px-3 py-3 flex flex-wrap gap-2">
            {growthRewards.length > 0 ? (
              growthRewards.map((reward, index) => (
                <ResourceCard
                  key={`growth-${reward.resourceType}-${reward.resourceUid}-${index}`}
                  resourceType={reward.resourceType as ResourceTypeEnum}
                  itemUid={reward.resourceUid}
                  label={formatQuantity(reward.quantity)}
                />
              ))
            ) : (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}


function RewardTable({ rewards, selectedReward }: { rewards: BattlePassInfoProps["rewards"]; selectedReward: RewardType }) {
  const isGrowthDimmed = selectedReward === "normal";
  return (
    <Section
      title="레벨 별 보상"
      description="각 레벨마다 획득하는 보상 목록"
      foldable defaultExpanded={false}
    >
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[60px_1fr_1fr] bg-neutral-100 dark:bg-neutral-900">
          {TABLE_HEADERS.map((header, index) => (
            <div
              key={header}
              className={`px-3 py-2 flex items-center justify-center ${index < TABLE_HEADERS.length - 1 ? "border-r border-neutral-200 dark:border-neutral-700" : ""}`}
            >
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 text-center">{header}</p>
            </div>
          ))}
        </div>
        <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {rewards.map((reward, index) => {
            const level = index + 1;
            return (
              <div key={index} className="grid grid-cols-[60px_1fr_1fr] bg-white dark:bg-neutral-800">
                <div className="px-3 py-2 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-700">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{level}</p>
                </div>
                <div className="px-3 py-2 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-700">
                  <ResourceCard
                    resourceType={reward.normal.resourceType as ResourceTypeEnum}
                    itemUid={reward.normal.resourceUid}
                    label={formatQuantity(reward.normal.quantity)}
                  />
                </div>
                <div className={`px-3 py-2 flex items-center justify-center transition-opacity ${isGrowthDimmed ? "opacity-40" : ""}`}>
                  <ResourceCard
                    resourceType={reward.growth.resourceType as ResourceTypeEnum}
                    itemUid={reward.growth.resourceUid}
                    label={formatQuantity(reward.growth.quantity)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
