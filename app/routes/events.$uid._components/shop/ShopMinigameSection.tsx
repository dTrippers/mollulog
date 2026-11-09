import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useId } from "react";
import { Link } from "react-router";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Select } from "~/components/v2/primitives/Select";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import {
  CARD_FLIP_STRATEGIES,
  type MinigameConfig,
  type MinigamePaymentQuantityMode,
  type RewardItem,
} from "~/domain/event-shop";
import { getJankenResourceRoles } from "~/domain/event-shop/janken";
import { calculateTreasureHuntRoundEstimates } from "~/domain/event-shop/treasure-hunt";
import { calculateMinigameRewards, hasVariableMinigamePayment } from "~/domain/event-shop/utils";
import { getRoadPuzzleRoundRows, getRoadPuzzleTotalCost } from "~/domain/road-puzzle/calculator";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { cardFlipLocale, jankenLocale, minigameDescription, roadPuzzleLocale, treasureHuntLocale } from "~/locales/ko";
import { minigameTitle } from "./shop-model";
import { CurrencyIcon, formatCount, LabeledRow, Pill, Segmented, ShopSection, ShopSectionHeader } from "./shop-ui";

const COST_MODE_OPTIONS = [
  { value: "min", label: "최소" },
  { value: "expected", label: "기대" },
  { value: "max", label: "최대" },
] as const satisfies readonly { value: MinigamePaymentQuantityMode; label: string }[];

// The minigame played alongside the shop: only the values the shop plan needs, with a link to the full tab.
export function ShopMinigameSection({ plan }: { plan: EventShopPlanContext }) {
  const config = plan.minigameConfig;
  if (!config) return null;
  const type = config.minigameType;
  const tabLink =
    type === "janken"
      ? { label: "세부 설정", to: `/events/${plan.eventUid}/shop/janken` }
      : type === "card_flip"
        ? { label: "전략 비교", to: `/events/${plan.eventUid}/shop/card-flip` }
        : type === "treasure_hunt"
          ? { label: "보물찾기 탭", to: `/events/${plan.eventUid}/treasure-hunt` }
          : type === "road_puzzle"
            ? { label: "철도 연결 탭", to: roadPuzzleViewerLink(plan, plan.state.minigamePlayCount) }
            : null;

  return (
    <ShopSection id="shop-minigame-title" region="minigame">
      <ShopSectionHeader
        id="shop-minigame-title"
        title={minigameTitle(type)}
        actions={
          tabLink ? (
            <Link
              to={tabLink.to}
              className="inline-flex items-center gap-1 text-xs font-medium text-v2-link hover:underline"
            >
              {tabLink.label}
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null
        }
      />
      {type === "janken" ? (
        <JankenCard plan={plan} config={config} />
      ) : type === "card_flip" ? (
        <CardFlipCard plan={plan} config={config} />
      ) : type === "treasure_hunt" ? (
        <TreasureHuntCard plan={plan} config={config} />
      ) : type === "road_puzzle" ? (
        <RoadPuzzleCard plan={plan} config={config} />
      ) : (
        <GenericMinigameCard plan={plan} config={config} />
      )}
    </ShopSection>
  );
}

function MinigameCard({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-v2-surface p-3">{children}</div>;
}

function Stepper({
  id,
  value,
  min = 0,
  max,
  onChange,
}: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberInput
      id={id}
      grouped
      showMin={false}
      showMax={false}
      className="w-[7.5rem]"
      min={min}
      max={max}
      value={value}
      onValueChange={onChange}
    />
  );
}

function CostModeRow({ plan, caption }: { plan: EventShopPlanContext; caption: string }) {
  return (
    <LabeledRow label="비용 기준">
      <Segmented
        label="비용 기준"
        value={plan.state.minigamePaymentQuantityMode}
        options={COST_MODE_OPTIONS}
        onChange={plan.actions.setMinigamePaymentQuantityMode}
      />
      <span className="text-xs text-v2-fg-tertiary">{caption}</span>
    </LabeledRow>
  );
}

// Completed and target rounds. The plan stores the first round to count, so "completed" is one less.
function RoundRows({ plan, idPrefix }: { plan: EventShopPlanContext; idPrefix: string }) {
  const target = plan.state.minigamePlayCount;
  const completed = Math.max(0, plan.state.minigameStartRound - 1);
  return (
    <>
      <LabeledRow label="완료한 회차" htmlFor={`${idPrefix}-completed`}>
        <Stepper
          id={`${idPrefix}-completed`}
          value={completed}
          max={Math.max(0, target - 1)}
          onChange={(round) => plan.actions.setMinigameStartRound(round + 1)}
        />
      </LabeledRow>
      <LabeledRow label="목표 회차" htmlFor={`${idPrefix}-target`}>
        <Stepper
          id={`${idPrefix}-target`}
          value={target}
          onChange={(round) => {
            plan.actions.setMinigamePlayCount(round);
            if (round === 0 || plan.state.minigameStartRound > round) {
              plan.actions.setMinigameStartRound(Math.max(1, round));
            }
          }}
        />
      </LabeledRow>
    </>
  );
}

function AmountRow({
  label,
  uid,
  type,
  imageUrl,
  name,
  amount,
  total = false,
}: {
  label: ReactNode;
  uid: string;
  type?: RewardItem["resourceType"];
  imageUrl?: string | null;
  name?: string | null;
  amount: ReactNode;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[1.625rem] items-center justify-between gap-3 text-[0.8125rem]",
        total && "mt-0.5 border-t border-v2-divider pt-1.5",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">{label}</span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 tabular-nums",
          total ? "font-bold text-v2-fg" : "text-v2-fg-secondary",
        )}
      >
        <CurrencyIcon uid={uid} type={type} imageUrl={imageUrl} name={name ?? undefined} />
        {amount}
      </span>
    </div>
  );
}

