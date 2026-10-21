import { ChevronRightIcon, MapIcon } from "@heroicons/react/16/solid";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { AsideLinks } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import type { MinigameConfig, RewardItem, RoadPuzzleConfig } from "~/domain/event-shop";
import { resourceCountLabel } from "~/domain/event-shop/utils";
import { getRoadPuzzleRoundRows, getRoadPuzzleTotalCost } from "~/domain/road-puzzle/calculator";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { roadPuzzleLocale } from "~/locales/ko";

type ResourceColumn = {
  key: "sticker" | "wrench" | "eleph" | "pyroxene";
  name: string;
  resourceType: RewardItem["resourceType"];
  resourceUid: string;
  imageUrl?: string | null;
};

const COST_MODES = [
  { mode: "min", label: roadPuzzleLocale.minimum },
  { mode: "expected", label: roadPuzzleLocale.expected },
  { mode: "max", label: roadPuzzleLocale.maximum },
] as const;

function findRewardResource(rewards: readonly RewardItem[], keyword: string): RewardItem | null {
  return rewards.find((reward) => reward.resourceName?.includes(keyword)) ?? null;
}

function getResourceColumns(config: MinigameConfig, roadPuzzle: RoadPuzzleConfig): ResourceColumn[] | null {
  const rewards = roadPuzzle.rounds.flatMap((round) => round.rewards);
  const rewardColumns = (
    [
      ["wrench", findRewardResource(rewards, "렌치")],
      ["eleph", findRewardResource(rewards, "엘레프")],
      ["pyroxene", findRewardResource(rewards, "청휘석")],
    ] as const
  ).map(([key, reward]) =>
    reward?.resourceName
      ? {
          key,
          name: reward.resourceName,
          resourceType: reward.resourceType,
          resourceUid: reward.resourceUid,
          imageUrl: reward.imageUrl,
        }
      : null,
  );
  if (!config.payment.resourceName || rewardColumns.some((column) => column === null)) return null;
  return [
    {
      key: "sticker",
      name: config.payment.resourceName,
      resourceType: config.payment.resourceType,
      resourceUid: config.payment.resourceUid,
      imageUrl: config.payment.imageUrl,
    },
    ...(rewardColumns as ResourceColumn[]),
  ];
}

function rewardQuantity(rewards: readonly RewardItem[], resource: ResourceColumn): number {
  return rewards
    .filter((reward) => reward.resourceType === resource.resourceType && reward.resourceUid === resource.resourceUid)
    .reduce((total, reward) => total + reward.quantity, 0);
}

function viewerRound(round: number) {
  return Math.min(7, Math.max(1, round));
}

