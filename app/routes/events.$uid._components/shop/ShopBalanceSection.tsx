import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { calculateBoughtResourceQuantities } from "~/domain/event-shop/calculations/shop-rewards";
import { calculateMinigameRewards } from "~/domain/event-shop/utils";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { cardFlipLocale } from "~/locales/ko";
import { minigameTitle, normalStages, resultSlotState } from "./shop-model";
import { formatCount, Pill, ShopSection, ShopSectionHeader } from "./shop-ui";

// Per currency: what the plan gets, what it needs, and whether that is enough.
export function ShopBalanceSection({ plan }: { plan: EventShopPlanContext }) {
  if (plan.collectableResources.length === 0) return null;
  return (
    <ShopSection id="currency-balance-title" region="currency-balance">
      <ShopSectionHeader
        id="currency-balance-title"
        title="재화 계산 결과"
        description="선택한 아이템을 모두 얻기 위해 필요한 재화 계산 결과에요. 필요 개수를 직접 입력해 추가 소탕 필요량을 계산할 수 있어요."
      />
      <div className="@container flex flex-col gap-2">
        {plan.collectableResources.map((resource) => (
          <BalanceCard key={`${resource.type}:${resource.uid}`} plan={plan} resource={resource} />
        ))}
      </div>
    </ShopSection>
  );
}