function ExpectedRewards({
  caption,
  rewards,
  limit,
  large = false,
}: {
  caption: string;
  rewards: RewardItem[];
  limit?: number;
  // Large thumbs with corner counts, on the page color, for long reward lists.
  large?: boolean;
}) {
  if (rewards.length === 0) return null;
  const shown = limit ? rewards.slice(0, limit) : rewards;
  const hidden = rewards.length - shown.length;
  return (
    <div>
      <p className="mb-1.5 text-xs text-v2-fg-tertiary">{caption}</p>
      <div className={cn("flex flex-wrap items-center", large ? "gap-2 rounded-md bg-v2-canvas p-2" : "gap-1")}>
        {shown.map((reward) => (
          <ResourceThumb
            key={`${reward.resourceType}:${reward.resourceUid}:${reward.rarity ?? ""}`}
            itemUid={reward.resourceUid}
            resourceType={reward.resourceType}
            name={reward.resourceName ?? cardFlipLocale.resourceNameUnavailable}
            imageUrl={reward.imageUrl ?? undefined}
            rarity={reward.rarity}
            size={large ? "md" : "drop"}
            labelPlacement={large ? "corner" : "inset"}
            quantity={reward.quantity}
            tooltip
          />
        ))}
        {hidden > 0 ? <span className="ml-1 text-xs text-v2-fg-tertiary">외 {formatCount(hidden)}종</span> : null}
      </div>
    </div>
  );
}

