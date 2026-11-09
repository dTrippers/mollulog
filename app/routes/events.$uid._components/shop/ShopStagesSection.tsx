import { BoltIcon } from "@heroicons/react/16/solid";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { useV2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import { resourceCountLabel } from "~/domain/event-shop/utils";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { roadPuzzleLocale } from "~/locales/ko";
import { normalStages } from "./shop-model";
import { formatCount, ShopSection, ShopSectionHeader } from "./shop-ui";

type Stage = EventShopPlanContext["stages"][number];

export function ShopStagesSection({ plan }: { plan: EventShopPlanContext }) {
  const { stacked } = useV2Page();
  const stages = normalStages(plan);
  const enabled = stages.filter((stage) => plan.state.enabledStages[stage.uid]);
  const disabled = stages.filter((stage) => !plan.state.enabledStages[stage.uid]);
  const runsOf = (stage: Stage) => plan.stageCalculations.stageRuns[stage.uid] ?? 0;
  const extraOf = (stage: Stage) => plan.state.extraStageRuns[stage.uid] ?? 0;
  const totalRuns = enabled.reduce((sum, stage) => sum + runsOf(stage), 0);
  const totalExtra = enabled.reduce((sum, stage) => sum + extraOf(stage), 0);
  const totalAp = plan.stageCalculations.questSweepAp + plan.stageCalculations.extraSweepAp;
  // Before the first calculation lands, the stage runs are the empty result's zeros, not a plan.
  const runsKnown =
    plan.hasCalculationResult &&
    !plan.holdTreasureHuntCalculations &&
    !plan.roadPuzzlePlannerStatus &&
    !plan.calculationFailed;

  return (
    <ShopSection id="stage-plan-title" region="stage-plan">
      <ShopSectionHeader
        id="stage-plan-title"
        title="스테이지 소탕"
        description={
          stacked
            ? undefined
            : "대상 스테이지에서 AP 소모를 최소화하는 소탕 횟수를 계산해요. 추가로 재화를 획득하려면 추가 소탕 횟수를 입력해주세요."
        }
        actions={
          <Switch
            id="event-shop-first-clear"
            checked={plan.state.includeFirstClear}
            onCheckedChange={plan.actions.setIncludeFirstClear}
            label={stacked ? "초회 보상" : "초회 보상 포함"}
            layout="inline"
          />
        }
      />
      {stacked ? (
        <p className="text-[0.8125rem] text-v2-fg-tertiary">
          대상 스테이지에서 AP 소모를 최소화하는 소탕 횟수를 계산해요. 추가로 재화를 획득하려면 추가 소탕 횟수를
          입력해주세요.
        </p>
      ) : null}
      <RoadPuzzlePlannerStatus plan={plan} />
      {stacked ? (
        <div className="flex flex-col gap-3">
          {enabled.map((stage) => (
            <article
              key={stage.uid}
              aria-label={`스테이지 ${stage.index}`}
              className="flex flex-col gap-3 rounded-lg bg-v2-surface p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <StageLabel stage={stage} />
                <StageSwitch plan={plan} stage={stage} />
              </div>
              <StageDrops plan={plan} stage={stage} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.8125rem] text-v2-fg-secondary tabular-nums">
                  필요 소탕{" "}
                  <b className="font-bold text-v2-fg">{runsKnown ? `${formatCount(runsOf(stage))}회` : "—"}</b>
                  {runsKnown ? ` · ${formatCount((runsOf(stage) + extraOf(stage)) * stage.entryAp)} AP` : null}
                </p>
                <ExtraRunsInput plan={plan} stage={stage} />
              </div>
            </article>
          ))}
          {enabled.length > 0 ? (
            <div className="flex items-center justify-between px-0.5 text-[0.8125rem] font-semibold tabular-nums">
              <span className="text-v2-fg">합계 {runsKnown ? `${formatCount(totalRuns + totalExtra)}회` : "—"}</span>
              <span className="text-v2-ap">{runsKnown ? `${formatCount(totalAp)} AP` : "—"}</span>
            </div>
          ) : null}
          {disabled.length > 0 ? (
            <div className="rounded-lg bg-v2-surface p-3">
              <p className="mb-1 text-xs text-v2-fg-tertiary">대상이 아닌 스테이지 {formatCount(disabled.length)}개</p>
              <ul className="flex flex-col">
                {disabled.map((stage) => (
                  <li key={stage.uid} className="flex min-h-11 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 opacity-60">
                      <StageLabel stage={stage} compact />
                      <StageDrops plan={plan} stage={stage} compact />
                    </div>
                    <StageSwitch plan={plan} stage={stage} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg bg-v2-surface py-1">
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead>
              <tr className="h-9 text-left text-xs text-v2-fg-tertiary">
                <th scope="col" className="w-[3.25rem] pl-3 font-normal">
                  대상
                </th>
                <th scope="col" className="w-[5.75rem] font-normal">
                  스테이지
                </th>
                <th scope="col" className="font-normal">
                  드롭
                </th>
                <th scope="col" className="w-[5.25rem] text-right font-normal">
                  필요 소탕
                </th>
                <th scope="col" className="w-32 pl-4 font-normal">
                  추가 소탕
                </th>
                <th scope="col" className="w-[5.5rem] pr-3.5 text-right font-normal">
                  AP
                </th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => {
                const on = !!plan.state.enabledStages[stage.uid];
                const runs = runsOf(stage);
                return (
                  <tr key={stage.uid} className="h-12">
                    <td className="pl-3">
                      <StageSwitch plan={plan} stage={stage} />
                    </td>
                    <td className={cn(!on && "opacity-50")}>
                      <StageLabel stage={stage} />
                    </td>
                    <td className={cn("py-2", !on && "opacity-50")}>
                      <StageDrops plan={plan} stage={stage} />
                    </td>
                    <td className="text-right font-bold tabular-nums text-v2-fg">
                      {on && runsKnown ? (
                        `${formatCount(runs)}회`
                      ) : (
                        <span className="font-normal text-v2-fg-tertiary">—</span>
                      )}
                    </td>
                    <td className="pl-4">{on ? <ExtraRunsInput plan={plan} stage={stage} /> : null}</td>
                    <td className="pr-3.5 text-right font-semibold tabular-nums text-v2-fg">
                      {on && runsKnown ? (
                        formatCount((runs + extraOf(stage)) * stage.entryAp)
                      ) : (
                        <span className="font-normal text-v2-fg-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="h-[3.25rem] bg-v2-inset">
                <td colSpan={3} className="rounded-bl-lg pl-3 text-v2-fg-tertiary">
                  <b className="font-semibold text-v2-fg">합계</b> · 대상 스테이지 {formatCount(enabled.length)}개
                </td>
                <td className="text-right font-bold tabular-nums text-v2-fg">
                  {runsKnown ? `${formatCount(totalRuns)}회` : "—"}
                </td>
                <td className="pl-4 text-v2-fg-tertiary tabular-nums">{formatCount(totalExtra)}회</td>
                <td className="rounded-br-lg pr-3.5 text-right font-bold tabular-nums text-v2-ap">
                  {runsKnown ? formatCount(totalAp) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ShopSection>
  );
}

function StageLabel({ stage, compact = false }: { stage: Stage; compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center justify-center font-bold tabular-nums text-v2-fg",
          compact
            ? "min-w-4 text-sm font-medium"
            : "h-[1.375rem] min-w-[1.625rem] rounded-[5px] bg-v2-inset px-1 text-[0.8125rem]",
        )}
      >
        {stage.index}
      </span>
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums text-v2-ap">
        <BoltIcon className="size-3" aria-label="AP" />
        {stage.entryAp}
      </span>
    </span>
  );
}

function StageSwitch({ plan, stage }: { plan: EventShopPlanContext; stage: Stage }) {
  return (
    <Switch
      id={`stage-${stage.uid}`}
      checked={!!plan.state.enabledStages[stage.uid]}
      onCheckedChange={(checked) => plan.actions.toggleStage(stage.uid, checked)}
      label={`스테이지 ${stage.index}`}
      layout="inline"
      hideLabel
    />
  );
}

function ExtraRunsInput({ plan, stage }: { plan: EventShopPlanContext; stage: Stage }) {
  const value = plan.state.extraStageRuns[stage.uid] ?? 0;
  return (
    <NumberInput
      grouped
      aria-label={`스테이지 ${stage.index} 추가 소탕`}
      value={value}
      min={0}
      showMin={false}
      showMax={false}
      className={cn("w-[6.5rem] shrink-0", value === 0 && "[&_input]:text-v2-fg-disabled")}
      onValueChange={(next) => plan.actions.updateExtraRuns(stage.uid, next)}
    />
  );
}

// The repeat drops of a stage: event currencies first, then the student bonus on them, then other items.
function StageDrops({ plan, stage, compact = false }: { plan: EventShopPlanContext; stage: Stage; compact?: boolean }) {
  const rewards = stage.rewards.filter(
    ({ item, rewardRequirement, amount }) => item && rewardRequirement === null && amount > 0,
  );
  const coins = rewards.filter(({ item }) => item?.category === "coin");
  const others = rewards.filter(({ item }) => item?.category !== "coin");
  const size = compact ? "sm" : "drop";
  const thumbs = [
    ...coins.map(({ item, amount }) =>
      item ? (
        <ResourceThumb
          key={`coin:${item.uid}:${amount}`}
          itemUid={item.uid}
          resourceType={item.resourceType ?? ResourceTypeEnum.Item}
          name={item.name}
          imageUrl={item.imageUrl ?? undefined}
          rarity={item.rarity}
          size={size}
          label={resourceCountLabel(amount)}
          labelPlacement="inset"
          tooltip
        />
      ) : null,
    ),
    ...coins.map(({ item, amount }) => {
      if (!item) return null;
      const bonus = Math.ceil(amount * (plan.appliedBonusRatio[item.uid]?.toNumber() ?? 0));
      return bonus > 0 ? (
        <ResourceThumb
          key={`bonus:${item.uid}:${amount}`}
          itemUid={item.uid}
          resourceType={item.resourceType ?? ResourceTypeEnum.Item}
          name={`${item.name} 보너스`}
          imageUrl={item.imageUrl ?? undefined}
          rarity={item.rarity}
          size={size}
          label={<span className="text-v2-perk-on-media">+{resourceCountLabel(bonus)}</span>}
          labelPlacement="inset"
          tooltip
        />
      ) : null;
    }),
    ...others.map(({ item, amount }) =>
      item ? (
        <ResourceThumb
          key={`other:${item.uid}:${amount}`}
          itemUid={item.uid}
          resourceType={item.resourceType ?? ResourceTypeEnum.Item}
          name={item.name}
          imageUrl={item.imageUrl ?? undefined}
          rarity={item.rarity}
          size={size}
          label={resourceCountLabel(amount)}
          labelPlacement="inset"
          tooltip
        />
      ) : null,
    ),
  ];
  return <div className={cn("flex min-w-0 flex-wrap items-center", compact ? "gap-0.5" : "gap-1")}>{thumbs}</div>;
}

function RoadPuzzlePlannerStatus({ plan }: { plan: EventShopPlanContext }) {
  const status = plan.roadPuzzlePlannerStatus;
  if (status === "pending") return <StatusNotice tone="neutral">{roadPuzzleLocale.plannerPending}</StatusNotice>;
  if (status === "missing") return <StatusNotice tone="warning">{roadPuzzleLocale.noData}</StatusNotice>;
  if (status === "failed") {
    return (
      <StatusNotice
        tone="danger"
        action={
          <Button size="sm" onClick={plan.roadPuzzleCalculation.retry}>
            {roadPuzzleLocale.retry}
          </Button>
        }
      >
        {roadPuzzleLocale.plannerFailed}
      </StatusNotice>
    );
  }
  return null;
}
