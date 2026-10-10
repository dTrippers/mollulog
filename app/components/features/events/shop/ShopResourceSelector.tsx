import { UserIcon } from "@heroicons/react/24/outline";
import { memo, useMemo, useState } from "react";
import FurnitureInteractionStudentsPopover, {
  FurnitureInteractionStudentsPopoverGroup,
} from "~/components/features/furniture/FurnitureInteractionStudentsPopover";
import { Button, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { CollectableResource, ShopResource } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { formatResourceAmount } from "~/locales/ko";
import { resourceImageUrl } from "~/models/assets";
import {
  calculateEffectiveShopPurchaseCount,
  getShopResourcePurchaseDaysLimit,
  isDailyResetShopResource,
} from "./calculations";
import type { ShopActions, ShopState } from "./hooks";
import { Tabs } from "./Tabs";

type ShopResourceSelectorProps = {
  shopResources: ShopResource[];
  ownedQuantities: Record<string, number> | null;
  collectableResources: CollectableResource[];
  eventUid: string;
  state: ShopState;
  actions: ShopActions;
  availablePurchaseDays: number;
};

function formatUnitPriceLabel(purchaseTiers: ShopResource["purchaseTiers"]) {
  const unitPrices = [...new Set(purchaseTiers.map(({ unitPrice }) => unitPrice))];
  if (unitPrices.length === 0) {
    return "-";
  }
  if (unitPrices.length === 1) {
    return unitPrices[0].toLocaleString();
  }
  return `${Math.min(...unitPrices).toLocaleString()}~${Math.max(...unitPrices).toLocaleString()}`;
}

export const ShopResourceSelector = memo(function ShopResourceSelector({
  shopResources,
  ownedQuantities,
  collectableResources,
  eventUid,
  state,
  actions,
  availablePurchaseDays,
}: ShopResourceSelectorProps) {
  const [selectedPaymentResourceUid, setSelectedPaymentResourceUid] = useState<string>(
    collectableResources.find(({ forPayment }) => forPayment)?.uid ?? "",
  );
  const selectedShopResources = useMemo(() => {
    return shopResources.filter(
      ({ paymentResource, purchaseTiers }) =>
        paymentResource.uid === selectedPaymentResourceUid ||
        purchaseTiers.some((tier) => tier.paymentResource.uid === selectedPaymentResourceUid),
    );
  }, [shopResources, selectedPaymentResourceUid]);

  const handleSelectAll = () => {
    actions.updateItemQuantities((prev) => {
      const newQuantities = { ...prev };
      for (const { uid, shopAmount } of selectedShopResources) {
        if (shopAmount !== null) {
          newQuantities[uid] = shopAmount;
        }
      }
      return newQuantities;
    });
    actions.updateItemPurchaseDays((prev) => {
      const newPurchaseDays = { ...prev };
      for (const shopResource of selectedShopResources) {
        if (isDailyResetShopResource(shopResource)) {
          newPurchaseDays[shopResource.uid] = getShopResourcePurchaseDaysLimit(
            eventUid,
            shopResource.uid,
            availablePurchaseDays,
          );
        }
      }
      return newPurchaseDays;
    });
  };

  const handleResetAll = () => {
    actions.updateItemQuantities((prev) => {
      const newQuantities = { ...prev };
      for (const { uid } of selectedShopResources) {
        newQuantities[uid] = 0;
      }
      return newQuantities;
    });
    actions.updateItemPurchaseDays((prev) => {
      const newPurchaseDays = { ...prev };
      for (const shopResource of selectedShopResources) {
        if (isDailyResetShopResource(shopResource)) {
          newPurchaseDays[shopResource.uid] = 0;
        }
      }
      return newPurchaseDays;
    });
  };

  return (
    <Section
      title="상점 아이템"
      description="구매할 아이템의 개수를 선택하세요"
      collapsible
      persistenceKey="event-shop-section::shop-resource-selector"
      defaultExpanded={true}
    >
      <Tabs
        tabs={collectableResources
          .filter(({ forPayment }) => forPayment)
          .map((resource) => ({
            tabId: resource.uid,
            name: resource.name,
            imageUrl: getEventResourceImageUrl(resource),
          }))}
        activeTabId={selectedPaymentResourceUid}
        setActiveTabId={setSelectedPaymentResourceUid}
      />

      <FurnitureInteractionStudentsPopoverGroup>
        <div className="grid grid-cols-2 gap-1.5 md:gap-2 lg:grid-cols-3 2xl:grid-cols-4">
          {selectedShopResources.map(
            ({ uid, resource, resourceAmount, paymentResource, purchaseTiers, shopAmount }) => {
              const shopResource = { uid, resource, resourceAmount, paymentResource, purchaseTiers, shopAmount };
              const quantity = state.itemQuantities[uid] || 0;
              const purchaseDays = state.itemPurchaseDays[uid] || 0;
              const dailyReset = isDailyResetShopResource(shopResource);
              const purchaseDaysLimit = getShopResourcePurchaseDaysLimit(eventUid, uid, availablePurchaseDays);
              const totalPurchaseCount = calculateEffectiveShopPurchaseCount(shopResource, quantity, purchaseDays);
              const paymentImageUrl = getEventResourceImageUrl(paymentResource);

              const unitPriceLabel = formatUnitPriceLabel(purchaseTiers);
              const [minimumUnitPrice, maximumUnitPrice] = unitPriceLabel.split("~");
              const ownedQuantity = ownedQuantities?.[uid];
              return (
                <div key={uid} className="flex flex-col gap-2 rounded-md bg-card p-3">
                  <div className="flex items-center gap-2">
                    <ShopItemResourceCard resource={resource} resourceAmount={resourceAmount} />
                    <div className="flex min-w-0 grow flex-col items-center gap-0.5 text-center">
                      <div className="flex w-full min-w-0 items-center justify-center gap-1">
                        {paymentImageUrl ? (
                          <img
                            alt={paymentResource.name}
                            src={paymentImageUrl}
                            className="-m-1 size-6 shrink-0 object-contain md:size-8"
                            loading="lazy"
                          />
                        ) : (
                          <span role="img" aria-label={`${paymentResource.name} 이미지 없음`} className="text-xs">
                            이미지 없음
                          </span>
                        )}
                        <span className="min-w-0 text-center text-sm font-medium leading-tight tabular-nums text-foreground">
                          {maximumUnitPrice !== undefined ? (
                            <>
                              {minimumUnitPrice}~<wbr />
                              {maximumUnitPrice}
                            </>
                          ) : (
                            unitPriceLabel
                          )}
                        </span>
                      </div>
                      <p className="break-keep text-xs leading-tight text-muted-foreground">
                        {shopAmount ? `${dailyReset ? "매일 " : ""}${shopAmount}회 구매 가능` : "구매 제한 없음"}
                      </p>
                      {ownedQuantity !== undefined && ownedQuantity !== 0 && (
                        <p className="break-keep text-xs leading-tight text-muted-foreground">
                          보유{" "}
                          <span className="whitespace-nowrap font-semibold tabular-nums text-foreground">
                            {ownedQuantity.toLocaleString()}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {dailyReset ? (
                    <div className="mt-auto space-y-1.5">
                      <div className="grid grid-cols-1 gap-1.5">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium leading-tight text-muted-foreground">하루 구매량</p>
                          <NumberInput
                            value={quantity}
                            maxValue={shopAmount ?? undefined}
                            showMin
                            showMax={shopAmount !== null}
                            onChange={(value) => actions.updateItemQuantity(uid, value)}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium leading-tight text-muted-foreground">구매 일수</p>
                          <NumberInput
                            value={purchaseDays}
                            maxValue={purchaseDaysLimit}
                            showMin
                            showMax={purchaseDaysLimit > 0}
                            onChange={(value) => actions.updateItemPurchaseDay(uid, value)}
                          />
                        </div>
                      </div>
                      <p className="text-center text-xs text-muted-foreground">
                        총 {totalPurchaseCount.toLocaleString()}회 구매
                      </p>
                    </div>
                  ) : (
                    <div className="mt-auto">
                      <NumberInput
                        value={quantity}
                        maxValue={shopAmount ?? undefined}
                        showMin
                        showMax={shopAmount !== null}
                        onChange={(value) => actions.updateItemQuantity(uid, value)}
                      />
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      </FurnitureInteractionStudentsPopoverGroup>

      <div className="my-2 flex justify-end gap-2">
        <Button text="모두 선택" variant="primary" onClick={handleSelectAll} />
        <Button text="초기화" onClick={handleResetAll} />
      </div>
    </Section>
  );
});

function ShopItemResourceCard({ resource, resourceAmount }: Pick<ShopResource, "resource" | "resourceAmount">) {
  const interactionStudents = resource.type === ResourceTypeEnum.Furniture ? resource.interactionStudents : undefined;
  const hasInteractionStudents = interactionStudents !== undefined && interactionStudents.length > 0;
  const amountLabel = resourceAmount === 1 ? undefined : formatResourceAmount(resourceAmount);
  const card = (
    <ResourceCard
      itemUid={resource.uid}
      resourceType={resource.type}
      imageUrl={resource.imageUrl ?? undefined}
      rarity={resource.rarity}
      label={
        hasInteractionStudents ? (
          <span className="flex items-center gap-0.5 py-0.5">
            <UserIcon className="size-3" aria-hidden="true" />
            {amountLabel}
          </span>
        ) : (
          amountLabel
        )
      }
      name={hasInteractionStudents ? undefined : resource.name}
    />
  );

  return hasInteractionStudents ? (
    <FurnitureInteractionStudentsPopover furnitureName={resource.name} students={interactionStudents}>
      {card}
    </FurnitureInteractionStudentsPopover>
  ) : (
    card
  );
}

function getEventResourceImageUrl(resource: CollectableResource | ShopResource["paymentResource"]): string | undefined {
  switch (resource.type) {
    case ResourceTypeEnum.Emblem:
      return resource.imageUrl ?? undefined;
    case ResourceTypeEnum.Currency:
      return resourceImageUrl("currency", resource.uid);
    case ResourceTypeEnum.Equipment:
      return resourceImageUrl("equipment", resource.uid);
    case ResourceTypeEnum.Furniture:
      return resourceImageUrl("furniture", resource.uid);
    case ResourceTypeEnum.Item:
      return resourceImageUrl("item", resource.uid);
  }
}
