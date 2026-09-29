import { resourceCountLabel } from "~/components/features/events/shop/utils";
import { ResourceCard, Section } from "~/components/primitives";
import type { TreasureHuntConfig, TreasureHuntRoundConfig } from "~/domain/event-shop";
import { treasureHuntLocale } from "~/locales/ko";
import { TreasureHuntResourceCards, TreasureHuntRoundRow } from "./TreasureHuntRoundRow";

export function TreasureHuntRoundDetails({ config }: { config: TreasureHuntConfig }) {
  const summaryRound = getRoundConfig(config, 1);
  const rounds = Array.from({ length: config.loopRound }, (_, index) => getRoundConfig(config, index + 1));

  return (
    <Section
      title={treasureHuntLocale.roundDetails}
      collapsible
      persistenceKey="event-treasure-hunt-section::round-details"
      defaultExpanded
    >
      <div className="rounded-md bg-card p-3">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.boardSize}</p>
            <div className="flex h-10 items-center text-sm font-medium tabular-nums text-foreground">
              {summaryRound.boardWidth}×{summaryRound.boardHeight}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.cellCost}</p>
            <div className="flex h-10 items-center">
              <ResourceCard
                itemUid={summaryRound.cellCost.resourceUid}
                resourceType={summaryRound.cellCost.resourceType}
                imageUrl={summaryRound.cellCost.imageUrl ?? undefined}
                label={resourceCountLabel(summaryRound.cellCost.quantity)}
                name={summaryRound.cellCost.resourceName}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.openCellReward}</p>
            <div className="flex h-10 items-center">
              <TreasureHuntResourceCards rewards={summaryRound.openCellRewards} />
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {rounds.map((round) => {
            const occupiedCells = round.treasures.reduce(
              (total, treasure) => total + treasure.width * treasure.height * treasure.count,
              0,
            );
            const totalCells = round.boardWidth * round.boardHeight;
            const isLoop = round.round === config.loopRound;

            return (
              <TreasureHuntRoundRow
                key={round.round}
                config={round}
                label={isLoop ? treasureHuntLocale.roundAfter(config.loopRound) : `${round.round}회차`}
                theoreticalMinCost={occupiedCells * round.cellCost.quantity}
                theoreticalMaxCost={totalCells * round.cellCost.quantity}
                presentation="details"
              />
            );
          })}
        </div>
      </div>
    </Section>
  );
}

export function getRoundConfig(config: TreasureHuntConfig, round: number): TreasureHuntRoundConfig {
  const targetRound = round >= config.loopRound ? config.loopRound : round;
  const roundConfig = config.rounds.find((candidate) => candidate.round === targetRound);
  if (!roundConfig) {
    throw new Error(`Treasure hunt round ${targetRound} is missing its configuration.`);
  }
  return roundConfig;
}
