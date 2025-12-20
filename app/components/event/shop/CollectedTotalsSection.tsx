import { memo, useMemo } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ResourceCard } from "~/components/atoms/item";
import { formatResourceAmount } from "~/locales/ko";
import type { ShopResource } from "./types";
import { Section } from "~/components/ui";

type CollectedTotalsSectionProps = {
  breakdown: {
    fromFirstRun: Record<string, number>;
    fromRepeatedRuns: Record<string, number>;
    toBuyShopItems: Record<string, number>;
    remaining: Record<string, number>;
  };
  existingPaymentItemQuantities: Record<string, number>;
  itemQuantities: Record<string, number>;
  shopResources: ShopResource[];
  totalApWithExtras: number;
  firstClearAp: number;
  questSweepAp: number;
  extraSweepAp: number;
};

export const CollectedTotalsSection = memo(function CollectedTotalsSection({ breakdown, existingPaymentItemQuantities, itemQuantities, shopResources, totalApWithExtras, firstClearAp, questSweepAp, extraSweepAp }: CollectedTotalsSectionProps) {
  const { fromFirstRun, fromRepeatedRuns, toBuyShopItems, remaining } = breakdown;

  // Get all unique item UIDs from all categories
  const allItemUids = new Set([
    ...Object.keys(fromFirstRun),
    ...Object.keys(fromRepeatedRuns),
    ...Object.keys(toBuyShopItems),
    ...Object.keys(remaining),
  ]);

  // Get shop resources that are being bought (items exchanged with payment items)
  // Merge same resources and calculate total quantity (itemQuantities * resourceAmount)
  const mergedBoughtResources = useMemo(() => {
    const resourceMap = new Map<string, { resource: { uid: string; type: ResourceTypeEnum; rarity: number }; totalQuantity: number }>();
    
    shopResources.forEach(({ uid, resource, resourceAmount }) => {
      const shopItemQuantity = itemQuantities[uid] || 0;
      if (shopItemQuantity > 0) {
        const resourceKey = `${resource.type}:${resource.uid}`;
        const totalQuantity = shopItemQuantity * resourceAmount;
        
        if (resourceMap.has(resourceKey)) {
          const existing = resourceMap.get(resourceKey)!;
          existing.totalQuantity += totalQuantity;
        } else {
          resourceMap.set(resourceKey, {
            resource: {
              uid: resource.uid,
              type: resource.type,
              rarity: resource.rarity,
            },
            totalQuantity,
          });
        }
      }
    });
    
    return Array.from(resourceMap.values());
  }, [shopResources, itemQuantities]);

  return (
    <>
      <Section
        title="최종 결과"
        description="필요한 AP와 아이템 수량을 확인할 수 있어요"
        foldable={false}
        defaultExpanded={true}
      >
        {totalApWithExtras > 0 && (
          <div className="my-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-teal-950 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex justify-between items-center mb-3 pb-1.5 border-b border-green-200 dark:border-green-800">
              <h3 className="text-base font-semibold text-green-800 dark:text-green-200">필요한 AP</h3>
              <span className="text-xl font-bold text-green-700 dark:text-green-300">{totalApWithExtras.toLocaleString()}</span>
            </div>
            <div className="space-y-1.5">
              {firstClearAp > 0 && (
                <div className="flex justify-between text-sm text-green-700 dark:text-green-300">
                  <span>스토리/퀘스트 초회</span>
                  <span>{firstClearAp.toLocaleString()}</span>
                </div>
              )}
              {questSweepAp > 0 && (
                <div className="flex justify-between text-sm text-green-700 dark:text-green-300">
                  <span>퀘스트 소탕</span>
                  <span>{questSweepAp.toLocaleString()}</span>
                </div>
              )}
              {extraSweepAp > 0 && (
                <div className="flex justify-between text-sm text-green-700 dark:text-green-300">
                  <span>추가 소탕</span>
                  <span>{extraSweepAp.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4">
          {allItemUids.size === 0 && (
            <p className="w-full py-8 text-neutral-500 dark:text-neutral-400 text-center col-span-2 text-sm">
              구매할 아이템과 스테이지를 선택하세요
            </p>
          )}
          {Array.from(allItemUids).map((itemUid) => {
            const firstRunCount = fromFirstRun[itemUid] || 0;
            const repeatedRunsCount = fromRepeatedRuns[itemUid] || 0;
            const toBuyCount = toBuyShopItems[itemUid] || 0;
            const existingCount = existingPaymentItemQuantities[itemUid] || 0;
            // Note: toBuyCount = required - existing (from paymentItemQuantities calculation)
            // So remainingCount = collected - required + existing = collected - toBuyCount + existing
            const remainingCount = firstRunCount + repeatedRunsCount + existingCount - toBuyCount;

            return (
              <div key={itemUid} className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg flex items-start gap-2">
                <ResourceCard itemUid={itemUid} resourceType={ResourceTypeEnum.Item} rarity={1} />
                <div className="grow space-y-1.5 text-sm">
                  <div className="flex justify-between items-center pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">{remainingCount > 0 ? "남은" : "부족"} 수량</span>
                    <span className={`font-bold ${remainingCount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{remainingCount.toLocaleString()}</span>
                  </div>
                  {existingCount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-600 dark:text-neutral-400">기존 보유</span>
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{existingCount.toLocaleString()}</span>
                    </div>
                  )}
                  {firstRunCount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-600 dark:text-neutral-400">스토리 / 초회 보상</span>
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{firstRunCount.toLocaleString()}</span>
                    </div>
                  )}
                  {repeatedRunsCount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-600 dark:text-neutral-400">퀘스트 소탕</span>
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{repeatedRunsCount.toLocaleString()}</span>
                    </div>
                  )}
                  {toBuyCount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-600 dark:text-neutral-400">상점 구매</span>
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">-{toBuyCount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {mergedBoughtResources.length > 0 && (
          <div className="my-4 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg flex flex-wrap gap-3">
            {mergedBoughtResources.map(({ resource, totalQuantity }) => (
              <ResourceCard key={`${resource.type}:${resource.uid}`} itemUid={resource.uid} resourceType={resource.type} rarity={resource.rarity} label={formatResourceAmount(totalQuantity)} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
});

