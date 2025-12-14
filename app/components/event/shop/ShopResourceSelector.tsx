import { useMemo, useState, memo } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ResourceCard } from "~/components/atoms/item";
import { Button, NumberInput } from "~/components/atoms/form";
import { formatResourceAmount } from "~/locales/ko";
import { Tabs } from "./Tabs";
import type { ShopResource, CollectableResource } from "./types";
import { Section } from "~/components/ui";

type ShopResourceSelectorProps = {
  shopResources: ShopResource[];
  collectableResources: CollectableResource[];
  itemQuantities: Record<string, number>;
  setItemQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  paymentItemQuantities: Record<string, number>;
  existingPaymentItemQuantities: Record<string, number>;
  setExistingPaymentItemQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
};

export const ShopResourceSelector = memo(function ShopResourceSelector({
  shopResources, collectableResources, itemQuantities, setItemQuantities, paymentItemQuantities,
  existingPaymentItemQuantities, setExistingPaymentItemQuantities,
}: ShopResourceSelectorProps) {
  const [selectedPaymentResourceUid, setSelectedPaymentResourceUid] = useState<string>(collectableResources.find(({ forPayment }) => forPayment)?.uid ?? "");
  const selectedShopResources = useMemo(() => {
    return shopResources.filter(({ paymentResource }) => paymentResource.uid === selectedPaymentResourceUid);
  }, [shopResources, selectedPaymentResourceUid]);

  const handleSetMinQuantity = (uid: string) => {
    setItemQuantities(prev => ({ ...prev, [uid]: 0 }));
  };

  const handleSetMaxQuantity = (uid: string, shopAmount: number | null) => {
    if (shopAmount) {
      setItemQuantities(prev => ({ ...prev, [uid]: shopAmount }));
    }
  };

  const handleQuantityChange = (uid: string, value: number) => {
    setItemQuantities(prev => ({ ...prev, [uid]: value }));
  };

  const handleSelectAll = () => {
    setItemQuantities((prev) => {
      const newQuantities = { ...prev };
      selectedShopResources.forEach(({ uid, shopAmount }) => {
        if (shopAmount !== null) {
          newQuantities[uid] = shopAmount;
        }
      });
      return newQuantities;
    });
  };

  const handleResetAll = () => {
    setItemQuantities((prev) => {
      const newQuantities = { ...prev };
      selectedShopResources.forEach(({ uid }) => {
        newQuantities[uid] = 0;
      });
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
          const quantity = itemQuantities[uid] || 0;

          const formattedResourceAmount = formatResourceAmount(resourceAmount);
          return (
            <div key={uid} className="px-2 py-3 flex flex-col gap-2 bg-neutral-100 dark:bg-neutral-900 rounded-lg">
              <div className="flex items-center justify-center gap-x-1">
                <ResourceCard itemUid={resource.uid} resourceType={resource.type} rarity={resource.rarity} label={resourceAmount === 1 ? undefined : formattedResourceAmount} />
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

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSetMinQuantity(uid)}
                  disabled={quantity === 0}
                  className="shrink-0 h-full px-1.5 text-xs bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded transition-colors disabled:bg-neutral-300 dark:disabled:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  최소
                </button>
                <div className="grow">
                  <NumberInput value={quantity} maxValue={shopAmount ?? undefined} onChange={(value) => handleQuantityChange(uid, value)} />
                </div>
                {shopAmount && (
                  <button
                    onClick={() => handleSetMaxQuantity(uid, shopAmount)}
                    disabled={quantity >= shopAmount}
                    className="shrink-0 h-full px-1.5 text-xs bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded transition-colors disabled:bg-neutral-300 dark:disabled:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    최대
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-2 flex justify-end gap-0.5">
        <Button text="모두 선택" color="primary" onClick={handleSelectAll} />
        <Button text="초기화" onClick={handleResetAll} />
      </div>

      <div className="my-4">
        <div className="p-3 w-full border border-neutral-200 dark:border-neutral-700 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {collectableResources.map(({ uid }) => {
            const existing = existingPaymentItemQuantities[uid] || 0;
            const required = paymentItemQuantities[uid] || 0;
            return (
              <div key={uid} className="flex flex-col gap-2">
                <div className="flex flex-row items-center gap-2">
                  <ResourceCard itemUid={uid} resourceType={ResourceTypeEnum.Item} rarity={1} />
                  <div className="grow">
                    <p className="mb-2 text-xs text-center text-neutral-600 dark:text-neutral-400">이미 보유한 수량</p>
                    <NumberInput
                      value={existing}
                      onChange={(value) => setExistingPaymentItemQuantities(prev => ({ ...prev, [uid]: value }))}
                    />
                    <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
                      {required.toLocaleString()} 개 필요
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
});

