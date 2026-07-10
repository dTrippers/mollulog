import { useState, useMemo } from "react";
import { ResourceCard, Section, SubTitle } from "~/components/primitives";
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

const REWARD_OPTIONS: RewardOption[] = [
  { type: "normal", title: "일반 CH", description: "기본 보상 획득 가능", price: 0 },
  { type: "growth", title: "성장 CH", description: "추가 보상 획득 가능", price: 29000 },
  {
    type: "growth_plus",
    title: "성장 CH+",
    description: "추가 보상 및 청휘석, 칭호 획득\n패스 레벨 10 즉시 상승",
    price: 34000,
  },
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
      <div className="space-y-8">
        <RewardSummary rewards={rewards} selectedReward={selectedReward} />
        <RewardTable rewards={rewards} selectedReward={selectedReward} />
      </div>
    </>
  );
}

function RewardOptionCard({
  option,
  isSelected,
  onSelect,
}: {
  option: RewardOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const cardClass = isSelected ? "bg-primary/10" : "bg-card hover:bg-muted";

  const radioClass = isSelected ? "bg-primary" : "bg-muted";

  return (
    <button
      type="button"
      className={`relative w-full cursor-pointer rounded-lg p-3 pr-12 text-left transition-colors duration-200 ${cardClass}`}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{option.title}</p>
          {option.price > 0 && (
            <span className="text-xs font-medium text-primary">₩ {option.price.toLocaleString()}</span>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{option.description}</p>
      </div>
      <div className="absolute top-1/2 right-3 -translate-y-1/2">
        <div
          className={`relative flex size-5 items-center justify-center rounded-full transition-colors ${radioClass}`}
        >
          {isSelected && <div className="absolute size-2.5 rounded-full bg-white dark:bg-white" />}
        </div>
      </div>
    </button>
  );
}

function formatQuantity(quantity: number): string | number {
  return quantity > 1000 ? `${(quantity / 1000).toLocaleString()}k` : quantity;
}

function RewardSummary({
  rewards,
  selectedReward,
}: {
  rewards: BattlePassInfoProps["rewards"];
  selectedReward: RewardType;
}) {
  const { normalRewards, growthRewards } = useMemo(() => {
    const normalMap = new Map<string, { resourceType: string; resourceUid: string; quantity: number }>();
    const growthMap = new Map<string, { resourceType: string; resourceUid: string; quantity: number }>();

    for (const reward of rewards) {
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
    }

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
      <div className="mb-4 overflow-hidden rounded-lg border border-border">
        <div className="bg-muted">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-foreground">일반 CH</p>
          </div>
        </div>
        <div className="bg-card">
          <div className="px-3 py-3 flex flex-wrap gap-2">
            {normalRewards.length > 0 ? (
              normalRewards.map((reward) => (
                <ResourceCard
                  key={`normal-${reward.resourceType}-${reward.resourceUid}`}
                  resourceType={reward.resourceType as ResourceTypeEnum}
                  itemUid={reward.resourceUid}
                  label={formatQuantity(reward.quantity)}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className={`bg-muted ${isGrowthDimmed ? "opacity-40" : ""} transition-opacity`}>
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-foreground">성장 CH</p>
          </div>
        </div>
        <div className={`bg-card ${isGrowthDimmed ? "opacity-40" : ""} transition-opacity`}>
          <div className="px-3 py-3 flex flex-wrap gap-2">
            {growthRewards.length > 0 ? (
              growthRewards.map((reward) => (
                <ResourceCard
                  key={`growth-${reward.resourceType}-${reward.resourceUid}`}
                  resourceType={reward.resourceType as ResourceTypeEnum}
                  itemUid={reward.resourceUid}
                  label={formatQuantity(reward.quantity)}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function RewardTable({
  rewards,
  selectedReward,
}: {
  rewards: BattlePassInfoProps["rewards"];
  selectedReward: RewardType;
}) {
  const isGrowthDimmed = selectedReward === "normal";
  return (
    <Section title="레벨 별 보상" description="각 레벨마다 획득하는 보상 목록" collapsible defaultExpanded={false}>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[60px_1fr_1fr] bg-muted">
          {TABLE_HEADERS.map((header, index) => (
            <div
              key={header}
              className={`flex items-center justify-center px-3 py-2 ${index < TABLE_HEADERS.length - 1 ? "border-r border-border" : ""}`}
            >
              <p className="text-center text-sm font-semibold text-foreground">{header}</p>
            </div>
          ))}
        </div>
        <div className="divide-y divide-border">
          {rewards.map((reward, index) => {
            const level = index + 1;
            return (
              <div key={`battle-pass-level-${level}`} className="grid grid-cols-[60px_1fr_1fr] bg-card">
                <div className="flex items-center justify-center border-r border-border px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{level}</p>
                </div>
                <div className="flex items-center justify-center border-r border-border px-3 py-2">
                  <ResourceCard
                    resourceType={reward.normal.resourceType as ResourceTypeEnum}
                    itemUid={reward.normal.resourceUid}
                    label={formatQuantity(reward.normal.quantity)}
                  />
                </div>
                <div
                  className={`px-3 py-2 flex items-center justify-center transition-opacity ${isGrowthDimmed ? "opacity-40" : ""}`}
                >
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
