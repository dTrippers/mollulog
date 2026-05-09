import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useFetcher, useSearchParams } from "react-router";
import { ResourceInventoryTile, type ResourceInventoryTileMetric } from "~/components/features/growth";
import { Button, EmptyView, FilterButtons } from "~/components/primitives";
import { cn } from "~/lib/utils";
import {
  CHARACTER_EXP_REPORTS,
  EQUIPMENT_TYPE_LABELS,
  GROWTH_RESOURCE_KIND_LABELS,
  GROWTH_RESOURCE_KIND_ORDER,
  calculateEquipmentTierCoverage,
  compareGrowthResourceKindOrder,
  getEquipmentBlueprintChoiceBoxTier,
  getEquipmentBlueprintChoiceBoxUid,
  getEquipmentResourceTierLabel,
  getEquipmentTier,
  getEquipmentTypeKey,
  getResourceKindOrder,
  type AggregatedGrowthResourceRequirements,
} from "~/models/growth-resource";
import { getGrowthPlannerCatalogResourceKindOrder, type ItemCatalogResource } from "~/repositories/item-catalog";

type ResourceInventoryEditorProps = {
  resources: ItemCatalogResource[];
  requiredResources: AggregatedGrowthResourceRequirements;
  ownedQuantities: Record<string, number>;
  error?: string;
};

type ResourceInventoryEditorActionData = {
  error?: string;
  saved?: boolean;
  savedAt?: number;
};

type ResourceMode = "needed" | "all";

type ResourceFilter = {
  search: string;
};

type InventoryResource = ItemCatalogResource & {
  requiredAmount: number;
  kindOrder: number;
};

type ResourceGroupView = {
  kindOrder: number;
  resources: InventoryResource[];
  policy: CategoryDisplayPolicy;
};

type CategoryDisplayPolicy = {
  defaultMode: ResourceMode;
  modes: ResourceMode[];
};

const EQUIPMENT_TYPE_ORDER = ["hat", "gloves", "shoes", "bag", "badge", "hairpin", "charm", "watch", "necklace"];
const DEFAULT_CATEGORY_POLICY: CategoryDisplayPolicy = {
  defaultMode: "needed",
  modes: ["all", "needed"],
};
const CATEGORY_DISPLAY_POLICIES: Record<number, CategoryDisplayPolicy> = {
  [GROWTH_RESOURCE_KIND_ORDER.eleph]: { defaultMode: "needed", modes: ["all", "needed"] },
  [GROWTH_RESOURCE_KIND_ORDER.characterExp]: { defaultMode: "all", modes: ["all"] },
  [GROWTH_RESOURCE_KIND_ORDER.favor]: { defaultMode: "all", modes: ["all", "needed"] },
};
const CHARACTER_EXP_KIND_ORDER = GROWTH_RESOURCE_KIND_ORDER.characterExp;
const CATEGORY_SCROLL_OFFSET = 80;

