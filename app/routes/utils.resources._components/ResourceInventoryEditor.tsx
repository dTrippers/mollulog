import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBlocker, useFetcher, useSearchParams } from "react-router";
import { ResourceInventoryTile, type ResourceInventoryTileMetric } from "~/components/features/growth";
import {
  Button,
  EmptyView,
  FilterButtons,
  type NumberInputFlowNavigationInputProps,
  useNumberInputFlowNavigation,
} from "~/components/primitives";
import { cn } from "~/lib/utils";
import {
  type AggregatedGrowthResourceRequirements,
  CHARACTER_EXP_REPORTS,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_ORDER,
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
  getSkillMaterialChoiceBoxRarity,
  getSkillMaterialResourceChoiceBoxUid,
} from "~/models/growth-resource";
import { type ItemCatalogResource, getGrowthPlannerCatalogResourceKindOrder } from "~/models/item-catalog";

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
type NumberInputFlowNavigation = ReturnType<typeof useNumberInputFlowNavigation>;

type InventoryResource = ItemCatalogResource & {
  requiredAmount: number;
  kindOrder: number;
};

type ResourceGroupView = {
  kindOrder: number;
  resources: InventoryResource[];
  policy: CategoryDisplayPolicy;
  hasNeededResources: boolean;
};

type CategoryDisplayPolicy = {
  defaultMode: ResourceMode;
  modes: ResourceMode[];
  emptyNeededDefaultMode?: ResourceMode;
};