function BalanceCard({
  plan,
  resource,
}: {
  plan: EventShopPlanContext;
  resource: EventShopPlanContext["collectableResources"][number];
}) {
  const [editingRequired, setEditingRequired] = useState(false);
  const breakdown = plan.stageCalculations.itemBreakdown;
  const uid = resource.uid;
  const minigame = plan.minigameConfig ? minigameTitle(plan.minigameConfig.minigameType) : "미니게임";
  // The owned count is the player's input, so the field reads the state right away. The breakdown echoes it only after
  // the debounced calculation, and reading it back would drop digits typed in between.
  const owned = plan.state.existingPaymentItemQuantities[uid] ?? 0;
  const existing = breakdown.existing[uid] ?? 0;
  // While the calculation waits, fails, or cannot run, the breakdown holds no result for this plan. Its zeros must not
  // read as "enough".
  const slot = resultSlotState(plan);
  const settled = slot.kind === "ready" || slot.kind === "empty";
  const recalculating = settled && plan.isCalculating;
  const acquiredSources = [
    { label: "스테이지 소탕", value: breakdown.fromRepeatedRuns[uid] ?? 0 },
    { label: `${minigame} 기대 보상`, value: breakdown.fromMinigame[uid] ?? 0 },
    { label: "초회 보상", value: breakdown.fromFirstRun[uid] ?? 0 },
    { label: "상점 구매", value: breakdown.fromShop[uid] ?? 0 },
  ].filter(({ value }) => value > 0);
  const acquired = Math.floor(existing + acquiredSources.reduce((sum, { value }) => sum + value, 0));
  const override = plan.state.overriddenRequiredQuantities[uid];
  const requiredSources = [
    { label: "상점 구매", value: breakdown.toBuyShopItems[uid] ?? 0 },
    { label: `${minigame} 플레이`, value: breakdown.toPlayMinigame[uid] ?? 0 },
  ].filter(({ value }) => value > 0);
  const calculatedRequired = Math.ceil(requiredSources.reduce((sum, { value }) => sum + value, 0));
  const required = override ?? calculatedRequired;
  const remaining = breakdown.remaining[uid] ?? 0;
  const shortfall = remaining < 0 ? Math.abs(Math.floor(remaining)) : 0;
  const unobtainable = (plan.stageCalculations.unobtainableTargets[uid] ?? 0) > 0;
  const fixStage = unobtainable ? bestDisabledStageFor(plan, uid) : null;
  const showOverrideInput = override !== undefined || editingRequired;
  const unsettledLabel = slot.kind === "failed" ? "계산 실패" : slot.kind === "blocked" ? "계산 불가" : "계산 중";

  return (
    <div className="rounded-lg bg-v2-surface p-3">
      <div className="grid grid-cols-1 items-start gap-3 @min-[40rem]:grid-cols-[12.5rem_minmax(0,1fr)_minmax(0,1fr)] @min-[40rem]:gap-6">
        <div>
          <div className="flex min-w-0 items-center gap-2.5">
            <ResourceThumb
              itemUid={uid}
              resourceType={resource.type}
              name={resource.name}
              imageUrl={resource.imageUrl ?? undefined}
              rarity={1}
              size="md"
              tooltip
            />
            <span className="min-w-0 truncate text-sm font-semibold text-v2-fg">{resource.name}</span>
          </div>
          <div className="mt-2 flex">
            {!settled ? (
              <Pill tone="neutral">{unsettledLabel}</Pill>
            ) : shortfall > 0 ? (
              <Pill tone="danger">
                <ExclamationTriangleIcon className="size-3.5" aria-hidden="true" />
                {formatCount(shortfall)} 부족
              </Pill>
            ) : (
              <Pill tone="success">
                <CheckIcon className="size-3.5" aria-hidden="true" />
                충분
              </Pill>
            )}
          </div>
        </div>
        <div className={cn(recalculating && "opacity-50")}>
          <BalanceHead label="획득 개수" value={settled ? formatCount(acquired) : "—"} />
          <BalanceLine label={<label htmlFor={`balance-owned-${uid}`}>보유 개수</label>}>
            <NumberInput
              id={`balance-owned-${uid}`}
              aria-label={`${resource.name} 보유 개수`}
              compact
              min={0}
              value={owned}
              className="w-24 text-right font-semibold"
              onChange={(event) =>
                plan.actions.updateExistingQuantity(uid, wholeCount(event.currentTarget.valueAsNumber))
              }
            />
          </BalanceLine>
          {(settled ? acquiredSources : []).map(({ label, value }) => (
            <BalanceLine key={label} label={label}>
              <b className="font-semibold tabular-nums text-v2-fg-secondary">{formatCount(Math.floor(value))}</b>
            </BalanceLine>
          ))}
          {settled && unobtainable ? (
            <BalanceLine
              danger
              label={
                <span className="inline-flex items-center gap-1">
                  <ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  획득할 수 없는 재화가 있어요
                </span>
              }
            >
              {fixStage ? (
                <Button size="sm" onClick={() => plan.actions.toggleStage(fixStage.uid, true)}>
                  스테이지 {fixStage.index} 추가
                </Button>
              ) : null}
            </BalanceLine>
          ) : null}
        </div>
        <div className={cn(recalculating && "opacity-50")}>
          <BalanceHead label="필요 개수" value={override !== undefined || settled ? formatCount(required) : "—"} />
          {showOverrideInput ? (
            <BalanceLine label={<label htmlFor={`balance-required-${uid}`}>직접 입력</label>}>
              <NumberInput
                id={`balance-required-${uid}`}
                aria-label={`${resource.name} 필요 개수`}
                compact
                min={0}
                value={required}
                className="w-24 text-right font-semibold"
                onChange={(event) =>
                  plan.actions.updateOverriddenRequired(uid, wholeCount(event.currentTarget.valueAsNumber))
                }
              />
            </BalanceLine>
          ) : (
            (settled ? requiredSources : []).map(({ label, value }) => (
              <BalanceLine key={label} label={label}>
                <b className="font-semibold tabular-nums text-v2-fg-secondary">{formatCount(Math.ceil(value))}</b>
              </BalanceLine>
            ))
          )}
          <BalanceLine label={null}>
            {showOverrideInput ? (
              <button
                type="button"
                className={linkButtonClassName}
                onClick={() => {
                  setEditingRequired(false);
                  plan.actions.resetOverriddenRequired(uid);
                }}
              >
                계산값으로 되돌리기
              </button>
            ) : (
              <button type="button" className={linkButtonClassName} onClick={() => setEditingRequired(true)}>
                필요 개수 직접 입력
              </button>
            )}
          </BalanceLine>
        </div>
      </div>
    </div>
  );
}