function JankenCard({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const janken = config.janken ?? { status: "unavailable" as const };
  const goals = plan.jankenEntry.goals;
  const planned = plan.jankenPlan;
  if (planned.status === "score-input-required") {
    return <StatusNotice tone="warning">{jankenLocale.shopAverageMissingWarning}</StatusNotice>;
  }
  if (janken.status !== "available" || planned.status !== "available") {
    const invalid = janken.status === "invalid" || planned.status === "invalid";
    return (
      <StatusNotice tone={invalid ? "danger" : "neutral"}>
        {invalid ? jankenLocale.invalid : jankenLocale.unavailable}
      </StatusNotice>
    );
  }

  const roles = getJankenResourceRoles(
    janken,
    plan.shopResources.map(({ paymentResource }) => paymentResource.uid),
    plan.jankenStudentGrowthUid ?? null,
  );
  const rewardItems = [
    ...janken.stages.flatMap((stage) => stage.rewards),
    ...janken.scoreRewards.flatMap((tier) => tier.rewards),
  ];
  const rewardByUid = new Map<string, RewardItem>();
  for (const reward of rewardItems)
    if (!rewardByUid.has(reward.resourceUid)) rewardByUid.set(reward.resourceUid, reward);
  const nameOf = (uid: string | null, fallback: string) =>
    (uid ? rewardByUid.get(uid)?.resourceName?.replace(/\s+/g, " ").trim() : undefined) || fallback;
  const iconOf = (uid: string | null, name: string) => {
    const reward = uid ? rewardByUid.get(uid) : undefined;
    return uid ? (
      <CurrencyIcon uid={uid} type={reward?.resourceType} imageUrl={reward?.imageUrl} name={name} size="lg" />
    ) : null;
  };
  const shopName = nameOf(roles.shopUid, jankenLocale.shopCurrency);
  const studentName = nameOf(roles.studentUid, jankenLocale.studentGrowth);
  const goalPills: { key: string; title: string; icon: ReactNode; label: string }[] = [
    ...(goals.shopCurrencyMode === "linked"
      ? [
          {
            key: "shop",
            title: jankenLocale.shopCurrencyTarget(shopName),
            icon: iconOf(roles.shopUid, shopName),
            label: "부족분",
          },
        ]
      : goals.manualShopCurrency > 0
        ? [
            {
              key: "shop",
              title: jankenLocale.shopCurrencyTargetAmount(shopName, goals.manualShopCurrency),
              icon: iconOf(roles.shopUid, shopName),
              label: `${formatCount(goals.manualShopCurrency)}개`,
            },
          ]
        : []),
    ...(goals.targetTier == null
      ? []
      : [
          {
            key: "student",
            title: jankenLocale.studentGoalTarget(studentName, jankenLocale.tierLabel(goals.targetTier)),
            icon: iconOf(roles.studentUid, studentName),
            label: jankenLocale.tierLabel(goals.targetTier),
          },
        ]),
    ...(goals.targetScore == null
      ? []
      : [
          {
            key: "score",
            title: jankenLocale.scoreGoalTarget(goals.targetScore),
            icon: null,
            label: jankenLocale.scoreGoalTarget(goals.targetScore),
          },
        ]),
    ...(goals.targetEquipmentTier == null
      ? []
      : [
          {
            key: "equipment",
            title: jankenLocale.equipmentGoalTarget(goals.targetEquipmentTier),
            icon: iconOf(roles.equipmentUid, jankenLocale.equipmentGoal),
            label: `T${goals.targetEquipmentTier}`,
          },
        ]),
  ];
  const stageLabel = (stage: (typeof janken.stages)[number]) =>
    stage.stageType === "story"
      ? jankenLocale.storyStage(stage.stageNumber)
      : stage.stageType === "normal"
        ? jankenLocale.normalStage(stage.stageNumber)
        : jankenLocale.challengeStage;
  const playedStages = janken.stages.filter((stage) => (planned.stagePlays[stage.uid] ?? 0) > 0);
  const entryName = (stage: (typeof janken.stages)[number]) =>
    stage.entryCost.resourceName?.replace(/\s+/g, " ").trim() || jankenLocale.entryCurrency;
  const roleOrder = [roles.studentUid, roles.shopUid, roles.equipmentUid].filter((uid): uid is string => uid !== null);
  const rewards = Object.entries(planned.rewards)
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => {
      const leftRole = roleOrder.indexOf(left);
      const rightRole = roleOrder.indexOf(right);
      if (leftRole >= 0 || rightRole >= 0)
        return (leftRole < 0 ? Infinity : leftRole) - (rightRole < 0 ? Infinity : rightRole);
      return (
        rewardItems.findIndex(({ resourceUid }) => resourceUid === left) -
        rewardItems.findIndex(({ resourceUid }) => resourceUid === right)
      );
    })
    .flatMap(([uid, quantity]) => {
      const reward = rewardByUid.get(uid);
      return reward ? [{ ...reward, quantity }] : [];
    });
  const entryStage = playedStages[0] ?? janken.stages[0];

  return (
    <MinigameCard>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-v2-fg-tertiary">목표</span>
        {goalPills.length > 0 ? (
          goalPills.map((goal) => (
            <span
              key={goal.key}
              title={goal.title}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full bg-v2-inset pr-2 text-xs font-semibold whitespace-nowrap text-v2-fg-secondary",
                goal.icon ? "pl-[3px]" : "pl-2",
              )}
            >
              {goal.icon}
              {goal.label}
            </span>
          ))
        ) : (
          <span className="text-xs text-v2-fg-secondary">{jankenLocale.shopCurrencyTarget(shopName)}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {playedStages.map((stage) => {
          const plays = planned.stagePlays[stage.uid] ?? 0;
          return (
            <AmountRow
              key={stage.uid}
              label={
                <>
                  <Pill tone="neutral">{stageLabel(stage)}</Pill>
                  <span className="font-semibold tabular-nums text-v2-fg">{jankenLocale.playCountBadge(plays)}</span>
                </>
              }
              uid={stage.entryCost.resourceUid}
              name={entryName(stage)}
              amount={formatCount(stage.entryCost.quantity * plays)}
            />
          );
        })}
        {planned.entryResourceUid ? (
          <AmountRow
            total
            label={<span className="font-semibold text-v2-fg">{jankenLocale.entryCurrencyRequired}</span>}
            uid={planned.entryResourceUid}
            name={entryStage ? entryName(entryStage) : jankenLocale.entryCurrency}
            amount={formatCount(planned.entryCost)}
          />
        ) : null}
      </div>
      <ExpectedRewards caption="기대 획득 개수 · 누적 스코어 보상 포함" rewards={rewards} large />
    </MinigameCard>
  );
}

