import { ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import { useRef, useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Popover } from "~/components/v2/primitives/Popover";
import { buildResourceBreakdownLines } from "~/domain/event-shop/calculations/resource-breakdown-lines";
import { calculateBoughtResourceQuantities } from "~/domain/event-shop/calculations/shop-rewards";
import { calculateMinigameRewards } from "~/domain/event-shop/utils";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { cardFlipLocale } from "~/locales/ko";
import { minigameTitle, normalStages, resultSlotState } from "./shop-model";
import { formatCount, ShopSection, ShopSectionHeader } from "./shop-ui";

// Per currency, as the calculator showed it before the rebuild: what the plan needs and gets with their sources, then
// what remains or lacks, and the owned and target counts edited from buttons under each card.
export function ShopBalanceSection({ plan }: { plan: EventShopPlanContext }) {
  if (plan.collectableResources.length === 0) return null;
  return (
    <ShopSection id="currency-balance-title" region="currency-balance">
      <ShopSectionHeader
        id="currency-balance-title"
        title="재화 계산 결과"
        description="선택한 아이템을 모두 얻기 위해 필요한 재화 계산 결과예요. 목표 개수를 직접 입력해 추가 소탕 필요량을 계산할 수 있어요."
      />
      <div className="@container">
        <div className="grid grid-cols-1 gap-2 @min-[40rem]:grid-cols-2">
          {plan.collectableResources.map((resource) => (
            <BalanceCard key={`${resource.type}:${resource.uid}`} plan={plan} resource={resource} />
          ))}
        </div>
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
  const uid = resource.uid;
  const minigame = plan.minigameConfig ? minigameTitle(plan.minigameConfig.minigameType) : "미니게임";
  const lines = buildResourceBreakdownLines(
    plan.stageCalculations.itemBreakdown,
    uid,
    plan.state.overriddenRequiredQuantities,
    { minigameRequired: minigame, minigameAcquired: `${minigame} 기대 보상` },
  );
  // The owned count is the player's input, so it reads the state right away rather than the debounced calculation.
  const owned = plan.state.existingPaymentItemQuantities[uid] ?? 0;
  const override = plan.state.overriddenRequiredQuantities[uid];
  // While the calculation waits, fails, or cannot run, the breakdown holds no result for this plan. Its zeros must not
  // read as "enough".
  const slot = resultSlotState(plan);
  const settled = slot.kind === "ready" || slot.kind === "empty";
  const recalculating = settled && plan.isCalculating;
  const required = override ?? Math.ceil(lines.requiredSubtotal);
  const remaining = Math.floor(lines.remaining);
  const unobtainable = (plan.stageCalculations.unobtainableTargets[uid] ?? 0) > 0;
  const fixStage = unobtainable ? bestDisabledStageFor(plan, uid) : null;
  const unsettledLabel = slot.kind === "failed" ? "계산 실패" : slot.kind === "blocked" ? "계산 불가" : "계산 중";

  return (
    <article className="flex h-full min-w-0 flex-col rounded-lg bg-v2-surface p-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ResourceThumb
          itemUid={uid}
          resourceType={resource.type}
          name={resource.name}
          imageUrl={resource.imageUrl ?? undefined}
          rarity={1}
          size="md"
          tooltip
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
          <div className={cn(recalculating && "opacity-50")}>
            <BalanceHead label="필요 개수" value={override !== undefined || settled ? formatCount(required) : "—"} />
            {override !== undefined ? (
              <BreakdownList lines={[{ label: "입력한 목표 개수", value: null }]} />
            ) : settled ? (
              <BreakdownList lines={lines.requiredLines} round={Math.ceil} />
            ) : null}
          </div>
          <div className={cn(recalculating && "opacity-50")}>
            <BalanceHead label="획득 개수" value={settled ? formatCount(Math.floor(lines.acquiredSubtotal)) : "—"} />
            {settled ? <BreakdownList lines={lines.acquiredLines} /> : null}
          </div>
          {settled && unobtainable ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.8125rem] text-v2-danger">
              <span className="inline-flex items-center gap-1">
                <ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                획득할 수 없는 재화가 있어요
              </span>
              {fixStage ? (
                <Button size="sm" onClick={() => plan.actions.toggleStage(fixStage.uid, true)}>
                  스테이지 {fixStage.index} 추가
                </Button>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              "flex items-center justify-between gap-2 border-t border-v2-divider pt-2",
              recalculating && "opacity-50",
            )}
          >
            {settled ? (
              <>
                <span className="font-medium text-v2-fg">{remaining >= 0 ? "남은 개수" : "부족 개수"}</span>
                <span className={cn("font-bold tabular-nums", remaining >= 0 ? "text-v2-success" : "text-v2-danger")}>
                  {formatCount(Math.abs(remaining))}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-v2-fg">남은 개수</span>
                <span className="text-v2-fg-tertiary">{unsettledLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-3">
        <EditableQuantity
          label={`${resource.name} 보유 개수`}
          buttonLabel="보유 개수 입력"
          value={owned}
          onSave={(value) => plan.actions.updateExistingQuantity(uid, value)}
          onReset={owned > 0 ? () => plan.actions.updateExistingQuantity(uid, 0) : undefined}
        />
        <EditableQuantity
          label={`${resource.name} 목표 개수`}
          buttonLabel="목표 개수 입력"
          value={required}
          // Before the calculation settles, the computed target is a placeholder zero that must not seed an override.
          disabled={!settled && override === undefined}
          onSave={(value) => plan.actions.updateOverriddenRequired(uid, value)}
          onReset={override !== undefined ? () => plan.actions.resetOverriddenRequired(uid) : undefined}
        />
      </div>
    </article>
  );
}

function BalanceHead({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-v2-fg">{label}</span>
      <span className="font-semibold tabular-nums text-v2-fg">{value}</span>
    </div>
  );
}

function BreakdownList({
  lines,
  round = Math.floor,
}: {
  lines: { label: string; value: number | null }[];
  round?: (value: number) => number;
}) {
  return (
    <ul className="mt-1 flex flex-col gap-1 pl-2 text-xs text-v2-fg-tertiary">
      {lines.length === 0 ? (
        <li>· 획득처 없음</li>
      ) : (
        lines.map(({ label, value }) => (
          <li key={label} className="flex items-center justify-between gap-2">
            <span>· {label}</span>
            {value === null ? null : <span className="tabular-nums">{formatCount(round(value))}</span>}
          </li>
        ))
      )}
    </ul>
  );
}

// A button that opens a popover with a number field; the value applies on save, and a reset clears what was entered.
function EditableQuantity({
  label,
  buttonLabel,
  value,
  disabled = false,
  onSave,
  onReset,
}: {
  label: string;
  buttonLabel: string;
  value: number;
  disabled?: boolean;
  onSave: (value: number) => void;
  onReset?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(value);
  // The popover returns focus only on Escape, so its own buttons hand focus back to the trigger they unmount from.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label} 입력`}
        disabled={disabled}
        onClick={() => {
          setEditValue(value);
          setOpen(true);
        }}
        className={v2ButtonClassName({ size: "sm" })}
      >
        {buttonLabel}
      </button>
      <Popover
        open={open}
        label={label}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-72"
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(editValue);
            close();
          }}
        >
          <p className="text-sm text-v2-fg-secondary">{label}</p>
          <NumberInput
            grouped
            aria-label={label}
            value={editValue}
            min={0}
            showMax={false}
            className="w-full"
            onValueChange={setEditValue}
          />
          <div className="flex justify-between gap-2">
            {onReset ? (
              <Button
                size="sm"
                variant="danger-subtle"
                onClick={() => {
                  onReset();
                  close();
                }}
              >
                초기화
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={close}>
                취소
              </Button>
              <Button size="sm" type="submit" variant="primary">
                저장
              </Button>
            </div>
          </div>
        </form>
      </Popover>
    </>
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
