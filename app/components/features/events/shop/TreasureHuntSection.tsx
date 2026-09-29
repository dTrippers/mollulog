import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { useId, useState } from "react";
import { useParams } from "react-router";
import {
  TreasureHuntResourceCards,
  TreasureHuntRoundRow as TreasureHuntRoundDetailRow,
} from "~/components/features/events/treasure-hunt/TreasureHuntRoundRow";
import PageLink from "~/components/features/layout/PageLink";
import { Button, Callout, Checkbox, FilterButtons, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { TreasureHuntConfig } from "~/domain/event-shop";
import { treasureHuntLocale } from "~/locales/ko";
import type { ShopActions, ShopState } from "./hooks";
import {
  calculateTreasureHuntRoundEstimates,
  getTreasureHuntTreasureRewards,
  TREASURE_HUNT_MAX_TARGET_ROUND,
  type TreasureHuntCalculationStatus,
  type TreasureHuntEstimate,
  type TreasureHuntHistogramState,
  type TreasureHuntRoundRow,
} from "./treasure-hunt";
import { resourceCountLabel } from "./utils";

export type TreasureHuntSectionStatus = TreasureHuntCalculationStatus;

export type TreasureHuntSectionState = {
  status: TreasureHuntSectionStatus;
  progress: number | null;
  rows: TreasureHuntRoundRow[];
  statsBySignature: Readonly<Record<string, TreasureHuntHistogramState>>;
  estimate: TreasureHuntEstimate | null;
  retry: () => void;
};

type TreasureHuntSectionProps = {
  treasureHunt: TreasureHuntConfig | null;
  state: ShopState;
  actions: ShopActions;
  calculation: TreasureHuntSectionState;
};

function ProgressSpinner({
  label,
  labelled = false,
  size = "md",
}: {
  label?: string;
  labelled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <ArrowPathIcon
      className={`${size === "sm" ? "size-3.5" : "size-4"} shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none`}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
    />
  );
}

function RoundRangeText({
  rows,
  targetRound,
  startRound,
}: {
  rows: readonly TreasureHuntRoundRow[];
  targetRound: number;
  startRound: number;
}) {
  if (rows.length === 0) return <span className="text-xs font-normal text-muted-foreground">선택한 회차 없음</span>;
  return (
    <span className="truncate text-xs font-normal text-muted-foreground">
      {startRound === targetRound ? `${startRound}회차` : `${startRound}~${targetRound}회차`}
    </span>
  );
}

export function TreasureHuntSection({ treasureHunt, state, actions, calculation }: TreasureHuntSectionProps) {
  const { uid } = useParams();
  const [showCompletedRound, setShowCompletedRound] = useState(state.minigameStartRound > 1);
  const [showRoundDetails, setShowRoundDetails] = useState(false);
  const costGroupId = useId();
  const roundDetailsId = useId();
  const { status, rows, estimate, statsBySignature, progress, retry } = calculation;
  const targetRound = state.minigamePlayCount;
  const startRound = Math.max(1, state.minigameStartRound);
  const firstSelected = rows[0];
  const summaryRound = firstSelected?.config ?? treasureHunt?.rounds[0];
  const treasureRewards = rows.length > 0 ? (estimate?.treasureRewards ?? getTreasureHuntTreasureRewards(rows)) : [];
  const openCellRewards = estimate?.openCellRewards ?? [];
  const roundEstimates =
    rows.length > 0
      ? (estimate?.rounds ??
        calculateTreasureHuntRoundEstimates(
          rows,
          status === "pending" ? {} : statsBySignature,
          state.minigamePaymentQuantityMode,
        ))
      : [];
  const isWorking = status === "pending" || status === "provisional";
  const isPending = status === "pending";
  const isFailed = status === "failed";
  const isReady = status === "ready";
  const liveMessage = isWorking
    ? treasureHuntLocale.calculating
    : isReady
      ? treasureHuntLocale.calculationComplete
      : "";

  const handleTargetRoundChange = (round: number) => {
    actions.setMinigamePlayCount(round);
    if (round === 0 || state.minigameStartRound > round) {
      actions.setMinigameStartRound(Math.max(1, round));
    }
  };

  const handleCompletedRoundToggle = (checked: boolean) => {
    setShowCompletedRound(checked);
    if (!checked) actions.setMinigameStartRound(1);
  };

  if (status === "no-data") {
    return (
      <Section
        title={treasureHuntLocale.title}
        collapsible
        persistenceKey="event-shop-section::mini-game"
        defaultExpanded
      >
        <Callout>{treasureHuntLocale.noData}</Callout>
      </Section>
    );
  }

  if (status === "incompatible") {
    return (
      <Section
        title={treasureHuntLocale.title}
        collapsible
        persistenceKey="event-shop-section::mini-game"
        defaultExpanded
      >
        <Callout>{treasureHuntLocale.incompatible}</Callout>
        {treasureHunt && uid && <TreasureHuntSimulatorLink eventUid={uid} />}
      </Section>
    );
  }

  return (
    <Section
      title={treasureHuntLocale.title}
      collapsible
      persistenceKey="event-shop-section::mini-game"
      defaultExpanded
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-foreground">{treasureHuntLocale.targetRound}</span>
        <div className="w-32">
          <NumberInput
            value={targetRound}
            minValue={0}
            maxValue={TREASURE_HUNT_MAX_TARGET_ROUND}
            aria-invalid={status === "round-limit"}
            aria-describedby={status === "round-limit" ? "treasure-hunt-target-round-error" : undefined}
            onChange={handleTargetRoundChange}
          />
        </div>
        <Checkbox
          label={treasureHuntLocale.excludeCompleted}
          checked={showCompletedRound}
          onChange={handleCompletedRoundToggle}
        />
      </div>

      {status === "round-limit" && (
        <div id="treasure-hunt-target-round-error" role="alert" className="mt-2">
          <Callout tone="destructive">{treasureHuntLocale.targetRoundLimit}</Callout>
        </div>
      )}

      {showCompletedRound && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-foreground">{treasureHuntLocale.completedRound}</span>
          <div className="w-32">
            <NumberInput
              value={Math.max(0, startRound - 1)}
              minValue={0}
              maxValue={Math.max(0, targetRound - 1)}
              onChange={(round) => actions.setMinigameStartRound(round + 1)}
            />
          </div>
          <p className="text-sm text-muted-foreground">{treasureHuntLocale.completedRoundHelp}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-medium text-foreground">{treasureHuntLocale.costMode}</p>
          {/* biome-ignore lint/a11y/useSemanticElements: The approved accessible control group uses role=group and aria-labelledby. */}
          <div id={costGroupId} role="group" aria-labelledby={`${costGroupId}-label`}>
            <span id={`${costGroupId}-label`} className="sr-only">
              {treasureHuntLocale.costMode}
            </span>
            <FilterButtons
              className="my-0"
              exclusive
              atLeastOne
              size="sm"
              buttonProps={[
                {
                  text: treasureHuntLocale.top10,
                  active: state.minigamePaymentQuantityMode === "min",
                  onToggle: (active) => active && actions.setMinigamePaymentQuantityMode("min"),
                },
                {
                  text: treasureHuntLocale.typical,
                  active: state.minigamePaymentQuantityMode === "expected",
                  onToggle: (active) => active && actions.setMinigamePaymentQuantityMode("expected"),
                },
                {
                  text: treasureHuntLocale.bottom10,
                  active: state.minigamePaymentQuantityMode === "max",
                  onToggle: (active) => active && actions.setMinigamePaymentQuantityMode("max"),
                },
              ]}
            />
          </div>
        </div>
        {isWorking && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ProgressSpinner />
            <span>{treasureHuntLocale.progress(progress ?? 0)}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{treasureHuntLocale.simulationAssumption}</p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>

      {isFailed && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3">
          <Callout tone="destructive" className="min-w-0 flex-1">
            {treasureHuntLocale.failed}
          </Callout>
          <Button text={treasureHuntLocale.retry} size="sm" variant="secondary" onClick={retry} />
        </div>
      )}

      <div className="mt-4 rounded-md bg-card p-3">
        <p className="text-sm font-semibold text-foreground">{treasureHuntLocale.requiredResources}</p>
        {rows.length === 0 ? (
          status === "round-limit" ? null : (
            <p className="mt-2 text-sm text-muted-foreground">{treasureHuntLocale.selectTarget}</p>
          )
        ) : (
          <>
            {(isPending || isFailed) && (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                {isFailed ? treasureHuntLocale.calculationFailed : treasureHuntLocale.calculatingShort}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {isPending || isFailed ? (
                summaryRound && (
                  <ResourceCard
                    itemUid={summaryRound.cellCost.resourceUid}
                    resourceType={summaryRound.cellCost.resourceType}
                    imageUrl={summaryRound.cellCost.imageUrl ?? undefined}
                    name={summaryRound.cellCost.resourceName}
                  />
                )
              ) : estimate ? (
                <ResourceCard
                  itemUid={estimate.payment.resourceUid}
                  resourceType={estimate.payment.resourceType}
                  imageUrl={estimate.payment.imageUrl ?? undefined}
                  label={resourceCountLabel(estimate.payment.quantity)}
                  name={estimate.payment.resourceName}
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 rounded-md bg-card p-3">
          <p className="text-sm font-semibold text-foreground">{treasureHuntLocale.totalRewards}</p>
          <div className="mt-2 space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.treasureRewards}</p>
              <TreasureHuntResourceCards rewards={treasureRewards} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium tabular-nums text-muted-foreground">
                {isPending
                  ? `${treasureHuntLocale.openRewards} · ${treasureHuntLocale.calculatingShort}`
                  : isFailed
                    ? `${treasureHuntLocale.openRewards} · ${treasureHuntLocale.calculationFailed}`
                    : treasureHuntLocale.openRewards}
              </p>
              {isPending || isFailed ? (
                <div className="flex flex-wrap gap-1">
                  {summaryRound?.openCellRewards.map((reward) => (
                    <ResourceCard
                      key={`${reward.resourceType}:${reward.resourceUid}`}
                      itemUid={reward.resourceUid}
                      resourceType={reward.resourceType}
                      imageUrl={reward.imageUrl ?? undefined}
                      name={reward.resourceName}
                    />
                  ))}
                </div>
              ) : (
                <TreasureHuntResourceCards rewards={openCellRewards} />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-md bg-card p-3">
        <button
          type="button"
          className="-m-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-expanded={showRoundDetails}
          aria-controls={roundDetailsId}
          onClick={() => setShowRoundDetails((current) => !current)}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">{treasureHuntLocale.roundDetails}</span>
            <RoundRangeText rows={rows} targetRound={targetRound} startRound={startRound} />
          </span>
          <ChevronDownIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${showRoundDetails ? "rotate-180" : ""}`}
          />
        </button>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.boardSize}</p>
            <div className="flex h-10 items-center text-sm font-medium tabular-nums text-foreground">
              {summaryRound ? `${summaryRound.boardWidth}×${summaryRound.boardHeight}` : ""}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.cellCost}</p>
            <div className="flex h-10 items-center">
              {summaryRound && (
                <ResourceCard
                  itemUid={summaryRound.cellCost.resourceUid}
                  resourceType={summaryRound.cellCost.resourceType}
                  imageUrl={summaryRound.cellCost.imageUrl ?? undefined}
                  label={resourceCountLabel(summaryRound.cellCost.quantity)}
                  name={summaryRound.cellCost.resourceName}
                />
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{treasureHuntLocale.openCellReward}</p>
            <div className="flex h-10 items-center">
              {summaryRound?.openCellRewards.map((reward) => (
                <ResourceCard
                  key={`${reward.resourceType}:${reward.resourceUid}`}
                  itemUid={reward.resourceUid}
                  resourceType={reward.resourceType}
                  imageUrl={reward.imageUrl ?? undefined}
                  label={resourceCountLabel(reward.quantity)}
                  name={reward.resourceName}
                />
              ))}
            </div>
          </div>
        </div>

        {showRoundDetails && (
          <div id={roundDetailsId} className="mt-2 space-y-1.5">
            {roundEstimates.map((round) => {
              const requiredText = round.failed
                ? treasureHuntLocale.calculationFailed
                : round.payment
                  ? `${round.payment.quantity.toLocaleString()}개`
                  : treasureHuntLocale.calculatingShort;
              const loopLabel = round.isLoop
                ? `${round.round}회차 이후 ×${round.multiplicity.toLocaleString()}`
                : `${round.round}회차`;
              return (
                <TreasureHuntRoundDetailRow
                  key={`${round.round}:${round.isLoop ? "loop" : "round"}`}
                  config={round.config}
                  label={loopLabel}
                  theoreticalMinCost={round.theoreticalMin * round.config.cellCost.quantity}
                  theoreticalMaxCost={round.theoreticalMax * round.config.cellCost.quantity}
                  presentation="shop"
                  simulation={{ requiredText, isCalculating: round.isCalculating }}
                />
              );
            })}
          </div>
        )}
      </div>
      {treasureHunt && uid && <TreasureHuntSimulatorLink eventUid={uid} />}
    </Section>
  );
}

function TreasureHuntSimulatorLink({ eventUid }: { eventUid: string }) {
  return (
    <div className="mt-4">
      <PageLink
        Icon={Squares2X2Icon}
        title={treasureHuntLocale.simulatorTitle}
        description={treasureHuntLocale.simulatorDescription}
        to={`/events/${eventUid}/treasure-hunt`}
      />
    </div>
  );
}
