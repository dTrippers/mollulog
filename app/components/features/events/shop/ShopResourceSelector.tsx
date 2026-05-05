import { useMemo, useState, memo } from "react";
import { formatResourceAmount } from "~/locales/ko";
import { Tabs } from "./Tabs";
import type { ShopResource, CollectableResource } from "./types";
import type { ShopState, ShopActions } from "./hooks";
import { Button, NumberInput, ResourceCard, Section } from "~/components/primitives";

type ShopResourceSelectorProps = {
  shopResources: ShopResource[];
  collectableResources: CollectableResource[];
  state: ShopState;
  actions: ShopActions;
};

export const ShopResourceSelector = memo(function ShopResourceSelector({
  shopResources,
  collectableResources,
  state,
  actions,
}: ShopResourceSelectorProps) {
  const [selectedPaymentResourceUid, setSelectedPaymentResourceUid] = useState<string>(collectableResources.find(({ forPayment }) => forPayment)?.uid ?? "");
  const selectedShopResources = useMemo(() => {
    return shopResources.filter(({ paymentResource }) => paymentResource.uid === selectedPaymentResourceUid);
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
  };

  const handleResetAll = () => {
    actions.updateItemQuantities((prev) => {
      const newQuantities = { ...prev };
      for (const { uid } of selectedShopResources) {
        newQuantities[uid] = 0;
      }
      return newQuantities;
    });
  };

  return (
    <Section
      title="상점 아이템"
      description="구매할 아이템의 개수를 선택하세요"
      foldable
      foldStateKey="event-shop-section::shop-resource-selector"
      defaultExpanded={true}
    >
      <Tabs
        tabs={collectableResources.filter(({ forPayment }) => forPayment).map(({ uid, name }) => ({ tabId: uid, name, imageUrl: `https://baql-assets.mollulog.net/images/items/${uid}` }))}
        activeTabId={selectedPaymentResourceUid}
        setActiveTabId={setSelectedPaymentResourceUid}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-2">
        {selectedShopResources.map(({ uid, resource, resourceAmount, paymentResource, paymentResourceAmount, shopAmount }) => {
          const quantity = state.itemQuantities[uid] || 0;

          const formattedResourceAmount = formatResourceAmount(resourceAmount);
          return (
            <div key={uid} className="p-2 flex flex-col gap-2 bg-neutral-100 dark:bg-neutral-900 rounded-lg">
              <div className="flex items-center justify-center gap-x-1">
                <ResourceCard itemUid={resource.uid} resourceType={resource.type} rarity={resource.rarity} label={resourceAmount === 1 ? undefined : formattedResourceAmount} name={resource.name} />
                <div className="grow">
                  <div className="flex items-center justify-center gap-1">
                    <img
                      alt={resource.name}
                      src={`https://baql-assets.mollulog.net/images/items/${paymentResource.uid}`}
                      className="-m-1 size-6 md:size-8 object-contain"
                      loading="lazy"
                    />
                    <span className="mr-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {paymentResourceAmount}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
                    {shopAmount ? `${shopAmount}회 구매 가능` : "구매 제한 없음"}
                  </p>
                </div>
              </div>

              <div>
                <NumberInput
                  value={quantity}
                  maxValue={shopAmount ?? undefined}
                  showMin
                  showMax={shopAmount !== null}
                  maxButtonVariant="active"
                  onChange={(value) => actions.updateItemQuantity(uid, value)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-2 flex justify-end gap-0.5">
        <Button text="모두 선택" variant="primary" onClick={handleSelectAll} />
        <Button text="초기화" onClick={handleResetAll} />
      </div>
    </Section>
  );
});