export function RoadPuzzleShopSection({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const { state, actions, roadPuzzleCalculation: calculation } = plan;
  const [showCompletedRound, setShowCompletedRound] = useState(state.minigameStartRound > 1);
  const [expandedRounds, setExpandedRounds] = useState<ReadonlySet<number>>(() => new Set());
  const targetRound = state.minigamePlayCount;
  const startRound = Math.max(1, state.minigameStartRound);
  const roadPuzzle = config.roadPuzzle;
  const mode = state.minigamePaymentQuantityMode;

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
            mode,
            config.payment.quantity,
          )
        : null,
    [calculation.resultsByUid, calculation.status, config.payment.quantity, mode, roadPuzzle, startRound, targetRound],
  );
  const calculationFailed =
    calculation.status === "failed" || (calculation.status === "ready" && totalCost === null && targetRound > 0);
  const totalRewards = plan.minigameRewards ?? [];

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

  if (!roadPuzzle) return <StatusNotice tone="neutral">{roadPuzzleLocale.noData}</StatusNotice>;
  if (!resourceColumns) return <StatusNotice tone="neutral">{roadPuzzleLocale.rewardDataMissing}</StatusNotice>;

  const formatCost = (value: number, approximate: boolean) =>
    `${approximate ? "≈" : ""}${resourceCountLabel(value)}`;
  const pendingLabel = calculationFailed ? "–" : calculation.status === "pending" ? roadPuzzleLocale.calculating : "–";

  return (
    <div className="space-y-v2-group-gap">
      <label htmlFor="event-road-puzzle-target-round" className="block space-y-1 text-sm text-v2-fg">
        <span className="block font-medium">{roadPuzzleLocale.targetRound}</span>
        <NumberInput
          id="event-road-puzzle-target-round"
          grouped
          showMin={false}
          showMax={false}
          className="w-full"
          min={0}
          value={targetRound}
          onValueChange={handleTargetRoundChange}
        />
      </label>
      <Switch
        id="event-road-puzzle-exclude-completed"
        checked={showCompletedRound}
        onCheckedChange={(checked) => {
          setShowCompletedRound(checked);
          if (!checked) actions.setMinigameStartRound(1);
        }}
        label={roadPuzzleLocale.excludeCompleted}
      />
      {showCompletedRound ? (
        <label htmlFor="event-road-puzzle-completed-round" className="block space-y-1 text-sm text-v2-fg">
          <span className="block font-medium">{roadPuzzleLocale.completedRound}</span>
          <NumberInput
            id="event-road-puzzle-completed-round"
            grouped
            showMin={false}
            showMax={false}
            className="w-full"
            min={0}
            max={Math.max(0, targetRound - 1)}
            value={Math.max(0, startRound - 1)}
            onValueChange={(round) => actions.setMinigameStartRound(round + 1)}
          />
          <p className="text-xs text-v2-fg-tertiary">{roadPuzzleLocale.completedRoundHelp}</p>
        </label>
      ) : null}
      <fieldset className="m-0 min-w-0 space-y-1 border-0 p-0">
        <legend className="mb-1 text-sm font-medium text-v2-fg">{roadPuzzleLocale.costMode}</legend>
        <div className="flex flex-wrap gap-v2-block-gap">
          {COST_MODES.map((option) => (
            <ToggleChip
              key={option.mode}
              pressed={mode === option.mode}
              onPressedChange={() => actions.setMinigamePaymentQuantityMode(option.mode)}
            >
              {option.label}
            </ToggleChip>
          ))}
        </div>
        <p className="text-xs text-v2-fg-tertiary">{roadPuzzleLocale.costModeHelp}</p>
      </fieldset>

      {calculationFailed ? (
        <StatusNotice
          tone="danger"
          action={
            <Button size="sm" onClick={calculation.retry}>
              {roadPuzzleLocale.retry}
            </Button>
          }
        >
          {roadPuzzleLocale.calculationFailed}
        </StatusNotice>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {calculation.status === "pending"
          ? roadPuzzleLocale.calculatingCost
          : calculation.status === "ready"
            ? roadPuzzleLocale.calculationComplete
            : ""}
      </p>

      {targetRound > 0 && startRound <= targetRound ? (
        <div className="grid grid-cols-1 gap-v2-block-gap md:grid-cols-2">
          <ResourceBlock title={roadPuzzleLocale.requiredResources}>
            <ResourceThumb
              itemUid={config.payment.resourceUid}
              resourceType={config.payment.resourceType}
              name={config.payment.resourceName}
              imageUrl={config.payment.imageUrl ?? undefined}
              size="md"
              label={totalCost === null ? pendingLabel : formatCost(totalCost, mode === "expected")}
              tooltip
            />
          </ResourceBlock>
          <ResourceBlock title={roadPuzzleLocale.totalRewards}>
            {totalRewards.map((reward) => (
              <ResourceThumb
                key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
                itemUid={reward.resourceUid}
                resourceType={reward.resourceType}
                name={reward.resourceName}
                imageUrl={reward.imageUrl ?? undefined}
                rarity={reward.rarity}
                size="md"
                label={resourceCountLabel(reward.quantity)}
                tooltip
              />
            ))}
          </ResourceBlock>
        </div>
      ) : null}

      <section
        className={`overflow-x-auto rounded-md bg-v2-surface ${v2FocusRing}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: A horizontally scrollable table needs keyboard scrolling.
        tabIndex={0}
        aria-label={roadPuzzleLocale.roundDetails}
      >
        <table className="w-full min-w-[20rem] border-collapse text-sm">
          <caption className="sr-only">{`${roadPuzzleLocale.round}별 필요 재화와 보상`}</caption>
          <thead className="text-xs text-v2-fg-tertiary">
            <tr>
              <th className="p-2 text-left font-medium" scope="col">
                {roadPuzzleLocale.round}
              </th>
              {resourceColumns.map((resource) => (
                <th className="p-2 text-right font-medium" key={resource.key} scope="col">
                  <span className="inline-flex justify-end">
                    <ResourceThumb
                      itemUid={resource.resourceUid}
                      resourceType={resource.resourceType}
                      name={resource.name}
                      imageUrl={resource.imageUrl ?? undefined}
                      size="sm"
                      tooltip
                    />
                  </span>
                  <span className="sr-only">{resource.name}</span>
                </th>
              ))}
              <th className="p-2" scope="col">
                <span className="sr-only">회차 보상</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedRounds.has(row.round);
              const rowLabel = row.isLoop
                ? roadPuzzleLocale.loopRoundLabel(row.loopCount)
                : roadPuzzleLocale.roundLabel(row.round);
              const estimate = row.estimate
                ? mode === "min"
                  ? row.estimate.minimum
                  : mode === "max"
                    ? row.estimate.maximum
                    : row.estimate.expected
                : null;
              return (
                <Fragment key={row.round}>
                  <tr
                    className={`border-t border-v2-divider ${row.selected ? "bg-v2-inset text-v2-fg" : "text-v2-fg-tertiary"}`}
                  >
                    <th className="p-2 text-left font-medium" scope="row">
                      {rowLabel}
                      {row.selected ? <span className="sr-only"> ({roadPuzzleLocale.included})</span> : null}
                    </th>
                    <td className="p-2 text-right tabular-nums">
                      {calculationFailed
                        ? "–"
                        : estimate !== null
                          ? formatCost(estimate, mode === "expected" && row.round >= 3)
                          : "–"}
                    </td>
                    {resourceColumns.slice(1).map((resource) => {
                      const quantity = rewardQuantity(row.completionRewards, resource);
                      return (
                        <td className="p-2 text-right tabular-nums" key={resource.key}>
                          {quantity > 0 ? (
                            resourceCountLabel(quantity)
                          ) : (
                            <>
                              <span className="sr-only">{roadPuzzleLocale.noReward}</span>
                              <span aria-hidden="true">–</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1 text-right">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`road-puzzle-round-${row.round}-details`}
                        aria-label={`${rowLabel} 보상 ${isExpanded ? "접기" : "펼치기"}`}
                        className={`inline-flex size-7 items-center justify-center rounded-sm text-v2-fg-secondary hover:bg-v2-hover ${v2FocusRing}`}
                        onClick={() => toggleExpanded(row.round)}
                      >
                        <ChevronRightIcon
                          aria-hidden="true"
                          className={`size-4 transition-transform motion-reduce:transition-none ${isExpanded ? "rotate-90" : ""}`}
                        />
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr id={`road-puzzle-round-${row.round}-details`} className="border-t border-v2-divider">
                      <td className="space-y-v2-group-gap p-v2-tile-p" colSpan={resourceColumns.length + 2}>
                        <RewardList title={roadPuzzleLocale.totalRewards} rewards={row.completionRewards} />
                        {!row.isLoop ? (
                          <RewardList
                            title={roadPuzzleLocale.pathRewards}
                            description={roadPuzzleLocale.pathRewardsHelp}
                            rewards={row.pathRewards}
                          />
                        ) : null}
                        <Link
                          className={v2ButtonClassName({ variant: "link", size: "sm" })}
                          to={`/events/${plan.eventUid}/road-puzzle?round=${viewerRound(row.round)}&map=1`}
                        >
                          {roadPuzzleLocale.mapLink}
                        </Link>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>

      <AsideLinks
        items={[
          {
            key: "road-puzzle-viewer",
            title: roadPuzzleLocale.viewerLinkTitle,
            description: roadPuzzleLocale.viewerLinkDescription,
            Icon: MapIcon,
            to: `/events/${plan.eventUid}/road-puzzle?round=${viewerRound(targetRound)}&map=1`,
          },
        ]}
      />
    </div>
  );
}

function ResourceBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-v2-surface p-v2-tile-p">
      <h3 className="mb-v2-group-gap text-xs font-semibold text-v2-fg">{title}</h3>
      <div className="flex flex-wrap items-start gap-v2-block-gap">{children}</div>
    </div>
  );
}

function RewardList({ title, description, rewards }: { title: string; description?: string; rewards: RewardItem[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-v2-fg">
        {title}
        {description ? <span className="ml-1 font-normal text-v2-fg-tertiary">{description}</span> : null}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-v2-block-gap">
        {rewards.map((reward) => (
          <ResourceThumb
            key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
            itemUid={reward.resourceUid}
            resourceType={reward.resourceType}
            name={reward.resourceName}
            imageUrl={reward.imageUrl ?? undefined}
            rarity={reward.rarity}
            size="md"
            label={resourceCountLabel(reward.quantity)}
            tooltip
          />
        ))}
      </div>
    </div>
  );
}
