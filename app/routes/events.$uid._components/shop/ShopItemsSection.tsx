import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { UserIcon as UserOutlineIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useRef, useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Popover } from "~/components/v2/primitives/Popover";
import {
  calculateEffectiveShopPurchaseCount,
  getShopResourcePurchaseDaysLimit,
  isDailyResetShopResource,
} from "~/domain/event-shop/calculations";
import { resourceCountLabel } from "~/domain/event-shop/utils";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { CurrencyIcon, formatCount, ShopSection, ShopSectionHeader } from "./shop-ui";

type ShopItem = EventShopPlanContext["shopResources"][number];

const noFavorite = { visible: false, icon: "unfavorited" as const, countText: null, accessibleName: "관심 학생" };

// Under 40rem of section width (the `items` container), tiles use the compact layout: a centered icon, a stepper
// without the min and max ends, and a row of min and max buttons under it.

export function ShopItemsSection({ plan }: { plan: EventShopPlanContext }) {
  const paymentResources = plan.collectableResources.filter(({ forPayment }) => forPayment);
  const [currencyUid, setCurrencyUid] = useState(paymentResources[0]?.uid ?? "");
  const activeCurrencyUid = paymentResources.some(({ uid }) => uid === currencyUid)
    ? currencyUid
    : (paymentResources[0]?.uid ?? "");
  const visibleItems = plan.shopResources.filter(
    (item) =>
      item.paymentResource.uid === activeCurrencyUid ||
      item.purchaseTiers.some((tier) => tier.paymentResource.uid === activeCurrencyUid),
  );
  const hasSelection = visibleItems.some(
    ({ uid }) => (plan.state.itemQuantities[uid] ?? 0) > 0 || (plan.state.itemPurchaseDays[uid] ?? 0) > 0,
  );

  return (
    <ShopSection id="shop-items-title" region="shop-items">
      <ShopSectionHeader
        id="shop-items-title"
        title="상점 아이템"
        actions={
          <>
            <Button size="sm" onClick={() => setVisibleShopResources(visibleItems, true, plan)}>
              모두 최대
            </Button>
            <Button
              size="sm"
              variant="danger-subtle"
              disabled={!hasSelection}
              onClick={() => resetVisibleShopResources(visibleItems, plan)}
            >
              초기화
            </Button>
          </>
        }
      />
      <div className="@container/items flex flex-col gap-4">
        {paymentResources.length > 1 ? (
          <div
            role="tablist"
            aria-label="상점 결제 재화"
            className="flex gap-6 overflow-x-auto border-b border-v2-divider [scrollbar-width:none]"
          >
            {paymentResources.map((resource) => {
              const selected = resource.uid === activeCurrencyUid;
              return (
                <button
                  key={resource.uid}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setCurrencyUid(resource.uid)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2 pt-2 pb-2.5 whitespace-nowrap",
                    selected
                      ? "text-v2-fg shadow-[inset_0_-2px_0_var(--color-v2-fg)]"
                      : "text-v2-fg-tertiary hover:text-v2-fg",
                    v2FocusRing,
                  )}
                >
                  <CurrencyIcon uid={resource.uid} type={resource.type} imageUrl={resource.imageUrl} />
                  <span className={cn("text-sm", selected ? "font-semibold" : "font-medium")}>{resource.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div role={paymentResources.length > 1 ? "tabpanel" : undefined} className="grid grid-cols-4 gap-2">
          {visibleItems.map((item) => (
            <ShopItemTile key={item.uid} item={item} plan={plan} />
          ))}
        </div>
      </div>
    </ShopSection>
  );
}

function ShopItemTile({ item, plan }: { item: ShopItem; plan: EventShopPlanContext }) {
  const daily = isDailyResetShopResource(item);
  const quantity = plan.state.itemQuantities[item.uid] ?? 0;
  const days = plan.state.itemPurchaseDays[item.uid] ?? 0;
  const maxDays = getShopResourcePurchaseDaysLimit(plan.eventUid, item.uid, plan.availablePurchaseDays);
  const maxQuantity = item.shopAmount ?? undefined;
  const owned = plan.ownedQuantities?.[item.uid];
  const students = item.resource.type === ResourceTypeEnum.Furniture ? (item.resource.interactionStudents ?? []) : [];
  const amountLabel = item.resourceAmount === 1 ? undefined : resourceCountLabel(item.resourceAmount);
  const label =
    students.length > 0 ? (
      <>
        <UserOutlineIcon className="size-3" aria-hidden="true" />
        {amountLabel}
      </>
    ) : (
      amountLabel
    );
  const name = item.resource.name;
  const thumb =
    students.length > 0 ? (
      <FurnitureThumb item={item} students={students} label={label} />
    ) : (
      <ResourceThumb
        itemUid={item.resource.uid}
        resourceType={item.resource.type}
        name={name}
        imageUrl={item.resource.imageUrl ?? undefined}
        rarity={item.resource.rarity}
        size="tile"
        label={label}
        tooltip
      />
    );
  const ownedLine =
    owned !== undefined && owned !== 0 ? <span className="tabular-nums">보유 {formatCount(owned)}</span> : null;

  return (
    <article
      aria-label={name}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg bg-v2-surface p-2 @min-[40rem]/items:p-3",
        quantity === 0 && "[&_input]:text-v2-fg-disabled",
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-1.5",
          `@min-[40rem]/items:flex-row @min-[40rem]/items:items-center @min-[40rem]/items:gap-2.5`,
        )}
      >
        {thumb}
        <div
          className={cn(
            "flex min-w-0 grow flex-col items-center text-center text-[0.625rem] leading-4 text-v2-fg-tertiary",
            `@min-[40rem]/items:text-xs @min-[40rem]/items:leading-[1.15rem]`,
          )}
        >
          <ItemPrice item={item} />
          {daily ? (
            <span>
              매일 초기화 · 하루 {item.shopAmount === null ? "제한 없음" : `${formatCount(item.shopAmount)}회`}
            </span>
          ) : item.shopAmount === null ? (
            <span>
              <span className={`@min-[40rem]/items:hidden`}>제한 없음</span>
              <span className={`hidden @min-[40rem]/items:inline`}>구매 제한 없음</span>
            </span>
          ) : (
            <span className="tabular-nums">최대 {formatCount(item.shopAmount)}회</span>
          )}
          {ownedLine}
        </div>
      </div>
      {daily ? (
        <div className="mt-auto flex flex-col gap-1.5 text-xs text-v2-fg-secondary">
          <DailyStepper
            label="하루 구매량"
            ariaLabel={`${name} 하루 구매량`}
            value={quantity}
            max={maxQuantity}
            onChange={(value) => plan.actions.updateItemQuantity(item.uid, value)}
          />
          <DailyStepper
            label="구매 일수"
            ariaLabel={`${name} 구매 일수`}
            value={days}
            max={maxDays}
            onChange={(value) => plan.actions.updateItemPurchaseDay(item.uid, value)}
          />
          <TierSummary item={item} total={calculateEffectiveShopPurchaseCount(item, quantity, days)} />
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-1.5">
          <NumberInput
            grouped
            aria-label={`${name} 구매량`}
            value={quantity}
            min={0}
            max={maxQuantity}
            showMax={maxQuantity !== undefined}
            className={cn(
              "w-full",
              // The compact tile moves the min and max ends to their own row below.
              "[&>button:first-of-type]:hidden @min-[40rem]/items:[&>button:first-of-type]:flex",
              maxQuantity !== undefined &&
                "[&>button:last-of-type]:hidden @min-[40rem]/items:[&>button:last-of-type]:flex",
            )}
            onValueChange={(value) => plan.actions.updateItemQuantity(item.uid, value)}
          />
          <div className={cn("grid grid-cols-2 gap-1", `@min-[40rem]/items:hidden`)}>
            <Button
              size="sm"
              className="min-h-6 px-1"
              aria-label={`${name} 구매량 최소`}
              onClick={() => plan.actions.updateItemQuantity(item.uid, 0)}
            >
              최소
            </Button>
            <Button
              size="sm"
              className="min-h-6 px-1"
              aria-label={`${name} 구매량 최대`}
              disabled={maxQuantity === undefined}
              onClick={() => maxQuantity !== undefined && plan.actions.updateItemQuantity(item.uid, maxQuantity)}
            >
              최대
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function DailyStepper({
  label,
  ariaLabel,
  value,
  max,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  max: number | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        `@min-[40rem]/items:flex-row @min-[40rem]/items:items-center @min-[40rem]/items:justify-between`,
      )}
    >
      <span className="shrink-0">{label}</span>
      <NumberInput
        grouped
        aria-label={ariaLabel}
        value={value}
        min={0}
        max={max}
        showMin={false}
        showMax={false}
        className={cn("w-full", `@min-[40rem]/items:w-[6.25rem]`, value === 0 && "[&_input]:text-v2-fg-disabled")}
        onValueChange={onChange}
      />
    </div>
  );
}

// Price: one amount, or the tier amounts with their currencies when the price steps up.
function ItemPrice({ item }: { item: ShopItem }) {
  const tiers = [...item.purchaseTiers].sort((a, b) => a.startQuantity - b.startQuantity || a.tierIndex - b.tierIndex);
  const uniform = tiers.every(
    (tier) => tier.unitPrice === tiers[0]?.unitPrice && tier.paymentResource.uid === tiers[0]?.paymentResource.uid,
  );
  const priceClassName = cn(
    "flex items-center gap-0.5 text-xs font-bold text-v2-fg tabular-nums",
    `@min-[40rem]/items:gap-1 @min-[40rem]/items:text-[0.9375rem] @min-[40rem]/items:leading-5`,
  );
  if (tiers.length === 0) {
    return <span className="text-v2-danger">가격 정보 없음</span>;
  }
  if (uniform) {
    const tier = tiers[0];
    return (
      <span className={priceClassName}>
        <CurrencyIcon
          uid={tier.paymentResource.uid}
          type={tier.paymentResource.type}
          imageUrl={tier.paymentResource.imageUrl}
          name={tier.paymentResource.name}
        />
        {formatCount(tier.unitPrice)}
      </span>
    );
  }
  return (
    <span className={cn(priceClassName, "flex-wrap justify-center")}>
      {tiers.map((tier, index) => (
        <span key={tier.tierIndex} className="inline-flex items-center gap-0.5">
          {index > 0 ? <ArrowRightIcon className="size-3.5 text-v2-fg-secondary" aria-label="다음 단계" /> : null}
          <CurrencyIcon
            uid={tier.paymentResource.uid}
            type={tier.paymentResource.type}
            imageUrl={tier.paymentResource.imageUrl}
            name={tier.paymentResource.name}
          />
          {formatCount(tier.unitPrice)}
        </span>
      ))}
    </span>
  );
}

// The daily total, and the purchase number where each price tier applies.
function TierSummary({ item, total }: { item: ShopItem; total: number }) {
  const tiers = [...item.purchaseTiers].sort((a, b) => a.startQuantity - b.startQuantity || a.tierIndex - b.tierIndex);
  const parts: ReactNode[] = tiers.map((tier, index) => {
    const start = Math.max(1, tier.startQuantity);
    const end = tier.quantity === null ? null : start + tier.quantity - 1;
    const icon = (
      <CurrencyIcon
        uid={tier.paymentResource.uid}
        type={tier.paymentResource.type}
        imageUrl={tier.paymentResource.imageUrl}
        name={tier.paymentResource.name}
        size="sm"
      />
    );
    const range =
      index === 0 && end !== null
        ? `${formatCount(end)}회째까지`
        : end === null || index === tiers.length - 1
          ? `${formatCount(start)}회째부터`
          : `${formatCount(start)}~${formatCount(end)}회째`;
    return (
      <span key={tier.tierIndex} className="inline-flex items-center gap-1 whitespace-nowrap">
        ·{icon}
        {range}
      </span>
    );
  });
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-4 text-v2-fg-tertiary tabular-nums">
      <span>합계 {formatCount(total)}회</span>
      {parts}
    </p>
  );
}

function FurnitureThumb({
  item,
  students,
  label,
}: {
  item: ShopItem;
  students: NonNullable<ShopItem["resource"]["interactionStudents"]>;
  label: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${item.resource.name} 상호작용 학생 보기`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn("shrink-0 rounded-md", v2FocusRing)}
      >
        <ResourceThumb
          itemUid={item.resource.uid}
          resourceType={item.resource.type}
          name={item.resource.name}
          imageUrl={item.resource.imageUrl ?? undefined}
          rarity={item.resource.rarity}
          size="tile"
          label={label}
          tooltip
        />
      </button>
      <Popover
        open={open}
        label={`${item.resource.name} 상호작용 학생`}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-72 p-3"
      >
        <p className="mb-2 text-sm font-medium text-v2-fg">상호작용 학생</p>
        <div className="grid grid-cols-4 gap-v2-block-gap">
          {students.map((student) => (
            <StudentThumb
              key={student.uid}
              studentUid={student.uid}
              {...splitVisibleStudentName(student.name)}
              recruitmentLabel=""
              isNew={false}
              favorite={noFavorite}
              small
              showRecruitmentLabel={false}
            />
          ))}
        </div>
      </Popover>
    </>
  );
}

export function setVisibleShopResources(resources: ShopItem[], select: boolean, plan: EventShopPlanContext) {
  plan.actions.updateItemQuantities((previous) => {
    const next = { ...previous };
    for (const item of resources) {
      if (!select || item.shopAmount !== null) next[item.uid] = select ? (item.shopAmount ?? next[item.uid] ?? 0) : 0;
    }
    return next;
  });
  plan.actions.updateItemPurchaseDays((previous) => {
    const next = { ...previous };
    for (const item of resources) {
      if (isDailyResetShopResource(item))
        next[item.uid] = select
          ? getShopResourcePurchaseDaysLimit(plan.eventUid, item.uid, plan.availablePurchaseDays)
          : 0;
    }
    return next;
  });
}

function resetVisibleShopResources(resources: ShopItem[], plan: EventShopPlanContext) {
  plan.actions.updateItemQuantities((previous) => ({
    ...previous,
    ...Object.fromEntries(resources.map(({ uid }) => [uid, 0])),
  }));
  plan.actions.updateItemPurchaseDays((previous) => ({
    ...previous,
    ...Object.fromEntries(resources.map(({ uid }) => [uid, 0])),
  }));
}
