import { memo, useMemo, useState } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ResourceCard } from "~/components/atoms/item";
import type { Stage, CollectableResource, ShopResource } from "./types";
import type { ShopState, ShopActions } from "./hooks";
import { resourceCountLabel, calculateMinigameRewards } from "./utils";
import type { MinigameConfig } from "./constants";
import { Transition } from "@headlessui/react";
import { NumberInput } from "~/components/atoms/form";
import BugReportModal from "./BugReportModal";
import type { CalculationResult } from "./hooks/useShopCalculations";

type CollectedTotalsSectionProps = {
  stages: Stage[];
  collectableResources: CollectableResource[];
  shopResources: ShopResource[];
  eventUid: string;
  minigameConfig?: MinigameConfig | null;
  state: ShopState;
  actions: ShopActions;
  stageCalculations: CalculationResult;
  signedIn: boolean;
};

type BreakdownLine = {
  label: string;
  value: number;
};

type EditPopupProps = {
  show: boolean;
  title: string;
  value: number;
  onValueChange: (value: number) => void;
  onCancel: () => void;
  onSave: () => void;
  onReset?: () => void;
  showReset?: boolean;
};

function EditPopup({ show, title, value, onValueChange, onCancel, onSave, onReset, showReset }: EditPopupProps) {
  return (
    <Transition
      show={show}
      as="div"
      enter="transition duration-200 ease-out"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition duration-100 ease-in"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
      className="absolute top-full left-0 right-0 md:left-auto md:right-0 mt-2 z-20"
      style={{ left: '-0.75rem', right: '-0.75rem' }}
    >
      <div className="bg-white/90 dark:bg-black/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-4 md:w-auto md:min-w-[280px]">
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">{title}</p>
        <div className="mb-4">
          <NumberInput value={value} onChange={onValueChange} />
        </div>
        <div className="flex justify-between items-center gap-2">
          {showReset && onReset ? (
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md transition whitespace-nowrap"
              onClick={onReset}
            >
              초기화
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap"
              onClick={onCancel}
            >
              취소
            </button>
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md transition whitespace-nowrap"
              onClick={onSave}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </Transition>
  );
}

function BreakdownLines({ lines }: { lines: BreakdownLine[] }) {
  if (lines.length === 0) {
    return <div className="text-neutral-500 dark:text-neutral-400 text-xs">획득처 없음</div>;
  }

  return (
    <>
      {lines.map(({ label, value }) => (
        <div key={label} className="flex justify-between items-center">
          <span className="text-neutral-500 dark:text-neutral-500">
            <span className="mr-1.5">·</span>{label}
          </span>
          <span className="text-neutral-500 dark:text-neutral-500">{Math.floor(value).toLocaleString()}</span>
        </div>
      ))}
    </>
  );
}

export const CollectedTotalsSection = memo(function CollectedTotalsSection({
  stages,
  collectableResources,
  shopResources,
  eventUid,
  minigameConfig,
  state,
  actions,
  stageCalculations,
  signedIn,
}: CollectedTotalsSectionProps) {
  const { itemBreakdown, totalApWithExtras, firstClearAp, questSweepAp, extraSweepAp } = stageCalculations;
  const { fromFirstRun, fromRepeatedRuns, toPlayMinigame, toBuyShopItems, fromMinigame } = itemBreakdown;

  // State for managing popup visibility per item
  const [editingItemUid, setEditingItemUid] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [editingRequiredItemUid, setEditingRequiredItemUid] = useState<string | null>(null);
  const [editRequiredValue, setEditRequiredValue] = useState<number>(0);
  const [showBugReportModal, setShowBugReportModal] = useState(false);

  const allItemUids = useMemo(
    () =>
      new Set([
        ...Object.keys(fromFirstRun),
        ...Object.keys(fromRepeatedRuns),
        ...Object.keys(toBuyShopItems),
        ...Object.keys(toPlayMinigame),
        ...Object.keys(fromMinigame),
      ]),
    [fromFirstRun, fromRepeatedRuns, toBuyShopItems, toPlayMinigame, fromMinigame],
  );

  // Get shop resources that are being bought (items exchanged with payment items)
  // Merge same resources and calculate total quantity (itemQuantities * resourceAmount)
  // Also include minigame rewards as bought resources
  const mergedBoughtResources = useMemo(() => {
    const resourceMap = new Map<
      string,
      { resource: { uid: string; type: ResourceTypeEnum; rarity: number; name: string }; totalQuantity: number }
    >();

    // Helper to add/update resource in map
    const addResource = (
      resourceType: ResourceTypeEnum,
      resourceUid: string,
      quantity: number,
      rarity: number,
      name: string,
    ) => {
      const resourceKey = `${resourceType}:${resourceUid}`;
      const existingResource = resourceMap.get(resourceKey);
      if (existingResource) {
        existingResource.totalQuantity += quantity;
      } else {
        resourceMap.set(resourceKey, {
          resource: { uid: resourceUid, type: resourceType, rarity, name },
          totalQuantity: quantity,
        });
      }
    };

    // Add shop resources
    for (const { uid, resource, resourceAmount } of shopResources) {
      const shopItemQuantity = state.itemQuantities[uid] || 0;
      if (shopItemQuantity > 0) {
        addResource(resource.type, resource.uid, shopItemQuantity * resourceAmount, resource.rarity, resource.name);
      }
    }

    // Add minigame rewards
    if (minigameConfig && state.minigamePlayCount > 0) {
      const rewards = calculateMinigameRewards(minigameConfig, state.minigamePlayCount);
      for (const { resourceType, resourceUid, quantity, rarity } of rewards) {
        addResource(resourceType, resourceUid, quantity, rarity ?? 1, resourceUid);
      }
    }

    return Array.from(resourceMap.values());
  }, [minigameConfig, shopResources, state.itemQuantities, state.minigamePlayCount]);

  const apBreakdown = useMemo(
    () => [
      { label: "스토리/퀘스트 초회", value: firstClearAp },
      { label: "퀘스트 소탕", value: questSweepAp },
      { label: "추가 소탕", value: extraSweepAp },
    ].filter(({ value }) => value > 0),
    [firstClearAp, questSweepAp, extraSweepAp],
  );

  return (
    <>
      <div className="pb-4 mb-4">
        <div className="mb-4">
          <h2 className="font-semibold text-lg text-neutral-900 dark:text-neutral-100">최종 결과</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">필요한 AP와 아이템 수량을 확인할 수 있어요</p>
        </div>
        <div>
        {totalApWithExtras > 0 && (
          <div className="my-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-teal-950 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex justify-between items-center mb-3 pb-1.5 border-b border-green-200 dark:border-green-800">
              <h3 className="text-base font-semibold text-green-800 dark:text-green-200">필요한 AP</h3>
              <span className="text-xl font-bold text-green-700 dark:text-green-300">{totalApWithExtras.toLocaleString()}</span>
            </div>
            <div className="space-y-1.5">
              {apBreakdown.map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm text-green-700 dark:text-green-300">
                  <span>{label}</span>
                  <span>{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4">
          {allItemUids.size === 0 && (
            <p className="w-full py-8 text-neutral-500 dark:text-neutral-400 text-center col-span-2 text-sm">
              구매할 아이템과 스테이지를 선택하세요
            </p>
          )}
          {collectableResources.map(({ uid: itemUid, name: itemName }) => {
            const shopItemUid = shopResources.find(({ resource }) => resource.uid === itemUid)?.uid;

            // Gather all counts
            const existingCount = state.existingPaymentItemQuantities[itemUid] || 0;
            const firstRunCount = fromFirstRun[itemUid] || 0;
            const fromMinigameCount = fromMinigame[itemUid] || 0;
            const fromShopCount = shopItemUid ? state.itemQuantities[shopItemUid] || 0 : 0;
            const repeatedRunsCount = fromRepeatedRuns[itemUid] || 0;
            const toPlayMinigameCount = toPlayMinigame[itemUid] || 0;
            const toBuyCount = toBuyShopItems[itemUid] || 0;

            // Calculate subtotals
            const acquiredSubtotal = existingCount + firstRunCount + fromMinigameCount + repeatedRunsCount + fromShopCount;
            const requiredSubtotal = toBuyCount + toPlayMinigameCount;
            const hasOverride = state.overriddenRequiredQuantities[itemUid] !== undefined;
            const overrideValue = state.overriddenRequiredQuantities[itemUid];
            const actualRequired = hasOverride ? overrideValue : requiredSubtotal;
            const remainingCount = acquiredSubtotal - actualRequired;

            // Build breakdown lines
            const acquiredLines: BreakdownLine[] = [
              existingCount > 0 && { label: "기존 보유", value: existingCount },
              firstRunCount > 0 && { label: "스토리 / 초회 보상", value: firstRunCount },
              fromMinigameCount > 0 && { label: "미니게임", value: fromMinigameCount },
              repeatedRunsCount > 0 && { label: "퀘스트", value: repeatedRunsCount },
              fromShopCount > 0 && { label: "상점 구매", value: fromShopCount },
            ].filter(Boolean) as BreakdownLine[];

            const requiredLines: BreakdownLine[] = !hasOverride
              ? [
                  toBuyCount > 0 && { label: "상점 구매", value: toBuyCount },
                  toPlayMinigameCount > 0 && { label: "미니게임", value: toPlayMinigameCount },
                ].filter(Boolean) as BreakdownLine[]
              : [];

            return (
              <div key={itemUid} className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg flex items-start gap-2 relative">
                <ResourceCard itemUid={itemUid} resourceType={ResourceTypeEnum.Item} rarity={1} name={itemName} />
                <div className="grow space-y-3 text-sm relative">
                  {/* 필요 수량 */}
                  {(toBuyCount > 0 || toPlayMinigameCount > 0 || hasOverride) && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">필요 수량</span>
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{Math.floor(actualRequired).toLocaleString()}</span>
                      </div>
                      <div className="pl-2 space-y-1">
                        {hasOverride ? (
                          <p className="text-neutral-500 dark:text-neutral-500 text-xs">입력한 목표 수량</p>
                        ) : (
                          <BreakdownLines lines={requiredLines} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 획득 수량 */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">획득 수량</span>
                      {acquiredSubtotal > 0 && (
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{Math.floor(acquiredSubtotal).toLocaleString()}</span>
                      )}
                    </div>
                    <div className="pl-2 space-y-1">
                      <BreakdownLines lines={acquiredLines} />
                    </div>
                  </div>

                  {/* 남은/부족 수량 */}
                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">{remainingCount >= 0 ? "남은" : "부족"} 수량</span>
                      <span
                        className={`font-bold ${remainingCount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {Math.floor(remainingCount).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 편집 버튼 */}
                  <div className="flex justify-end gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditValue(existingCount);
                          setEditingItemUid(itemUid);
                          setEditingRequiredItemUid(null);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap cursor-pointer"
                      >
                        보유 수량 입력
                      </button>
                      <EditPopup
                        show={editingItemUid === itemUid}
                        title="보유 수량을 입력해주세요"
                        value={editValue}
                        onValueChange={setEditValue}
                        onCancel={() => setEditingItemUid(null)}
                        onSave={() => {
                          actions.updateExistingQuantity(itemUid, editValue);
                          setEditingItemUid(null);
                        }}
                        onReset={() => {
                          actions.updateExistingQuantity(itemUid, 0);
                          setEditingItemUid(null);
                        }}
                        showReset={existingCount > 0}
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          const currentOverride = state.overriddenRequiredQuantities[itemUid];
                          setEditRequiredValue(currentOverride !== undefined ? currentOverride : requiredSubtotal);
                          setEditingRequiredItemUid(itemUid);
                          setEditingItemUid(null);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-200 dark:border-neutral-800 rounded-md transition whitespace-nowrap cursor-pointer"
                      >
                        목표 수량 입력
                      </button>
                      <EditPopup
                        show={editingRequiredItemUid === itemUid}
                        title="목표 수량을 입력해주세요"
                        value={editRequiredValue}
                        onValueChange={setEditRequiredValue}
                        onCancel={() => setEditingRequiredItemUid(null)}
                        onSave={() => {
                          actions.updateOverriddenRequired(itemUid, editRequiredValue);
                          setEditingRequiredItemUid(null);
                        }}
                        onReset={() => {
                          actions.resetOverriddenRequired(itemUid);
                          setEditingRequiredItemUid(null);
                        }}
                        showReset={hasOverride}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {mergedBoughtResources.length > 0 && (
          <div className="my-4 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">획득 보상</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {mergedBoughtResources.map(({ resource, totalQuantity }) => (
                <ResourceCard
                  key={`${resource.type}:${resource.uid}`}
                  itemUid={resource.uid}
                  resourceType={resource.type}
                  rarity={resource.rarity}
                  label={resourceCountLabel(totalQuantity)}
                  name={resource.name}
                />
              ))}
            </div>
          </div>
        )}

        {signedIn && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowBugReportModal(true)}
              className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md transition whitespace-nowrap cursor-pointer"
            >
              오류 제보
            </button>
          </div>
        )}
        </div>
      </div>

      {signedIn && (
        <BugReportModal
          show={showBugReportModal}
          eventUid={eventUid}
          stages={stages}
          shopResources={shopResources}
          collectableResources={collectableResources}
          stageCalculations={stageCalculations}
          shopState={state}
          onClose={() => setShowBugReportModal(false)}
        />
      )}
    </>
  );
});