const DEFAULT_CATEGORY_POLICY: CategoryDisplayPolicy = {
  defaultMode: "needed",
  modes: ["all", "needed"],
  emptyNeededDefaultMode: "all",
};
const CATEGORY_DISPLAY_POLICIES: Record<number, CategoryDisplayPolicy> = {
  [GROWTH_RESOURCE_KIND_ORDER.eleph]: {
    defaultMode: "needed",
    modes: ["all", "needed"],
    emptyNeededDefaultMode: "needed",
  },
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
  const [baseQuantities, setBaseQuantities] = useState<Record<string, number>>(ownedQuantities);
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>(ownedQuantities);
  const [filter, setFilter] = useState<ResourceFilter>({ search: "" });
  const [categoryModes, setCategoryModes] = useState<Record<number, ResourceMode>>({});
  const numberInputFlowNavigation = useNumberInputFlowNavigation();

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
  const favorCategoryVisible = resourceGroups.some((group) => group.kindOrder === GROWTH_RESOURCE_KIND_ORDER.favor);
  const hasCreditRequirement = requiredResources.credit > 0;
  const setFavorCategoryElement = useScrollIntoCategoryOnQuery({
    requestedCategory,
    targetCategory: "favor",
    targetKindOrder: GROWTH_RESOURCE_KIND_ORDER.favor,
    targetVisible: favorCategoryVisible,
    setCategoryModes,
  });

  useUnsavedChangesGuard({ hasChanges });
  useInventorySaveResult({
    savedAt: fetcher.data?.savedAt,
    submittedQuantitiesRef,
    setBaseQuantities,
  });

  const saveChanges = () => {
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

      <div className="space-y-3">
        {hasCreditRequirement ? <CreditRequirementSummary credit={requiredResources.credit} /> : null}

        {resourceGroups.length === 0 && !hasCreditRequirement ? (
          <div className="rounded-md border border-border bg-card p-8">
            <EmptyView Icon={ArchiveBoxIcon} text="조건에 맞는 재화가 없어요" />
          </div>
        ) : (
          resourceGroups.map((group) => (
            <div
              key={group.kindOrder}
              ref={group.kindOrder === GROWTH_RESOURCE_KIND_ORDER.favor ? setFavorCategoryElement : undefined}
            >
              <ResourceGroup
                group={group}
                mode={resolveCategoryMode(group.kindOrder, categoryModes, group.hasNeededResources)}
                ownedQuantities={baseQuantities}
                draftQuantities={draftQuantities}
                requiredCharacterExp={requiredResources.characterExp}
                numberInputFlowNavigation={numberInputFlowNavigation}
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

function CreditRequirementSummary({ credit }: { credit: number }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted/60 px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">크레딧</h2>
      </div>
      <div className="px-3 py-3">
        <p className="text-xs font-medium text-muted-foreground">필요 크레딧</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{credit.toLocaleString()}</p>
      </div>
    </section>
  );
}

function useUnsavedChangesGuard({
  hasChanges,
}: {
  hasChanges: boolean;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return hasChanges && currentLocation.pathname !== nextLocation.pathname;
  });

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
    if (!hasChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);
}

function useInventorySaveResult({
  savedAt,
  submittedQuantitiesRef,
  setBaseQuantities,
}: {
  savedAt?: number;
  submittedQuantitiesRef: RefObject<Record<string, number> | null>;
  setBaseQuantities: (quantities: Record<string, number>) => void;
}) {
  useEffect(() => {
    if (!savedAt) {
      return;
    }

    const savedQuantities = submittedQuantitiesRef.current;
    if (savedQuantities) {
      setBaseQuantities(savedQuantities);
      submittedQuantitiesRef.current = null;
    }
  }, [savedAt, setBaseQuantities, submittedQuantitiesRef]);
}

function useScrollIntoCategoryOnQuery({
  requestedCategory,
  targetCategory,
  targetKindOrder,
  targetVisible,
  setCategoryModes,
}: {
  requestedCategory: string | null;
  targetCategory: string;
  targetKindOrder: number;
  targetVisible: boolean;
  setCategoryModes: Dispatch<SetStateAction<Record<number, ResourceMode>>>;
}) {
  const focusedCategoryRef = useRef<string | null>(null);
  const targetElementRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusCategory = requestedCategory === targetCategory;

  useEffect(() => {
    if (!shouldFocusCategory) {
      return;
    }

    setCategoryModes((current) => {
      if (current[targetKindOrder] === "all") {
        return current;
      }
      return { ...current, [targetKindOrder]: "all" };
    });
  }, [setCategoryModes, shouldFocusCategory, targetKindOrder]);

  useEffect(() => {
    if (!shouldFocusCategory) {
      focusedCategoryRef.current = null;
      return;
    }
    if (!targetVisible || focusedCategoryRef.current === requestedCategory) {
      return;
    }

    const element = targetElementRef.current;
    if (!element) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusedCategoryRef.current = requestedCategory;
      scrollToCategoryElement(element);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [requestedCategory, shouldFocusCategory, targetVisible]);

  return useCallback((element: HTMLDivElement | null) => {
    targetElementRef.current = element;
  }, []);
}

function ResourceGroup({
  group,
  mode,
  ownedQuantities,
  draftQuantities,
  requiredCharacterExp,
  numberInputFlowNavigation,
  onModeChange,
  onQuantityChange,
}: {
  group: ResourceGroupView;
  mode: ResourceMode;
  ownedQuantities: Record<string, number>;
  draftQuantities: Record<string, number>;
  requiredCharacterExp: number;
  numberInputFlowNavigation: NumberInputFlowNavigation;
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
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          {mode === "needed" ? "학생들의 성장 목표를 선택하여 필요 재화량을 계산해보세요" : "표시할 재화가 없어요"}
        </div>
      ) : kindOrder === GROWTH_RESOURCE_KIND_ORDER.equipment ? (
        <EquipmentSubGroups
          resources={resources}
          ownedQuantities={ownedQuantities}
          draftQuantities={draftQuantities}
          numberInputFlowNavigation={numberInputFlowNavigation}
          onQuantityChange={onQuantityChange}
        />
      ) : kindOrder === GROWTH_RESOURCE_KIND_ORDER.bd || kindOrder === GROWTH_RESOURCE_KIND_ORDER.techNote ? (
        <SkillMaterialSubGroups
          resources={resources}
          ownedQuantities={ownedQuantities}
          draftQuantities={draftQuantities}
          numberInputFlowNavigation={numberInputFlowNavigation}
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
              inputProps={numberInputFlowNavigation.getInputProps()}
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

function SkillMaterialSubGroups({
  resources,
  ownedQuantities,
  draftQuantities,
  numberInputFlowNavigation,
  onQuantityChange,
}: {
  resources: InventoryResource[];
  ownedQuantities: Record<string, number>;
  draftQuantities: Record<string, number>;
  numberInputFlowNavigation: NumberInputFlowNavigation;
  onQuantityChange: (resourceUid: string, quantity: number) => void;
}) {
  const choiceBoxResources = useMemo(
    () =>
      resources
        .filter((resource) => getSkillMaterialChoiceBoxRarity(resource.uid) !== null)
        .sort(
          (a, b) =>
            (getSkillMaterialChoiceBoxRarity(a.uid) ?? Number.MAX_SAFE_INTEGER) -
            (getSkillMaterialChoiceBoxRarity(b.uid) ?? Number.MAX_SAFE_INTEGER),
        ),
    [resources],
  );
  const skillMaterialResources = useMemo(
    () => resources.filter((resource) => getSkillMaterialChoiceBoxRarity(resource.uid) === null),
    [resources],
  );
  const choiceBoxAllocation = useMemo(
    () => allocateSkillMaterialChoiceBoxes(skillMaterialResources, choiceBoxResources, draftQuantities),
    [choiceBoxResources, draftQuantities, skillMaterialResources],
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
                inputProps={numberInputFlowNavigation.getInputProps()}
                onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {skillMaterialResources.length > 0 ? (
        <div className="px-3 py-2">
          <div className="flex flex-wrap">
            {skillMaterialResources.map((resource) => {
              const choiceBoxUid = getSkillMaterialResourceChoiceBoxUid(resource);
              return (
                <ResourceTile
                  key={resource.uid}
                  resource={resource}
                  currentQuantity={ownedQuantities[resource.uid] ?? 0}
                  draftQuantity={draftQuantities[resource.uid] ?? 0}
                  showRequiredMetrics
                  showRequiredBalance={choiceBoxUid === null}
                  metrics={choiceBoxAllocation.itemMetricsByUid.get(resource.uid)}
                  inputProps={numberInputFlowNavigation.getInputProps()}
                  onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EquipmentSubGroups({
  resources,
  ownedQuantities,
  draftQuantities,
  numberInputFlowNavigation,
  onQuantityChange,
}: {
  resources: InventoryResource[];
  ownedQuantities: Record<string, number>;
  draftQuantities: Record<string, number>;
  numberInputFlowNavigation: NumberInputFlowNavigation;
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
    () =>
      allocateEquipmentChoiceBoxes(
        subGroups.flatMap(([, typeResources]) => typeResources),
        choiceBoxResources,
        draftQuantities,
      ),
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
                inputProps={numberInputFlowNavigation.getInputProps()}
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
                inputProps={numberInputFlowNavigation.getInputProps()}
                onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type SkillMaterialChoiceBoxAllocation = {
  choiceBoxMetricsByUid: Map<string, ResourceInventoryTileMetric[]>;
  itemMetricsByUid: Map<string, ResourceInventoryTileMetric[]>;
};

function allocateSkillMaterialChoiceBoxes(
  skillMaterialResources: InventoryResource[],
  choiceBoxResources: InventoryResource[],
  quantities: Record<string, number>,
): SkillMaterialChoiceBoxAllocation {
  const remainingChoiceBoxesByUid = new Map<string, number>();
  const totalDeficitByChoiceBoxUid = new Map<string, number>();
  const itemMetricsByUid = new Map<string, ResourceInventoryTileMetric[]>();

  for (const choiceBox of choiceBoxResources) {
    remainingChoiceBoxesByUid.set(choiceBox.uid, Math.max(0, quantities[choiceBox.uid] ?? 0));
  }

  const allocationTargets = skillMaterialResources
    .map((resource) => {
      const choiceBoxUid = getSkillMaterialResourceChoiceBoxUid(resource);
      const directDeficit = Math.max(0, resource.requiredAmount - (quantities[resource.uid] ?? 0));
      return { resource, choiceBoxUid, directDeficit };
    })
    .filter(
      (target): target is { resource: InventoryResource; choiceBoxUid: string; directDeficit: number } =>
        target.choiceBoxUid !== null && target.directDeficit > 0,
    )
    .sort(compareChoiceBoxAllocationTargets);

  for (const { resource, choiceBoxUid, directDeficit } of allocationTargets) {
    if (!remainingChoiceBoxesByUid.has(choiceBoxUid)) {
      remainingChoiceBoxesByUid.set(choiceBoxUid, Math.max(0, quantities[choiceBoxUid] ?? 0));
    }

    totalDeficitByChoiceBoxUid.set(choiceBoxUid, (totalDeficitByChoiceBoxUid.get(choiceBoxUid) ?? 0) + directDeficit);

    const remainingChoiceBoxes = remainingChoiceBoxesByUid.get(choiceBoxUid) ?? 0;
    const choiceBoxAmount = Math.min(directDeficit, remainingChoiceBoxes);
    remainingChoiceBoxesByUid.set(choiceBoxUid, remainingChoiceBoxes - choiceBoxAmount);

    const metrics: ResourceInventoryTileMetric[] = [];
    if (choiceBoxAmount > 0) {
      metrics.push({
        label: "선택상자",
        value: choiceBoxAmount.toLocaleString(),
        valueClassName: "text-emerald-600 dark:text-emerald-400",
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
    const balance = Math.max(0, quantities[choiceBox.uid] ?? 0) - (totalDeficitByChoiceBoxUid.get(choiceBox.uid) ?? 0);
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

  const allocationTargets = equipmentResources
    .map((resource) => {
      const tier = getEquipmentTier(resource.uid);
      const choiceBoxUid = getEquipmentBlueprintChoiceBoxUid(tier);
      const directDeficit = Math.max(0, resource.requiredAmount - (quantities[resource.uid] ?? 0));
      return { resource, tier, choiceBoxUid, directDeficit };
    })
    .filter(
      (target): target is { resource: InventoryResource; tier: number; choiceBoxUid: string; directDeficit: number } =>
        target.choiceBoxUid !== null && target.directDeficit > 0,
    )
    .sort(compareChoiceBoxAllocationTargets);

  for (const { resource, tier, choiceBoxUid, directDeficit } of allocationTargets) {
    if (!remainingChoiceBoxesByTier.has(tier)) {
      remainingChoiceBoxesByTier.set(tier, Math.max(0, quantities[choiceBoxUid] ?? 0));
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
        valueClassName: "text-emerald-600 dark:text-emerald-400",
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

function compareChoiceBoxAllocationTargets(
  a: { resource: InventoryResource; directDeficit: number },
  b: { resource: InventoryResource; directDeficit: number },
): number {
  if (a.directDeficit !== b.directDeficit) {
    return b.directDeficit - a.directDeficit;
  }

  const nameComparison = a.resource.name.localeCompare(b.resource.name, "ko");
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return a.resource.uid.localeCompare(b.resource.uid);
}

function ResourceTile({
  resource,
  currentQuantity,
  draftQuantity,
  showRequiredMetrics,
  showRequiredBalance = true,
  metrics,
  inputProps,
  onQuantityChange,
}: {
  resource: InventoryResource;
  currentQuantity: number;
  draftQuantity: number;
  showRequiredMetrics: boolean;
  showRequiredBalance?: boolean;
  metrics?: ResourceInventoryTileMetric[];
  inputProps?: NumberInputFlowNavigationInputProps;
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
      inputProps={inputProps}
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

function scrollToCategoryElement(element: HTMLElement) {
  element.scrollIntoView({ block: "start", inline: "nearest" });

  const scrollContainer = findNearestScrollableAncestor(element);
  if (scrollContainer) {
    scrollContainer.scrollBy({ top: -CATEGORY_SCROLL_OFFSET, behavior: "auto" });
    return;
  }

  window.scrollBy({ top: -CATEGORY_SCROLL_OFFSET, behavior: "auto" });
}

function findNearestScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = `${style.overflowY} ${style.overflow}`;
    if (/(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }

    if (parent === document.body || parent === document.documentElement) {
      break;
    }

    parent = parent.parentElement;
  }

  return document.querySelector(".mllg-content-area");
}

function getCategoryDisplayPolicy(kindOrder: number): CategoryDisplayPolicy {
  return CATEGORY_DISPLAY_POLICIES[kindOrder] ?? DEFAULT_CATEGORY_POLICY;
}

function resolveCategoryMode(
  kindOrder: number,
  categoryModes: Record<number, ResourceMode>,
  hasNeededResources = true,
): ResourceMode {
  const policy = getCategoryDisplayPolicy(kindOrder);
  const storedMode = categoryModes[kindOrder];
  if (storedMode && policy.modes.includes(storedMode)) {
    return storedMode;
  }
  if (!hasNeededResources && policy.emptyNeededDefaultMode && policy.modes.includes(policy.emptyNeededDefaultMode)) {
    return policy.emptyNeededDefaultMode;
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
      const hasNeededResources = groupResources.some((resource) => resource.requiredAmount > 0);
      const mode = resolveCategoryMode(kindOrder, categoryModes, hasNeededResources);
      const policy = getCategoryDisplayPolicy(kindOrder);
      const modeResources = groupResources.filter(
        (resource) =>
          mode === "all" ||
          resource.requiredAmount > 0 ||
          (getEquipmentBlueprintChoiceBoxTier(resource.uid) !== null && (quantities[resource.uid] ?? 0) > 0) ||
          (getSkillMaterialChoiceBoxRarity(resource.uid) !== null && (quantities[resource.uid] ?? 0) > 0) ||
          (kindOrder === CHARACTER_EXP_KIND_ORDER && requiredCharacterExp > 0),
      );
      const filteredResources = search
        ? modeResources.filter((resource) => resource.name.toLowerCase().includes(search))
        : modeResources;

      return {
        kindOrder,
        resources: filteredResources,
        policy,
        hasNeededResources,
      };
    })
    .filter((group) => group.resources.length > 0 || !search);
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
  const skillMaterialChoiceBoxRequiredAmountByUid = getSkillMaterialChoiceBoxRequiredAmounts(requiredItems);
  const inventoryResources = catalogResources.map((resource) => ({
    ...resource,
    requiredAmount:
      requiredItemMap.get(resource.uid)?.amount ??
      equipmentCoverageByChoiceBoxUid.get(resource.uid)?.requiredAmount ??
      skillMaterialChoiceBoxRequiredAmountByUid.get(resource.uid) ??
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

function getSkillMaterialChoiceBoxRequiredAmounts(
  requiredItems: AggregatedGrowthResourceRequirements["items"],
): Map<string, number> {
  const requiredAmounts = new Map<string, number>();
  for (const item of requiredItems) {
    const choiceBoxUid = getSkillMaterialResourceChoiceBoxUid(item);
    if (choiceBoxUid === null) {
      continue;
    }

    requiredAmounts.set(choiceBoxUid, (requiredAmounts.get(choiceBoxUid) ?? 0) + Math.max(0, item.amount));
  }

  return requiredAmounts;
}