const linkButtonClassName = cn(
  "cursor-pointer rounded-sm text-xs font-medium text-v2-link hover:underline",
  v2FocusRing,
);

function wholeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function BalanceHead({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between pb-1 text-[0.8125rem] font-semibold text-v2-fg">
      <span>{label}</span>
      <b className="text-base font-bold tabular-nums">{value}</b>
    </div>
  );
}

function BalanceLine({ label, danger = false, children }: { label: ReactNode; danger?: boolean; children: ReactNode }) {
  return (
    <div
      className={
        danger
          ? "flex min-h-7 items-center justify-between gap-2 text-[0.8125rem] text-v2-danger"
          : "flex min-h-7 items-center justify-between gap-2 text-[0.8125rem] text-v2-fg-secondary"
      }
    >
      <span className="min-w-0">{label}</span>
      {children}
    </div>
  );
}

// The off stage that yields the currency most cheaply, so one tap makes it obtainable again.
function bestDisabledStageFor(plan: EventShopPlanContext, uid: string) {
  let best: { stage: EventShopPlanContext["stages"][number]; perAp: number } | null = null;
  for (const stage of normalStages(plan)) {
    if (plan.state.enabledStages[stage.uid]) continue;
    const amount = stage.rewards
      .filter(({ item, rewardRequirement }) => item?.uid === uid && !rewardRequirement)
      .reduce((sum, { amount }) => sum + amount, 0);
    if (amount <= 0 || stage.entryAp <= 0) continue;
    const perAp = amount / stage.entryAp;
    if (!best || perAp > best.perAp) best = { stage, perAp };
  }
  return best?.stage ?? null;
}

type CollectedReward = {
  type: ResourceTypeEnum;
  uid: string;
  name: string;
  imageUrl?: string | null;
  rarity?: number;
  quantity: number;
};

// Everything the plan ends up with: shop purchases plus the minigame's expected rewards.
export function ShopFinalRewardsSection({ plan }: { plan: EventShopPlanContext }) {
  const collected = new Map<string, CollectedReward>();
  const add = (reward: CollectedReward) => {
    const key = `${reward.type}:${reward.uid}`;
    const previous = collected.get(key);
    collected.set(key, { ...reward, quantity: (previous?.quantity ?? 0) + reward.quantity });
  };
  for (const { resource, totalQuantity } of calculateBoughtResourceQuantities(
    plan.shopResources,
    plan.state.itemQuantities,
    plan.state.itemPurchaseDays,
  )) {
    add({
      type: resource.type,
      uid: resource.uid,
      name: resource.name,
      imageUrl: resource.imageUrl,
      rarity: resource.rarity,
      quantity: totalQuantity,
    });
  }
  const gameRewards =
    plan.state.minigamePlayCount > 0
      ? (plan.minigameRewards ??
        (plan.minigameConfig
          ? calculateMinigameRewards(plan.minigameConfig, plan.state.minigamePlayCount, plan.state.minigameStartRound)
          : []))
      : [];
  for (const reward of gameRewards) {
    add({
      type: reward.resourceType,
      uid: reward.resourceUid,
      name: reward.resourceName ?? cardFlipLocale.resourceNameUnavailable,
      imageUrl: reward.imageUrl,
      rarity: reward.rarity,
      quantity: reward.quantity,
    });
  }
  if (collected.size === 0) return null;
  return (
    <ShopSection id="reward-overview-title" region="reward-overview">
      <ShopSectionHeader id="reward-overview-title" title="최종 획득 재화" />
      <div className="flex flex-wrap items-start gap-2">
        {[...collected.values()].map((reward) => (
          <ResourceThumb
            key={`${reward.type}:${reward.uid}`}
            itemUid={reward.uid}
            resourceType={reward.type}
            name={reward.name}
            imageUrl={reward.imageUrl ?? undefined}
            rarity={reward.rarity}
            size="md"
            quantity={reward.quantity}
            tooltip
          />
        ))}
      </div>
    </ShopSection>
  );
}
