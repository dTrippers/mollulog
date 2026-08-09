import { Transition } from "@headlessui/react";
import { memo, useMemo, useState } from "react";
import { Button, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { CollectableResource, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import BugReportModal from "./BugReportModal";
import { calculateBoughtResourceQuantities } from "./calculations/shop-rewards";
import type { ShopActions, ShopState } from "./hooks";
import type { CalculationResult } from "./hooks/useShopCalculations";
import { calculateMinigameRewards, resourceCountLabel } from "./utils";

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
      className="absolute inset-x-0 top-full z-20 mt-2 md:right-0 md:left-auto"
    >
      <div className="rounded-lg bg-popover/90 p-4 text-popover-foreground shadow-lg backdrop-blur-sm md:w-auto md:min-w-[280px]">
        <p className="mb-2 text-sm text-muted-foreground">{title}</p>
        <div className="mb-4">
          <NumberInput value={value} onChange={onValueChange} />
        </div>
        <div className="flex justify-between items-center gap-2">
          {showReset && onReset ? (
            <Button text="초기화" variant="danger-subtle" size="xs" onClick={onReset} />
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button text="취소" variant="secondary" size="xs" onClick={onCancel} />
            <Button text="저장" variant="primary" size="xs" onClick={onSave} />
          </div>
        </div>
      </div>
    </Transition>
  );
}

function BreakdownLines({ lines }: { lines: BreakdownLine[] }) {
  if (lines.length === 0) {
    return <div className="text-xs text-muted-foreground">획득처 없음</div>;
  }

  return (
    <>
      {lines.map(({ label, value }) => (
        <div key={label} className="flex justify-between items-center">
          <span className="text-muted-foreground">
            <span className="mr-1.5">·</span>
            {label}
          </span>
          <span className="text-muted-foreground">{Math.floor(value).toLocaleString()}</span>
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
  const { itemBreakdown, totalApWithExtras, firstClearAp, questSweepAp, extraSweepAp, unobtainableTargets } =
    stageCalculations;
  const {
    existing,
    fromFirstRun,
    fromRepeatedRuns,
    fromShop,
    toPlayMinigame,
    toBuyShopItems,
    fromMinigame,
    remaining,
  } = itemBreakdown;

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

  const boughtShopResources = useMemo(
    () => calculateBoughtResourceQuantities(shopResources, state.itemQuantities, state.itemPurchaseDays),
    [shopResources, state.itemQuantities, state.itemPurchaseDays],
  );
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
      const resourceKey = `${resourceType}:${resourceUid}:${rarity}`;
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
    for (const { resource, totalQuantity } of boughtShopResources) {
      addResource(resource.type, resource.uid, totalQuantity, resource.rarity, resource.name);
    }

    // Add minigame rewards
    if (minigameConfig && state.minigamePlayCount > 0) {
      const rewards = calculateMinigameRewards(minigameConfig, state.minigamePlayCount, state.minigameStartRound);
      for (const { resourceType, resourceUid, resourceName, quantity, rarity } of rewards) {
        addResource(resourceType, resourceUid, quantity, rarity ?? 1, resourceName ?? "재화");
      }
    }

    return Array.from(resourceMap.values());
  }, [boughtShopResources, minigameConfig, state.minigamePlayCount, state.minigameStartRound]);

  const apBreakdown = useMemo(
    () =>
      [
        { label: "스토리/퀘스트 초회", value: firstClearAp },
        { label: "퀘스트 소탕", value: questSweepAp },
        { label: "추가 소탕", value: extraSweepAp },
      ].filter(({ value }) => value > 0),
    [firstClearAp, questSweepAp, extraSweepAp],
  );

  return (
    <>
      <Section title="최종 결과" description="필요한 AP와 아이템 수량을 확인할 수 있어요">
        <div>
          {totalApWithExtras > 0 && (
            <div className="my-4 rounded-md border border-green-200 bg-gradient-to-r from-green-50 to-blue-50 p-4 dark:border-green-800 dark:from-green-950 dark:to-teal-950">
              <div className="flex justify-between items-center mb-3 pb-1.5 border-b border-green-200 dark:border-green-800">
                <h3 className="text-base font-semibold text-green-800 dark:text-green-200">필요한 AP</h3>
                <span className="text-xl font-bold text-green-700 dark:text-green-300">
                  {totalApWithExtras.toLocaleString()}
                </span>
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

          {Object.keys(unobtainableTargets).length > 0 && (
            <div className="my-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p className="text-sm font-semibold">선택한 스테이지에서 획득할 수 없는 이벤트 재화가 있어요</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(unobtainableTargets).map(([uid, quantity]) => (
                  <li key={uid}>
                    {collectableResources.find((resource) => resource.uid === uid)?.name ??
                      "이름을 확인할 수 없는 이벤트 재화"}
                    : {quantity.toLocaleString()}개
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {allItemUids.size === 0 && (
              <p className="col-span-2 w-full py-8 text-center text-sm text-muted-foreground">
                구매할 아이템과 스테이지를 선택하세요
              </p>
            )}
            {collectableResources.map(({ type: resourceType, uid: itemUid, name: itemName }) => {
              // Gather all counts
              const existingCount = existing[itemUid] || 0;
              const firstRunCount = fromFirstRun[itemUid] || 0;
              const fromMinigameCount = fromMinigame[itemUid] || 0;
              const fromShopCount = fromShop[itemUid] || 0;
              const repeatedRunsCount = fromRepeatedRuns[itemUid] || 0;
              const toPlayMinigameCount = toPlayMinigame[itemUid] || 0;
              const toBuyCount = toBuyShopItems[itemUid] || 0;

              // Calculate subtotals
              const acquiredSubtotal =
                existingCount + firstRunCount + fromMinigameCount + repeatedRunsCount + fromShopCount;
              const requiredSubtotal = toBuyCount + toPlayMinigameCount;
              const hasOverride = state.overriddenRequiredQuantities[itemUid] !== undefined;
              const overrideValue = state.overriddenRequiredQuantities[itemUid];
              const actualRequired = hasOverride ? overrideValue : requiredSubtotal;
              const remainingCount = remaining[itemUid] ?? 0;

              // Build breakdown lines
              const acquiredLines: BreakdownLine[] = [
                existingCount > 0 && { label: "기존 보유", value: existingCount },
                firstRunCount > 0 && { label: "스토리 / 초회 보상", value: firstRunCount },
                fromMinigameCount > 0 && { label: "미니게임", value: fromMinigameCount },
                repeatedRunsCount > 0 && { label: "퀘스트", value: repeatedRunsCount },
                fromShopCount > 0 && { label: "상점 구매", value: fromShopCount },
              ].filter(Boolean) as BreakdownLine[];

              const requiredLines: BreakdownLine[] = !hasOverride
                ? ([
                    toBuyCount > 0 && { label: "상점 구매", value: toBuyCount },
                    toPlayMinigameCount > 0 && { label: "미니게임", value: toPlayMinigameCount },
                  ].filter(Boolean) as BreakdownLine[])
                : [];

              return (
                <div key={itemUid} className="relative flex items-start gap-2 rounded-md bg-card p-3">
                  <ResourceCard itemUid={itemUid} resourceType={resourceType} rarity={1} name={itemName} />
                  <div className="grow space-y-3 text-sm relative">
                    {/* 필요 수량 */}
                    {(toBuyCount > 0 || toPlayMinigameCount > 0 || hasOverride) && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-foreground">필요 수량</span>
                          <span className="font-semibold text-foreground">
                            {Math.floor(actualRequired).toLocaleString()}
                          </span>
                        </div>
                        <div className="pl-2 space-y-1">
                          {hasOverride ? (
                            <p className="text-xs text-muted-foreground">입력한 목표 수량</p>
                          ) : (
                            <BreakdownLines lines={requiredLines} />
                          )}
                        </div>
                      </div>
                    )}

                    {/* 획득 수량 */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-foreground">획득 수량</span>
                        {acquiredSubtotal > 0 && (
                          <span className="font-semibold text-foreground">
                            {Math.floor(acquiredSubtotal).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="pl-2 space-y-1">
                        <BreakdownLines lines={acquiredLines} />
                      </div>
                    </div>

                    {/* 남은/부족 수량 */}
                    <div className="pt-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-foreground">
                          {remainingCount >= 0 ? "남은" : "부족"} 수량
                        </span>
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
                        <Button
                          text="보유 수량 입력"
                          size="xs"
                          onClick={() => {
                            setEditValue(existingCount);
                            setEditingItemUid(itemUid);
                            setEditingRequiredItemUid(null);
                          }}
                        />
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
                        <Button
                          text="목표 수량 입력"
                          size="xs"
                          onClick={() => {
                            const currentOverride = state.overriddenRequiredQuantities[itemUid];
                            setEditRequiredValue(currentOverride !== undefined ? currentOverride : requiredSubtotal);
                            setEditingRequiredItemUid(itemUid);
                            setEditingItemUid(null);
                          }}
                        />
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
            <div className="my-4 rounded-md bg-card p-3">
              <p className="text-sm font-medium text-foreground">획득 보상</p>
              <div className="mt-2 flex flex-wrap gap-1">
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
              <Button text="오류 제보" variant="danger-subtle" size="xs" onClick={() => setShowBugReportModal(true)} />
            </div>
          )}
        </div>
      </Section>

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