export default function ResourceInventoryEditor({
  resources,
  requiredResources,
  ownedQuantities,
  error,
}: ResourceInventoryEditorProps) {
  const fetcher = useFetcher<ResourceInventoryEditorActionData>();
  const [searchParams] = useSearchParams();
  const submittedQuantitiesRef = useRef<Record<string, number> | null>(null);
  const focusedCategoryRef = useRef<string | null>(null);
  const favorCategoryElementRef = useRef<HTMLDivElement | null>(null);
  const favorCategoryScrollCleanupRef = useRef<(() => void) | null>(null);
  const [baseQuantities, setBaseQuantities] = useState<Record<string, number>>(ownedQuantities);
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>(ownedQuantities);
  const [allowNavigation, setAllowNavigation] = useState(false);
  const [filter, setFilter] = useState<ResourceFilter>({ search: "" });
  const [categoryModes, setCategoryModes] = useState<Record<number, ResourceMode>>({});

  const inventoryResources = useMemo(
    () => buildInventoryResources(resources, requiredResources.items),
    [requiredResources.items, resources],
  );

  const changedItems = useMemo(
    () =>
      inventoryResources
        .map((resource) => ({
          itemUid: resource.uid,
          quantity: draftQuantities[resource.uid] ?? 0,
          currentQuantity: baseQuantities[resource.uid] ?? 0,
        }))
        .filter((item) => item.quantity !== item.currentQuantity),
    [baseQuantities, draftQuantities, inventoryResources],
  );

  const resourceGroups = useMemo(
    () =>
      buildResourceGroups(
        inventoryResources,
        categoryModes,
        filter.search,
        requiredResources.characterExp,
        draftQuantities,
      ),
    [categoryModes, draftQuantities, filter.search, inventoryResources, requiredResources.characterExp],
  );
  const submitError = fetcher.data?.error ?? error;
  const isSubmitting = fetcher.state !== "idle";
  const hasChanges = changedItems.length > 0;
  const requestedCategory = searchParams.get("category");
  const shouldFocusFavorCategory = requestedCategory === "favor";
  const favorCategoryVisible = resourceGroups.some((group) => group.kindOrder === GROWTH_RESOURCE_KIND_ORDER.favor);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return hasChanges && !allowNavigation && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (!shouldFocusFavorCategory) {
      focusedCategoryRef.current = null;
      favorCategoryScrollCleanupRef.current?.();
      favorCategoryScrollCleanupRef.current = null;
      return;
    }

    setCategoryModes((current) => {
      if (current[GROWTH_RESOURCE_KIND_ORDER.favor] === "all") {
        return current;
      }
      return { ...current, [GROWTH_RESOURCE_KIND_ORDER.favor]: "all" };
    });
  }, [shouldFocusFavorCategory]);

  useEffect(() => {
    if (!shouldFocusFavorCategory || !favorCategoryVisible || focusedCategoryRef.current === requestedCategory) {
      return;
    }

    const element = favorCategoryElementRef.current;
    if (!element) {
      return;
    }

    focusedCategoryRef.current = requestedCategory;
    favorCategoryScrollCleanupRef.current?.();
    favorCategoryScrollCleanupRef.current = repeatedlyScrollToCategoryElement(element);
    return () => {
      favorCategoryScrollCleanupRef.current?.();
      favorCategoryScrollCleanupRef.current = null;
    };
  }, [shouldFocusFavorCategory, favorCategoryVisible, requestedCategory]);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    if (window.confirm("저장하지 않은 변경 사항이 있어요. 페이지를 벗어나시겠어요?")) {
      blocker.proceed();
      return;
    }

    blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!hasChanges || allowNavigation) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [allowNavigation, hasChanges]);

  useEffect(() => {
    if (submitError) {
      setAllowNavigation(false);
    }
  }, [submitError]);

  useEffect(() => {
    if (!fetcher.data?.savedAt) {
      return;
    }

    const savedQuantities = submittedQuantitiesRef.current;
    if (savedQuantities) {
      setBaseQuantities(savedQuantities);
      submittedQuantitiesRef.current = null;
    }
    setAllowNavigation(false);
  }, [fetcher.data?.savedAt]);

  const saveChanges = () => {
    setAllowNavigation(true);
    submittedQuantitiesRef.current = { ...draftQuantities };
    fetcher.submit(
      { items: changedItems.map(({ itemUid, quantity }) => ({ itemUid, quantity })) },
      { method: "post", encType: "application/json" },
    );
  };

  const resetDraft = () => {
    setDraftQuantities(baseQuantities);
  };

  const changeCategoryMode = (kindOrder: number, mode: ResourceMode) => {
    setCategoryModes((current) => ({ ...current, [kindOrder]: mode }));
  };

  return (
    <>
      {submitError ? (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {submitError}
        </p>
      ) : null}

      {requiredResources.skillUnavailable ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          일부 학생의 스킬 재화는 BAQL 응답을 불러오지 못해 합계에서 제외됐어요.
        </p>
      ) : null}

      <div className="space-y-3">
        {resourceGroups.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8">
            <EmptyView Icon={ArchiveBoxIcon} text="조건에 맞는 재화가 없어요" />
          </div>
        ) : (
          resourceGroups.map((group) => (
            <div
              key={group.kindOrder}
              ref={(element) => {
                if (group.kindOrder !== GROWTH_RESOURCE_KIND_ORDER.favor) {
                  return;
                }

                if (!element) {
                  favorCategoryElementRef.current = null;
                  return;
                }

                favorCategoryElementRef.current = element;
                if (shouldFocusFavorCategory && focusedCategoryRef.current !== requestedCategory) {
                  focusedCategoryRef.current = requestedCategory;
                  favorCategoryScrollCleanupRef.current?.();
                  favorCategoryScrollCleanupRef.current = repeatedlyScrollToCategoryElement(element);
                }
              }}
            >
              <ResourceGroup
                group={group}
                mode={resolveCategoryMode(group.kindOrder, categoryModes)}
                ownedQuantities={baseQuantities}
                draftQuantities={draftQuantities}
                requiredCharacterExp={requiredResources.characterExp}
                onModeChange={changeCategoryMode}
                onQuantityChange={(resourceUid, quantity) => {
                  setDraftQuantities((current) => ({ ...current, [resourceUid]: quantity }));
                }}
              />
            </div>
          ))
        )}
      </div>

      {hasChanges ? (
        <div className="fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-layer-navigation px-4 py-3 lg:bottom-0 lg:left-72 xl:left-84">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">변경 사항이 있습니다</p>
              <p className="mt-1 text-xs text-muted-foreground">
                변경된 재화 {changedItems.length.toLocaleString()}개를 저장합니다.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="tint" onClick={resetDraft} disabled={isSubmitting}>
                되돌리기
              </Button>
              <Button type="button" size="sm" variant="primary" onClick={saveChanges} disabled={isSubmitting}>
                {isSubmitting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
                {isSubmitting ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ResourceGroup({
  group,
  mode,
  ownedQuantities,
  draftQuantities,
  requiredCharacterExp,
  onModeChange,
  onQuantityChange,
}: {
  group: ResourceGroupView;
  mode: ResourceMode;
  ownedQuantities: Record<string, number>;
  draftQuantities: Record<string, number>;
  requiredCharacterExp: number;
  onModeChange: (kindOrder: number, mode: ResourceMode) => void;
  onQuantityChange: (resourceUid: string, quantity: number) => void;
}) {
  const { kindOrder, resources, policy } = group;
  const isCharacterExpGroup = kindOrder === CHARACTER_EXP_KIND_ORDER;
  const isFavorGroup = kindOrder === GROWTH_RESOURCE_KIND_ORDER.favor;
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted/60 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{GROWTH_RESOURCE_KIND_LABELS[kindOrder] ?? "기타"}</h2>
          {isFavorGroup ? (
            <Button text="인연 랭크 계산기" to="/utils/relationship" size="xs" variant="tint-blue" />
          ) : null}
        </div>
      </div>
      {isCharacterExpGroup && requiredCharacterExp > 0 ? (
        <CharacterExpSummary requiredCharacterExp={requiredCharacterExp} draftQuantities={draftQuantities} />
      ) : null}
      {policy.modes.length > 1 ? (
        <div className="px-3 pt-2">
          <CategoryModeSwitch kindOrder={kindOrder} mode={mode} onModeChange={onModeChange} />
        </div>
      ) : null}
      {resources.length === 0 ? (
        <div className="px-3 py-6">
          <EmptyView Icon={ArchiveBoxIcon} text="필요한 재화가 없어요" />
        </div>
      ) : kindOrder === GROWTH_RESOURCE_KIND_ORDER.equipment ? (
        <EquipmentSubGroups
          resources={resources}
          ownedQuantities={ownedQuantities}
          draftQuantities={draftQuantities}
          onQuantityChange={onQuantityChange}
        />
      ) : (
        <div className="flex flex-wrap gap-x-1 gap-y-0 px-3 py-2">
          {resources.map((resource) => (
            <ResourceTile
              key={resource.uid}
              resource={resource}
              currentQuantity={ownedQuantities[resource.uid] ?? 0}
              draftQuantity={draftQuantities[resource.uid] ?? 0}
              showRequiredMetrics={!isCharacterExpGroup}
              onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryModeSwitch({
  kindOrder,
  mode,
  onModeChange,
}: {
  kindOrder: number;
  mode: ResourceMode;
  onModeChange: (kindOrder: number, mode: ResourceMode) => void;
}) {
  return (
    <FilterButtons
      buttonProps={[
        { text: "전체", active: mode === "all", onToggle: () => onModeChange(kindOrder, "all") },
        { text: "필요한 재화", active: mode === "needed", onToggle: () => onModeChange(kindOrder, "needed") },
      ]}
      exclusive
      atLeastOne
      size="sm"
    />
  );
}

function EquipmentSubGroups({
  resources,
  ownedQuantities,
  draftQuantities,
  onQuantityChange,
}: {
  resources: InventoryResource[];
  ownedQuantities: Record<string, number>;
  draftQuantities: Record<string, number>;
  onQuantityChange: (resourceUid: string, quantity: number) => void;
}) {
  const choiceBoxResources = useMemo(
    () =>
      resources
        .filter((resource) => getEquipmentBlueprintChoiceBoxTier(resource.uid) !== null)
        .sort(
          (a, b) =>
            (getEquipmentBlueprintChoiceBoxTier(a.uid) ?? Number.MAX_SAFE_INTEGER) -
            (getEquipmentBlueprintChoiceBoxTier(b.uid) ?? Number.MAX_SAFE_INTEGER),
        ),
    [resources],
  );
  const equipmentResources = useMemo(
    () => resources.filter((resource) => getEquipmentBlueprintChoiceBoxTier(resource.uid) === null),
    [resources],
  );
  const subGroups = useMemo(() => {
    const grouped = new Map<string, InventoryResource[]>();
    for (const resource of equipmentResources) {
      const typeKey = getEquipmentTypeKey(resource.uid) ?? "기타";
      const current = grouped.get(typeKey);
      if (current) {
        current.push(resource);
      } else {
        grouped.set(typeKey, [resource]);
      }
    }
    return EQUIPMENT_TYPE_ORDER.filter((key) => grouped.has(key)).map(
      (key) => [key, grouped.get(key) as InventoryResource[]] as const,
    );
  }, [equipmentResources]);
  const choiceBoxAllocation = useMemo(
    () => allocateEquipmentChoiceBoxes(subGroups.flatMap(([, typeResources]) => typeResources), choiceBoxResources, draftQuantities),
    [choiceBoxResources, draftQuantities, subGroups],
  );

  return (
    <div className="divide-y divide-border">
      {choiceBoxResources.length > 0 ? (
        <div className="px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">선택 상자</p>
          <div className="flex flex-wrap">
            {choiceBoxResources.map((resource) => (
              <ResourceTile
                key={resource.uid}
                resource={resource}
                currentQuantity={ownedQuantities[resource.uid] ?? 0}
                draftQuantity={draftQuantities[resource.uid] ?? 0}
                showRequiredMetrics={false}
                metrics={choiceBoxAllocation.choiceBoxMetricsByUid.get(resource.uid)}
                onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {subGroups.map(([typeKey, typeResources]) => (
        <div key={typeKey} className="px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{EQUIPMENT_TYPE_LABELS[typeKey] ?? typeKey}</p>
          <div className="flex flex-wrap">
            {typeResources.map((resource) => (
              <ResourceTile
                key={resource.uid}
                resource={resource}
                currentQuantity={ownedQuantities[resource.uid] ?? 0}
                draftQuantity={draftQuantities[resource.uid] ?? 0}
                showRequiredMetrics
                showRequiredBalance={false}
                metrics={choiceBoxAllocation.itemMetricsByUid.get(resource.uid)}
                onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type EquipmentChoiceBoxAllocation = {
  choiceBoxMetricsByUid: Map<string, ResourceInventoryTileMetric[]>;
  itemMetricsByUid: Map<string, ResourceInventoryTileMetric[]>;
};

function allocateEquipmentChoiceBoxes(
  equipmentResources: InventoryResource[],
  choiceBoxResources: InventoryResource[],
  quantities: Record<string, number>,
): EquipmentChoiceBoxAllocation {
  const remainingChoiceBoxesByTier = new Map<number, number>();
  const totalDeficitByTier = new Map<number, number>();
  const itemMetricsByUid = new Map<string, ResourceInventoryTileMetric[]>();

  for (const choiceBox of choiceBoxResources) {
    const tier = getEquipmentBlueprintChoiceBoxTier(choiceBox.uid);
    if (tier !== null) {
      remainingChoiceBoxesByTier.set(tier, Math.max(0, quantities[choiceBox.uid] ?? 0));
    }
  }

  for (const resource of equipmentResources) {
    const choiceBoxUid = getEquipmentBlueprintChoiceBoxUid(getEquipmentTier(resource.uid));
    if (choiceBoxUid === null) {
      continue;
    }

    const tier = getEquipmentTier(resource.uid);
    if (!remainingChoiceBoxesByTier.has(tier)) {
      remainingChoiceBoxesByTier.set(tier, Math.max(0, quantities[choiceBoxUid] ?? 0));
    }

    const directDeficit = Math.max(0, resource.requiredAmount - (quantities[resource.uid] ?? 0));
    if (directDeficit <= 0) {
      continue;
    }

    totalDeficitByTier.set(tier, (totalDeficitByTier.get(tier) ?? 0) + directDeficit);

    const remainingChoiceBoxes = remainingChoiceBoxesByTier.get(tier) ?? 0;
    const choiceBoxAmount = Math.min(directDeficit, remainingChoiceBoxes);
    remainingChoiceBoxesByTier.set(tier, remainingChoiceBoxes - choiceBoxAmount);

    const metrics: ResourceInventoryTileMetric[] = [];
    if (choiceBoxAmount > 0) {
      metrics.push({
        label: "선택상자",
        value: choiceBoxAmount.toLocaleString(),
      });
    }

    const remainingDeficit = directDeficit - choiceBoxAmount;
    if (remainingDeficit > 0) {
      metrics.push({
        label: "부족",
        value: remainingDeficit.toLocaleString(),
        valueClassName: "text-red-600 dark:text-red-300",
      });
    }

    if (metrics.length > 0) {
      itemMetricsByUid.set(resource.uid, metrics);
    }
  }

  const choiceBoxMetricsByUid = new Map<string, ResourceInventoryTileMetric[]>();
  for (const choiceBox of choiceBoxResources) {
    const tier = getEquipmentBlueprintChoiceBoxTier(choiceBox.uid);
    if (tier === null) {
      continue;
    }

    const balance = Math.max(0, quantities[choiceBox.uid] ?? 0) - (totalDeficitByTier.get(tier) ?? 0);
    choiceBoxMetricsByUid.set(choiceBox.uid, [
      {
        label: balance >= 0 ? "여유" : "부족",
        value: Math.abs(balance).toLocaleString(),
        valueClassName: cn(
          balance >= 0 && "text-emerald-600 dark:text-emerald-400",
          balance < 0 && "text-red-600 dark:text-red-300",
        ),
      },
    ]);
  }

  return { choiceBoxMetricsByUid, itemMetricsByUid };
}

function ResourceTile({
  resource,
  currentQuantity,
  draftQuantity,
  showRequiredMetrics,
  showRequiredBalance = true,
  metrics,
  onQuantityChange,
}: {
  resource: InventoryResource;
  currentQuantity: number;
  draftQuantity: number;
  showRequiredMetrics: boolean;
  showRequiredBalance?: boolean;
  metrics?: ResourceInventoryTileMetric[];
  onQuantityChange: (quantity: number) => void;
}) {
  const hasRequiredAmount = showRequiredMetrics && resource.requiredAmount > 0;
  const requiredBalance = draftQuantity - resource.requiredAmount;
  const requiredMetrics: ResourceInventoryTileMetric[] = [];
  if (hasRequiredAmount) {
    requiredMetrics.push({
      label: "필요",
      value: resource.requiredAmount.toLocaleString(),
    });
    if (showRequiredBalance) {
      requiredMetrics.push({
        label: requiredBalance >= 0 ? "여유" : "부족",
        value: Math.abs(requiredBalance).toLocaleString(),
        valueClassName: cn(
          requiredBalance >= 0 && "text-emerald-600 dark:text-emerald-400",
          requiredBalance < 0 && "text-red-600 dark:text-red-300",
        ),
      });
    }
  }

  return (
    <ResourceInventoryTile
      resource={{
        itemUid: resource.uid,
        resourceType: resource.type,
        rarity: resource.rarity,
        name: resource.name,
        label: getEquipmentResourceTierLabel(resource.uid) ?? undefined,
      }}
      currentQuantity={currentQuantity}
      draftQuantity={draftQuantity}
      metrics={[...requiredMetrics, ...(metrics ?? [])]}
      onQuantityChange={onQuantityChange}
    />
  );
}

function CharacterExpSummary({
  requiredCharacterExp,
  draftQuantities,
}: {
  requiredCharacterExp: number;
  draftQuantities: Record<string, number>;
}) {
  const ownedCharacterExp = calculateOwnedCharacterExp(draftQuantities);
  const balance = ownedCharacterExp - requiredCharacterExp;
  return (
    <div className="border-b border-border bg-background px-3 py-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CharacterExpSummaryItem label="필요 경험치" value={requiredCharacterExp.toLocaleString()} />
        <CharacterExpSummaryItem label="보유 경험치" value={ownedCharacterExp.toLocaleString()} />
        <CharacterExpSummaryItem
          label={balance >= 0 ? "여유 경험치" : "부족 경험치"}
          value={Math.abs(balance).toLocaleString()}
          valueClassName={cn(
            balance >= 0 && "text-emerald-600 dark:text-emerald-400",
            balance < 0 && "text-red-600 dark:text-red-300",
          )}
        />
      </div>
    </div>
  );
}

function CharacterExpSummaryItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold tabular-nums text-foreground", valueClassName)}>{value}</p>
    </div>
  );
}

function repeatedlyScrollToCategoryElement(element: HTMLElement) {
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];
  let frameId: number | null = null;
  let nextFrameId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const scroll = () => scrollToCategoryElement(element);
  frameId = requestAnimationFrame(() => {
    nextFrameId = requestAnimationFrame(scroll);
  });
  timeoutIds.push(setTimeout(scroll, 120));
  timeoutIds.push(setTimeout(scroll, 300));
  timeoutIds.push(setTimeout(scroll, 600));
  intervalId = setInterval(scroll, 100);
  timeoutIds.push(setTimeout(() => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }, 800));

  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    if (nextFrameId !== null) {
      cancelAnimationFrame(nextFrameId);
    }
    for (const timeoutId of timeoutIds) {
      clearTimeout(timeoutId);
    }
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  };
}

function scrollToCategoryElement(element: HTMLElement) {
  const scrollContainer = document.querySelector(".mllg-content-area");
  if (scrollContainer instanceof HTMLElement) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + elementRect.top - containerRect.top - CATEGORY_SCROLL_OFFSET,
      behavior: "smooth",
    });
    return;
  }

  const elementTop = element.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: elementTop - CATEGORY_SCROLL_OFFSET, behavior: "smooth" });
}

function getCategoryDisplayPolicy(kindOrder: number): CategoryDisplayPolicy {
  return CATEGORY_DISPLAY_POLICIES[kindOrder] ?? DEFAULT_CATEGORY_POLICY;
}

function resolveCategoryMode(kindOrder: number, categoryModes: Record<number, ResourceMode>): ResourceMode {
  const policy = getCategoryDisplayPolicy(kindOrder);
  const storedMode = categoryModes[kindOrder];
  if (storedMode && policy.modes.includes(storedMode)) {
    return storedMode;
  }
  return policy.defaultMode;
}

function buildResourceGroups(
  resources: InventoryResource[],
  categoryModes: Record<number, ResourceMode>,
  searchValue: string,
  requiredCharacterExp: number,
  quantities: Record<string, number>,
): ResourceGroupView[] {
  const grouped = new Map<number, InventoryResource[]>();
  for (const resource of resources) {
    const current = grouped.get(resource.kindOrder);
    if (current) {
      current.push(resource);
    } else {
      grouped.set(resource.kindOrder, [resource]);
    }
  }

  const search = searchValue.trim().toLowerCase();
  return Array.from(grouped.entries())
    .sort(([a], [b]) => compareGrowthResourceKindOrder(a, b))
    .map(([kindOrder, groupResources]) => {
      const mode = resolveCategoryMode(kindOrder, categoryModes);
      const policy = getCategoryDisplayPolicy(kindOrder);
      const modeResources = groupResources.filter(
        (resource) =>
          mode === "all" ||
          resource.requiredAmount > 0 ||
          (getEquipmentBlueprintChoiceBoxTier(resource.uid) !== null && (quantities[resource.uid] ?? 0) > 0) ||
          (kindOrder === CHARACTER_EXP_KIND_ORDER && requiredCharacterExp > 0),
      );
      const filteredResources = search
        ? modeResources.filter((resource) => resource.name.toLowerCase().includes(search))
        : modeResources;

      return {
        kindOrder,
        resources: filteredResources,
        policy,
      };
    })
    .filter((group) => {
      const mode = resolveCategoryMode(group.kindOrder, categoryModes);
      const hasModeOverride = mode !== group.policy.defaultMode;
      return group.resources.length > 0 || (!search && hasModeOverride);
    });
}

function buildInventoryResources(
  catalogResources: ItemCatalogResource[],
  requiredItems: AggregatedGrowthResourceRequirements["items"],
): InventoryResource[] {
  const catalogResourceMap = new Map(catalogResources.map((resource) => [resource.uid, resource]));
  const requiredItemMap = new Map(requiredItems.map((item) => [item.uid, item]));
  const equipmentCoverageByChoiceBoxUid = new Map(
    calculateEquipmentTierCoverage(requiredItems, {}).map((coverage) => [coverage.choiceBoxUid, coverage]),
  );
  const inventoryResources = catalogResources.map((resource) => ({
    ...resource,
    requiredAmount:
      requiredItemMap.get(resource.uid)?.amount ??
      equipmentCoverageByChoiceBoxUid.get(resource.uid)?.requiredAmount ??
      0,
    kindOrder: getGrowthPlannerCatalogResourceKindOrder(resource) ?? 7,
  }));

  for (const item of requiredItems) {
    if (catalogResourceMap.has(item.uid)) {
      continue;
    }

    inventoryResources.push({
      uid: item.uid,
      name: item.name ?? "알 수 없는 재화",
      rarity: item.rarity,
      type: item.type,
      category: item.category ?? null,
      subCategory: item.subCategory ?? null,
      requiredAmount: item.amount,
      kindOrder: getResourceKindOrder(item),
    });
  }

  return inventoryResources;
}

function calculateOwnedCharacterExp(quantities: Record<string, number>): number {
  return CHARACTER_EXP_REPORTS.reduce((sum, report) => sum + (quantities[report.uid] ?? 0) * report.exp, 0);
}