function CardFlipCard({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const id = useId();
  const rewards = plan.minigameRewards ?? calculateMinigameRewards(config, plan.state.minigamePlayCount);
  const cost = plan.minigamePaymentCosts?.[0];
  return (
    <MinigameCard>
      <div className="flex flex-col gap-2">
        <LabeledRow label="카드 수" htmlFor={`${id}-count`}>
          <Stepper
            id={`${id}-count`}
            value={plan.state.minigamePlayCount}
            onChange={plan.actions.setMinigamePlayCount}
          />
        </LabeledRow>
        <LabeledRow label="전략">
          <Select
            label={cardFlipLocale.strategyControlLabel}
            value={plan.state.cardFlipStrategy}
            options={CARD_FLIP_STRATEGIES.map((strategy) => ({
              value: strategy,
              label: cardFlipLocale.strategies[strategy].shortLabel,
            }))}
            onChange={plan.actions.setCardFlipStrategy}
          />
        </LabeledRow>
      </div>
      {cost ? (
        <AmountRow
          total
          label={
            <span className="min-w-0 truncate">
              <span className="font-semibold text-v2-fg">소비</span>{" "}
              <span className="text-v2-fg-secondary">{cost.resourceName}</span>
            </span>
          }
          uid={cost.resourceUid}
          type={cost.resourceType}
          imageUrl={cost.imageUrl}
          name={cost.resourceName}
          amount={formatCount(cost.quantity)}
        />
      ) : null}
      {plan.state.minigamePlayCount > 0 ? (
        <ExpectedRewards caption={`기대 획득 개수 · ${formatCount(rewards.length)}종`} rewards={rewards} limit={8} />
      ) : null}
    </MinigameCard>
  );
}

function TreasureHuntCard({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const id = useId();
  const calculation = plan.treasureHuntCalculation;
  const mode = plan.state.minigamePaymentQuantityMode;
  const estimates = calculateTreasureHuntRoundEstimates(calculation.rows, calculation.statsBySignature, mode);
  // Rounds with the same board and treasures cost the same per play, so consecutive ones share a row.
  const groups: { from: number; to: number; isLoop: boolean; plays: number; estimate: (typeof estimates)[number] }[] =
    [];
  for (const [index, estimate] of estimates.entries()) {
    const previous = groups.at(-1);
    const row = calculation.rows[index];
    const previousRow = index > 0 ? calculation.rows[index - 1] : undefined;
    if (previous && !estimate.isLoop && !previous.isLoop && row && previousRow?.signature === row.signature) {
      previous.to = estimate.round;
      previous.plays += estimate.multiplicity;
    } else {
      groups.push({
        from: estimate.round,
        to: estimate.round,
        isLoop: estimate.isLoop,
        plays: estimate.multiplicity,
        estimate,
      });
    }
  }
  const payment = calculation.estimate?.payment;
  const status = calculation.status;
  const cellCost = calculation.rows[0]?.config.cellCost ?? config.payment;

  return (
    <MinigameCard>
      <div className="flex flex-col gap-2">
        <RoundRows plan={plan} idPrefix={id} />
        <CostModeRow plan={plan} caption="하위 10% · 50% · 90% 지점" />
      </div>
      {status === "no-data" ? (
        <StatusNotice tone="neutral">{treasureHuntLocale.noData}</StatusNotice>
      ) : status === "incompatible" ? (
        <StatusNotice tone="warning">{treasureHuntLocale.incompatible}</StatusNotice>
      ) : status === "round-limit" ? (
        <StatusNotice tone="warning">{treasureHuntLocale.targetRoundLimit}</StatusNotice>
      ) : status === "failed" ? (
        <StatusNotice
          tone="danger"
          action={
            <Button size="sm" onClick={calculation.retry}>
              {treasureHuntLocale.retry}
            </Button>
          }
        >
          {treasureHuntLocale.failed}
        </StatusNotice>
      ) : null}
      {groups.length > 0 ? (
        <div className="flex flex-col gap-1">
          {groups.map((group) => {
            const label = group.isLoop
              ? treasureHuntLocale.roundAfter(group.from)
              : group.from === group.to
                ? `${group.from}회차`
                : `${group.from} ~ ${group.to}회차`;
            const perPlay = group.estimate.payment;
            return (
              <AmountRow
                key={`${group.from}:${group.isLoop}`}
                label={
                  <>
                    <Pill tone="neutral">{label}</Pill>
                    <span className="font-semibold tabular-nums text-v2-fg">{formatCount(group.plays)}회</span>
                  </>
                }
                uid={cellCost.resourceUid}
                type={cellCost.resourceType}
                imageUrl={cellCost.imageUrl}
                name={cellCost.resourceName}
                amount={
                  perPlay ? (
                    <>
                      <span className="text-xs text-v2-fg-tertiary">회당</span> {formatCount(perPlay.quantity)}
                    </>
                  ) : group.estimate.failed ? (
                    "—"
                  ) : (
                    <span className="text-xs text-v2-fg-tertiary">
                      {calculation.progress === null
                        ? treasureHuntLocale.calculatingShort
                        : treasureHuntLocale.progress(Math.round(calculation.progress * 100))}
                    </span>
                  )
                }
              />
            );
          })}
          <AmountRow
            total
            label={
              <span className="min-w-0 truncate">
                <span className="font-semibold text-v2-fg">필요</span>{" "}
                <span className="text-v2-fg-secondary">{cellCost.resourceName}</span>
              </span>
            }
            uid={cellCost.resourceUid}
            type={cellCost.resourceType}
            imageUrl={cellCost.imageUrl}
            name={cellCost.resourceName}
            amount={payment ? formatCount(payment.quantity) : "—"}
          />
        </div>
      ) : null}
    </MinigameCard>
  );
}

function RoadPuzzleCard({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const id = useId();
  const calculation = plan.roadPuzzleCalculation;
  const roadPuzzle = config.roadPuzzle;
  const target = plan.state.minigamePlayCount;
  const start = Math.max(1, plan.state.minigameStartRound);
  const mode = plan.state.minigamePaymentQuantityMode;
  if (!roadPuzzle) {
    return (
      <MinigameCard>
        <StatusNotice tone="neutral">{roadPuzzleLocale.noData}</StatusNotice>
      </MinigameCard>
    );
  }
  const rows = getRoadPuzzleRoundRows(
    roadPuzzle,
    calculation.resultsByUid,
    start,
    target,
    config.payment.quantity,
  ).filter(({ selected }) => selected);
  const total =
    target >= start && target > 0 && calculation.status === "ready"
      ? getRoadPuzzleTotalCost(roadPuzzle, calculation.resultsByUid, start, target, mode, config.payment.quantity)
      : null;
  const failed = calculation.status === "failed" || (calculation.status === "ready" && total === null && target > 0);
  const payment = config.payment;
  const pending = <span className="text-xs text-v2-fg-tertiary">{roadPuzzleLocale.calculating}</span>;

  return (
    <MinigameCard>
      <div className="flex flex-col gap-2">
        <RoundRows plan={plan} idPrefix={id} />
        <CostModeRow plan={plan} caption="맵 중 최소 · 평균 · 최대" />
      </div>
      {failed ? (
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
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {rows.map((row) => {
            const plays = row.isLoop ? row.loopCount : 1;
            const perPlay = row.estimate
              ? mode === "min"
                ? row.estimate.minimum
                : mode === "max"
                  ? row.estimate.maximum
                  : row.estimate.expected
              : null;
            return (
              <AmountRow
                key={row.round}
                label={
                  <>
                    <Pill tone="neutral">
                      {row.isLoop ? treasureHuntLocale.roundAfter(row.round) : `${row.round}회차`}
                    </Pill>
                    {row.isLoop ? (
                      <span className="font-semibold tabular-nums text-v2-fg">{formatCount(plays)}회</span>
                    ) : null}
                  </>
                }
                uid={payment.resourceUid}
                type={payment.resourceType}
                imageUrl={payment.imageUrl}
                name={payment.resourceName}
                amount={failed ? "—" : perPlay === null ? pending : formatCount(Math.round(perPlay * plays))}
              />
            );
          })}
          <AmountRow
            total
            label={
              <span className="min-w-0 truncate">
                <span className="font-semibold text-v2-fg">필요</span>{" "}
                <span className="text-v2-fg-secondary">{payment.resourceName}</span>
              </span>
            }
            uid={payment.resourceUid}
            type={payment.resourceType}
            imageUrl={payment.imageUrl}
            name={payment.resourceName}
            amount={failed ? "—" : total === null ? pending : formatCount(Math.round(total))}
          />
        </div>
      ) : null}
      {roadPuzzle.rounds.every((round) => round.rewards.length === 0) ? (
        <StatusNotice tone="neutral">{roadPuzzleLocale.rewardDataMissing}</StatusNotice>
      ) : (
        <p className="text-xs text-v2-fg-tertiary">완성 보상 3회분만 “최종 획득 재화”에 더해요. 경로 보상은 빠져요.</p>
      )}
    </MinigameCard>
  );
}

function GenericMinigameCard({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const id = useId();
  const variable = hasVariableMinigamePayment(config);
  const costs = plan.minigamePaymentCosts ?? [];
  const description = minigameDescription(config.minigameType);
  return (
    <MinigameCard>
      <div className="flex flex-col gap-2">
        <LabeledRow label={config.minigameType === "dice" ? "주사위 횟수" : "플레이 횟수"} htmlFor={`${id}-count`}>
          <Stepper
            id={`${id}-count`}
            value={plan.state.minigamePlayCount}
            onChange={(count) => {
              plan.actions.setMinigamePlayCount(count);
              if (config.minigameType === "clue_search" && (count === 0 || plan.state.minigameStartRound > count)) {
                plan.actions.setMinigameStartRound(Math.max(1, count));
              }
            }}
          />
        </LabeledRow>
        {config.minigameType === "clue_search" ? (
          <LabeledRow label="시작 회차" htmlFor={`${id}-start`}>
            <Stepper
              id={`${id}-start`}
              value={plan.state.minigameStartRound}
              min={1}
              max={plan.state.minigamePlayCount || undefined}
              onChange={plan.actions.setMinigameStartRound}
            />
          </LabeledRow>
        ) : null}
        {variable ? (
          <LabeledRow label="지불 기준">
            <Segmented
              label="지불 기준"
              value={plan.state.minigamePaymentQuantityMode}
              options={COST_MODE_OPTIONS}
              onChange={plan.actions.setMinigamePaymentQuantityMode}
            />
          </LabeledRow>
        ) : null}
      </div>
      {description ? <p className="text-xs text-v2-fg-tertiary">{description}</p> : null}
      {plan.state.minigamePlayCount > 0 && costs.length > 0 ? (
        <div className="flex flex-col">
          {costs.map((cost, index) => (
            <AmountRow
              key={`${cost.resourceType}:${cost.resourceUid}`}
              total={index === 0}
              label={
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-v2-fg">필요</span>{" "}
                  <span className="text-v2-fg-secondary">{cost.resourceName}</span>
                </span>
              }
              uid={cost.resourceUid}
              type={cost.resourceType}
              imageUrl={cost.imageUrl}
              name={cost.resourceName}
              amount={formatCount(cost.quantity)}
            />
          ))}
        </div>
      ) : null}
    </MinigameCard>
  );
}

function roadPuzzleViewerLink(plan: EventShopPlanContext, round: number) {
  return `/events/${plan.eventUid}/road-puzzle?round=${Math.min(7, Math.max(1, round))}&map=1`;
}
