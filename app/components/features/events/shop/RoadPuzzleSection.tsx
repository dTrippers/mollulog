import { ArrowPathIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { InformationCircleIcon, MapIcon } from "@heroicons/react/24/outline";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageLink from "~/components/features/layout/PageLink";
import {
  Button,
  Callout,
  Checkbox,
  FilterButtons,
  HoverTooltip,
  NumberInput,
  ResourceCard,
  Section,
} from "~/components/primitives";
import type { MinigameConfig, RewardItem, RoadPuzzleConfig } from "~/domain/event-shop";
import {
  getRoadPuzzleRoundRows,
  getRoadPuzzleTotalCost,
  getRoadPuzzleTotalRewards,
} from "~/domain/road-puzzle/calculator";
import { roadPuzzleLocale } from "~/locales/ko";
import type { ShopActions, ShopState } from "./hooks";
import type { RoadPuzzleStatsCalculation } from "./hooks/useRoadPuzzleStats";
import { resourceCountLabel } from "./utils";

type RoadPuzzleSectionProps = {
  config: MinigameConfig;
  eventUid: string;
  state: ShopState;
  actions: ShopActions;
  calculation: RoadPuzzleStatsCalculation;
};

type ResourceColumn = {
  key: "sticker" | "wrench" | "eleph" | "pyroxene";
  name: string;
  resourceType: RewardItem["resourceType"];
  resourceUid: string;
  imageUrl?: string | null;
};

function findRewardResource(rewards: readonly RewardItem[], predicate: (name: string) => boolean): RewardItem | null {
  return rewards.find((reward) => reward.resourceName && predicate(reward.resourceName)) ?? null;
}

function getResourceColumns(config: MinigameConfig, roadPuzzle: RoadPuzzleConfig): ResourceColumn[] | null {
  const rewards = roadPuzzle.rounds.flatMap((round) => round.rewards);
  const wrench = findRewardResource(rewards, (name) => name.includes("렌치"));
  const eleph = findRewardResource(rewards, (name) => name.includes("엘레프"));
  const pyroxene = findRewardResource(rewards, (name) => name.includes("청휘석"));
  if (!config.payment.resourceName || !wrench || !eleph || !pyroxene) return null;
  return [
    {
      key: "sticker",
      name: config.payment.resourceName,
      resourceType: config.payment.resourceType,
      resourceUid: config.payment.resourceUid,
      imageUrl: config.payment.imageUrl,
    },
    {
      key: "wrench",
      name: wrench.resourceName!,
      resourceType: wrench.resourceType,
      resourceUid: wrench.resourceUid,
      imageUrl: wrench.imageUrl,
    },
    {
      key: "eleph",
      name: eleph.resourceName!,
      resourceType: eleph.resourceType,
      resourceUid: eleph.resourceUid,
      imageUrl: eleph.imageUrl,
    },
    {
      key: "pyroxene",
      name: pyroxene.resourceName!,
      resourceType: pyroxene.resourceType,
      resourceUid: pyroxene.resourceUid,
      imageUrl: pyroxene.imageUrl,
    },
  ];
}

function rewardQuantity(rewards: readonly RewardItem[], resource: ResourceColumn): number {
  return rewards
    .filter((reward) => reward.resourceType === resource.resourceType && reward.resourceUid === resource.resourceUid)
    .reduce((total, reward) => total + reward.quantity, 0);
}

function progressSpinner() {
  return (
    <ArrowPathIcon
      className="mx-auto size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
      role="img"
      aria-label="계산 중"
    />
  );
}

export function RoadPuzzleSection({ config, eventUid, state, actions, calculation }: RoadPuzzleSectionProps) {
  const [showCompletedRound, setShowCompletedRound] = useState(state.minigameStartRound > 1);
  const [expandedRounds, setExpandedRounds] = useState<ReadonlySet<number>>(() => new Set());
  const [showPendingSpinner, setShowPendingSpinner] = useState(false);
  const targetRound = state.minigamePlayCount;
  const startRound = Math.max(1, state.minigameStartRound);
  const roadPuzzle = config.roadPuzzle;

  useEffect(() => {
    if (calculation.status !== "pending") {
      setShowPendingSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowPendingSpinner(true), 300);
    return () => clearTimeout(timer);
  }, [calculation.status]);

  const resourceColumns = useMemo(
    () => (roadPuzzle ? getResourceColumns(config, roadPuzzle) : null),
    [config, roadPuzzle],
  );
  const rows = useMemo(
    () =>
      roadPuzzle
        ? getRoadPuzzleRoundRows(roadPuzzle, calculation.resultsByUid, startRound, targetRound, config.payment.quantity)
        : [],
    [calculation.resultsByUid, config.payment.quantity, roadPuzzle, startRound, targetRound],
  );
  const totalCost = useMemo(
    () =>
      roadPuzzle && targetRound >= startRound && targetRound > 0 && calculation.status === "ready"
        ? getRoadPuzzleTotalCost(
            roadPuzzle,
            calculation.resultsByUid,
            startRound,
            targetRound,
            state.minigamePaymentQuantityMode,
            config.payment.quantity,
          )
        : null,
    [
      calculation.resultsByUid,
      calculation.status,
      config.payment.quantity,
      roadPuzzle,
      startRound,
      state.minigamePaymentQuantityMode,
      targetRound,
    ],
  );
  const totalRewards = useMemo(
    () => (roadPuzzle ? getRoadPuzzleTotalRewards(roadPuzzle, startRound, targetRound) : []),
    [roadPuzzle, startRound, targetRound],
  );
  const calculationFailed =
    calculation.status === "failed" || (calculation.status === "ready" && totalCost === null && targetRound > 0);

  const handleTargetRoundChange = (round: number) => {
    actions.setMinigamePlayCount(round);
    if (round === 0 || state.minigameStartRound > round) actions.setMinigameStartRound(Math.max(1, round));
  };

  const toggleExpanded = (round: number) => {
    setExpandedRounds((current) => {
      const next = new Set(current);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  if (!roadPuzzle) {
    return (
      <Section title="미니 게임" collapsible persistenceKey="event-shop-section::mini-game" defaultExpanded>
        <Callout>{roadPuzzleLocale.noData}</Callout>
      </Section>
    );
  }

  if (!resourceColumns) {
    return (
      <Section title="미니 게임" collapsible persistenceKey="event-shop-section::mini-game" defaultExpanded>
        <Callout>{roadPuzzleLocale.rewardDataMissing}</Callout>
      </Section>
    );
  }

  return (
    <Section title="미니 게임" collapsible persistenceKey="event-shop-section::mini-game" defaultExpanded>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-foreground">{roadPuzzleLocale.targetRound}</span>
        <div className="w-32">
          <NumberInput
            aria-label={roadPuzzleLocale.targetRound}
            value={targetRound}
            minValue={0}
            onChange={handleTargetRoundChange}
          />
        </div>
        <Checkbox
          label={roadPuzzleLocale.excludeCompleted}
          checked={showCompletedRound}
          onChange={(checked) => {
            setShowCompletedRound(checked);
            if (!checked) actions.setMinigameStartRound(1);
          }}
        />
      </div>

      {showCompletedRound && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-foreground">{roadPuzzleLocale.completedRound}</span>
          <div className="w-32">
            <NumberInput
              aria-label={roadPuzzleLocale.completedRound}
              value={Math.max(0, startRound - 1)}
              minValue={0}
              maxValue={Math.max(0, targetRound - 1)}
              onChange={(round) => actions.setMinigameStartRound(round + 1)}
            />
          </div>
          <p className="text-sm text-muted-foreground">{roadPuzzleLocale.completedRoundHelp}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p id="road-puzzle-cost-mode-label" className="text-sm font-medium text-foreground">
          {roadPuzzleLocale.costMode}
        </p>
        <fieldset aria-labelledby="road-puzzle-cost-mode-label" className="m-0 min-w-0 border-0 p-0">
          <FilterButtons
            className="my-0"
            exclusive
            atLeastOne
            size="sm"
            buttonProps={[
              {
                text: roadPuzzleLocale.minimum,
                active: state.minigamePaymentQuantityMode === "min",
                onToggle: (active) => active && actions.setMinigamePaymentQuantityMode("min"),
              },
              {
                text: roadPuzzleLocale.expected,
                active: state.minigamePaymentQuantityMode === "expected",
                onToggle: (active) => active && actions.setMinigamePaymentQuantityMode("expected"),
              },
              {
                text: roadPuzzleLocale.maximum,
                active: state.minigamePaymentQuantityMode === "max",
                onToggle: (active) => active && actions.setMinigamePaymentQuantityMode("max"),
              },
            ]}
          />
        </fieldset>
        <HoverTooltip content={roadPuzzleLocale.costModeHelp} focusable>
          <InformationCircleIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </HoverTooltip>
      </div>

      {calculationFailed && (
        <div className="mt-3" role="alert">
          <Callout tone="destructive" className="flex flex-wrap items-center justify-between gap-3">
            <span>{roadPuzzleLocale.calculationFailed}</span>
            <Button text={roadPuzzleLocale.retry} size="sm" variant="secondary" onClick={calculation.retry} />
          </Callout>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {calculation.status === "pending"
          ? roadPuzzleLocale.calculatingCost
          : calculation.status === "ready"
            ? roadPuzzleLocale.calculationComplete
            : ""}
      </p>

      {targetRound > 0 && startRound <= targetRound && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md bg-card p-3">
            <p className="text-sm font-semibold text-foreground">{roadPuzzleLocale.requiredResources}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <ResourceCard
                resourceType={config.payment.resourceType}
                itemUid={config.payment.resourceUid}
                imageUrl={config.payment.imageUrl ?? undefined}
                imageAlt={config.payment.resourceName}
                name={config.payment.resourceName}
                label={
                  calculationFailed
                    ? "–"
                    : totalCost === null
                      ? showPendingSpinner
                        ? progressSpinner()
                        : "–"
                      : `${state.minigamePaymentQuantityMode === "expected" ? "≈" : ""}${resourceCountLabel(totalCost)}`
                }
              />
            </div>
          </div>
          <div className="rounded-md bg-card p-3">
            <p className="text-sm font-semibold text-foreground">{roadPuzzleLocale.totalRewards}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {totalRewards.map((reward) => (
                <ResourceCard
                  key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
                  resourceType={reward.resourceType}
                  itemUid={reward.resourceUid}
                  imageUrl={reward.imageUrl ?? undefined}
                  imageAlt={reward.resourceName}
                  name={reward.resourceName}
                  rarity={reward.rarity}
                  label={resourceCountLabel(reward.quantity)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 max-w-[40rem] rounded-md bg-card p-3">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{`${roadPuzzleLocale.round}별 필요 재화와 보상`}</caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 text-left font-medium" scope="col">
                  {roadPuzzleLocale.round}
                </th>
                {resourceColumns.map((resource) => (
                  <th className="px-1 py-2 text-right font-medium" key={resource.key} scope="col">
                    <span className="sr-only">{resource.name}</span>
                    <HoverTooltip content={resource.name} focusable>
                      <span aria-hidden="true" className="inline-flex">
                        <ResourceCard
                          resourceType={resource.resourceType}
                          itemUid={resource.resourceUid}
                          imageUrl={resource.imageUrl ?? undefined}
                          size="sm"
                        />
                      </span>
                    </HoverTooltip>
                  </th>
                ))}
                <th className="py-2" scope="col">
                  <span className="sr-only">회차 보상</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedRounds.has(row.round);
                const showApproximation = state.minigamePaymentQuantityMode === "expected" && row.round >= 3;
                const rowLabel = row.isLoop
                  ? roadPuzzleLocale.loopRoundLabel(row.loopCount)
                  : roadPuzzleLocale.roundLabel(row.round);
                return (
                  <Fragment key={row.round}>
                    <tr
                      className={`border-b border-border ${row.selected ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                    >
                      <th className="py-1.5 text-left font-medium" scope="row">
                        <span>{rowLabel}</span>
                        {row.selected && <span className="sr-only">({roadPuzzleLocale.included})</span>}
                      </th>
                      <td className="px-1 py-1.5 text-right tabular-nums">
                        {calculationFailed
                          ? "–"
                          : row.estimate
                            ? `${showApproximation ? "≈" : ""}${resourceCountLabel(
                                state.minigamePaymentQuantityMode === "min"
                                  ? row.estimate.minimum
                                  : state.minigamePaymentQuantityMode === "max"
                                    ? row.estimate.maximum
                                    : row.estimate.expected,
                              )}`
                            : showPendingSpinner
                              ? progressSpinner()
                              : "–"}
                      </td>
                      {resourceColumns.slice(1).map((resource) => (
                        <td className="px-1 py-1.5 text-right tabular-nums" key={resource.key}>
                          {rewardQuantity(row.completionRewards, resource) > 0 ? (
                            resourceCountLabel(rewardQuantity(row.completionRewards, resource))
                          ) : (
                            <>
                              <span className="sr-only">{roadPuzzleLocale.noReward}</span>
                              <span aria-hidden="true">–</span>
                            </>
                          )}
                        </td>
                      ))}
                      <td className="px-1 py-1.5 text-right">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={`road-puzzle-round-${row.round}-details`}
                          aria-label={`${rowLabel} 보상 ${isExpanded ? "접기" : "펼치기"}`}
                          className="rounded p-1 focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => toggleExpanded(row.round)}
                        >
                          <ChevronRightIcon
                            className={`size-3.5 transition-transform motion-reduce:transition-none ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr id={`road-puzzle-round-${row.round}-details`}>
                        <td className="bg-card px-3 py-3" colSpan={resourceColumns.length + 2}>
                          <p className="text-xs font-medium text-foreground">{roadPuzzleLocale.totalRewards}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.completionRewards.map((reward) => (
                              <ResourceCard
                                key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
                                resourceType={reward.resourceType}
                                itemUid={reward.resourceUid}
                                imageUrl={reward.imageUrl ?? undefined}
                                imageAlt={reward.resourceName}
                                name={reward.resourceName}
                                rarity={reward.rarity}
                                label={resourceCountLabel(reward.quantity)}
                              />
                            ))}
                          </div>
                          {!row.isLoop && (
                            <>
                              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                                <span>{roadPuzzleLocale.pathRewards}</span>
                                <HoverTooltip content={roadPuzzleLocale.pathRewardsHelp} focusable>
                                  <InformationCircleIcon className="size-3.5" aria-hidden="true" />
                                </HoverTooltip>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {row.pathRewards.map((reward) => (
                                  <ResourceCard
                                    key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
                                    resourceType={reward.resourceType}
                                    itemUid={reward.resourceUid}
                                    imageUrl={reward.imageUrl ?? undefined}
                                    imageAlt={reward.resourceName}
                                    name={reward.resourceName}
                                    rarity={reward.rarity}
                                    label={resourceCountLabel(reward.quantity)}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                          <Link
                            className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
                            to={`/events/${eventUid}/road-puzzle?round=${Math.min(7, Math.max(1, row.round))}&map=1`}
                          >
                            {roadPuzzleLocale.mapLink}
                          </Link>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <PageLink
          Icon={MapIcon}
          title={roadPuzzleLocale.viewerLinkTitle}
          description={roadPuzzleLocale.viewerLinkDescription}
          to={`/events/${eventUid}/road-puzzle?round=${Math.min(7, Math.max(1, targetRound))}&map=1`}
        />
      </div>
    </Section>
  );
}
