import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { resourceCountLabel } from "~/components/features/events/shop/utils";
import { HoverTooltip, ResourceCard } from "~/components/primitives";
import type { RewardItem, TreasureHuntRoundConfig } from "~/domain/event-shop";
import { treasureHuntLocale } from "~/locales/ko";

type TreasureHuntRoundSimulation = {
  requiredText: string;
  isCalculating: boolean;
};

type TreasureHuntRoundRowProps = {
  config: TreasureHuntRoundConfig;
  label: string;
  theoreticalMinCost: number;
  theoreticalMaxCost: number;
  simulation?: TreasureHuntRoundSimulation;
};

export function ShapeIcon({ width, height }: { width: number; height: number }) {
  const ariaLabel = `가로 ${width} 세로 ${height} 보물`;
  return (
    <HoverTooltip content={`${width}×${height} · 회전해서 놓일 수 있어요`} focusable>
      <span role="img" aria-label={ariaLabel} className="inline-flex w-7 shrink-0 items-center justify-center">
        <span
          className="grid gap-px"
          style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {Array.from({ length: width * height }, (_, index) => {
            const row = Math.floor(index / width);
            const column = index % width;
            return <span key={`${row}-${column}`} className="size-1.5 bg-foreground/60" />;
          })}
        </span>
      </span>
    </HoverTooltip>
  );
}

export function TreasureHuntResourceCards({ rewards }: { rewards: readonly RewardItem[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {rewards.map((reward) => (
        <ResourceCard
          key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
          resourceType={reward.resourceType}
          itemUid={reward.resourceUid}
          imageUrl={reward.imageUrl ?? undefined}
          rarity={reward.rarity}
          label={resourceCountLabel(reward.quantity)}
          name={reward.resourceName}
        />
      ))}
    </div>
  );
}

export function TreasureHuntRoundRow({
  config,
  label,
  theoreticalMinCost,
  theoreticalMaxCost,
  simulation,
}: TreasureHuntRoundRowProps) {
  return (
    <div className="space-y-2 rounded-md bg-muted p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="whitespace-nowrap text-sm font-semibold text-foreground">{label}</span>
        <div className="ml-auto flex flex-col items-end gap-0.5 text-right">
          {simulation ? (
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground">{treasureHuntLocale.requiredResources}</span>
              <span className="flex items-center gap-1 text-sm font-medium tabular-nums text-foreground">
                {simulation.requiredText}
                {simulation.isCalculating && <RoundProgressSpinner />}
              </span>
            </div>
          ) : null}
          <span className="text-xs tabular-nums text-muted-foreground">
            이론상 {theoreticalMinCost.toLocaleString()}~{theoreticalMaxCost.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="space-y-3 sm:space-y-2">
        {config.treasures.map((treasure) => (
          <div
            key={treasure.uid}
            className="grid grid-cols-1 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start sm:gap-x-2"
          >
            <TreasureRowLabel treasure={treasure} className="sm:h-10" />
            <TreasureHuntResourceCards
              rewards={treasure.rewards.map((reward) => ({ ...reward, quantity: reward.quantity * treasure.count }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TreasureRowLabel({
  treasure,
  className,
}: {
  treasure: TreasureHuntRoundConfig["treasures"][number];
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className ?? ""}`}>
      <ShapeIcon width={treasure.width} height={treasure.height} />
      <span className="min-w-0 whitespace-nowrap text-xs text-muted-foreground">
        {treasure.width}×{treasure.height} · {treasure.count.toLocaleString()}개
      </span>
    </div>
  );
}

function RoundProgressSpinner() {
  return (
    <ArrowPathIcon
      className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
      role="img"
      aria-label="계산 중"
    />
  );
}
