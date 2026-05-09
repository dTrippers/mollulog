import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useFetcher } from "react-router";
import { Button, EmptyView, NumberInput, ResourceCard, Title } from "~/components/primitives";
import { cn } from "~/lib/utils";
import {
  CHARACTER_EXP_REPORTS,
  EQUIPMENT_TYPE_LABELS,
  GROWTH_RESOURCE_KIND_LABELS,
  getEquipmentTypeKey,
  getResourceKindOrder,
  type AggregatedGrowthResourceRequirements,
} from "~/models/growth-resource";
import {
  getGrowthPlannerCatalogResourceKindOrder,
  type ItemCatalogResource,
} from "~/repositories/item-catalog";

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
  totalCount: number;
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
  0: { defaultMode: "needed", modes: ["all", "needed"] },
  1: { defaultMode: "all", modes: ["all"] },
};
const CHARACTER_EXP_KIND_ORDER = 1;

export default function ResourceInventoryEditor({
  resources,
  requiredResources,
  ownedQuantities,
  error,
}: ResourceInventoryEditorProps) {
  const fetcher = useFetcher<ResourceInventoryEditorActionData>();
  const submittedQuantitiesRef = useRef<Record<string, number> | null>(null);
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
    () => buildResourceGroups(inventoryResources, categoryModes, filter.search, requiredResources.characterExp),
    [categoryModes, filter.search, inventoryResources, requiredResources.characterExp],
  );
  const filteredResourceCount = useMemo(
    () => resourceGroups.reduce((sum, group) => sum + group.resources.length, 0),
    [resourceGroups],
  );

  const submitError = fetcher.data?.error ?? error;
  const isSubmitting = fetcher.state !== "idle";
  const hasChanges = changedItems.length > 0;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return hasChanges && !allowNavigation && currentLocation.pathname !== nextLocation.pathname;
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
    <div className="space-y-3 pb-28">
      <Title
        text="보유 재화 관리"
        description="보유한 재화 수량을 관리할 수 있어요"
      />

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
        {filteredResourceCount === 0 ? (
          <div className="rounded-md border border-border bg-card p-8">
            <EmptyView Icon={ArchiveBoxIcon} text="조건에 맞는 재화가 없어요" />
          </div>
        ) : (
          resourceGroups.map((group) => (
            <ResourceGroup
              key={group.kindOrder}
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
    </div>
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
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {GROWTH_RESOURCE_KIND_LABELS[kindOrder] ?? "기타"}
          </h2>
        </div>
        {policy.modes.length > 1 ? (
          <CategoryModeSwitch kindOrder={kindOrder} mode={mode} onModeChange={onModeChange} />
        ) : null}
      </div>
      {isCharacterExpGroup && requiredCharacterExp > 0 ? (
        <CharacterExpSummary requiredCharacterExp={requiredCharacterExp} draftQuantities={draftQuantities} />
      ) : null}
      {kindOrder === 6 ? (
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
    <div className="inline-flex self-start rounded-md border border-border bg-background p-1">
      <button
        type="button"
        onClick={() => onModeChange(kindOrder, "all")}
        className={cn(
          "rounded px-2 py-1 text-xs font-medium",
          mode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
        )}
      >
        전체
      </button>
      <button
        type="button"
        onClick={() => onModeChange(kindOrder, "needed")}
        className={cn(
          "rounded px-2 py-1 text-xs font-medium",
          mode === "needed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
        )}
      >
        필요한 재화
      </button>
    </div>
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
  const subGroups = useMemo(() => {
    const grouped = new Map<string, InventoryResource[]>();
    for (const resource of resources) {
      const typeKey = getEquipmentTypeKey(resource.uid) ?? "기타";
      const current = grouped.get(typeKey);
      if (current) {
        current.push(resource);
      } else {
        grouped.set(typeKey, [resource]);
      }
    }
    return EQUIPMENT_TYPE_ORDER
      .filter((key) => grouped.has(key))
      .map((key) => [key, grouped.get(key) as InventoryResource[]] as const);
  }, [resources]);

  return (
    <div className="divide-y divide-border">
      {subGroups.map(([typeKey, typeResources]) => (
        <div key={typeKey} className="px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {EQUIPMENT_TYPE_LABELS[typeKey] ?? typeKey}
          </p>
          <div className="flex flex-wrap">
            {typeResources.map((resource) => (
              <ResourceTile
                key={resource.uid}
                resource={resource}
                currentQuantity={ownedQuantities[resource.uid] ?? 0}
                draftQuantity={draftQuantities[resource.uid] ?? 0}
                showRequiredMetrics
                onQuantityChange={(quantity) => onQuantityChange(resource.uid, quantity)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResourceTile({
  resource,
  currentQuantity,
  draftQuantity,
  showRequiredMetrics,
  onQuantityChange,
}: {
  resource: InventoryResource;
  currentQuantity: number;
  draftQuantity: number;
  showRequiredMetrics: boolean;
  onQuantityChange: (quantity: number) => void;
}) {
  const diff = draftQuantity - currentQuantity;
  const hasRequiredAmount = showRequiredMetrics && resource.requiredAmount > 0;
  const requiredBalance = draftQuantity - resource.requiredAmount;
  return (
    <div
      title={resource.name}
      className={cn(
        "flex w-20 flex-col items-center gap-1.5 rounded-md px-1 py-2",
        diff !== 0 && "bg-blue-50/70 dark:bg-blue-950/20",
      )}
    >
      <ResourceCard
        itemUid={resource.uid}
        resourceType={resource.type}
        rarity={resource.rarity}
        name={resource.name}
        size="lg"
      />
      <div className="w-full">
        <p className="mb-1 text-center text-xs font-medium text-muted-foreground">보유</p>
        <NumberInput
          minValue={0}
          showDecrease={false}
          showIncrease={false}
          size="sm"
          value={draftQuantity}
          onChange={onQuantityChange}
        />
      </div>
      <div className="w-full space-y-0.5 text-xs">
        {hasRequiredAmount ? (
          <>
            <MetricRow label="필요" value={resource.requiredAmount.toLocaleString()} />
            <MetricRow
              label={requiredBalance >= 0 ? "여유" : "부족"}
              value={Math.abs(requiredBalance).toLocaleString()}
              valueClassName={cn(
                requiredBalance >= 0 && "text-emerald-600 dark:text-emerald-400",
                requiredBalance < 0 && "text-red-600 dark:text-red-300",
              )}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums text-foreground", valueClassName)}>{value}</span>
    </div>
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
    .sort(([a], [b]) => a - b)
    .map(([kindOrder, groupResources]) => {
      const mode = resolveCategoryMode(kindOrder, categoryModes);
      const modeResources = groupResources.filter(
        (resource) =>
          mode === "all" ||
          resource.requiredAmount > 0 ||
          (kindOrder === CHARACTER_EXP_KIND_ORDER && requiredCharacterExp > 0),
      );
      const filteredResources = search
        ? modeResources.filter((resource) => resource.name.toLowerCase().includes(search))
        : modeResources;

      return {
        kindOrder,
        resources: filteredResources,
        totalCount: modeResources.length,
        policy: getCategoryDisplayPolicy(kindOrder),
      };
    })
    .filter((group) => group.resources.length > 0);
}

function buildInventoryResources(
  catalogResources: ItemCatalogResource[],
  requiredItems: AggregatedGrowthResourceRequirements["items"],
): InventoryResource[] {
  const catalogResourceMap = new Map(catalogResources.map((resource) => [resource.uid, resource]));
  const requiredItemMap = new Map(requiredItems.map((item) => [item.uid, item]));
  const inventoryResources = catalogResources.map((resource) => ({
    ...resource,
    requiredAmount: requiredItemMap.get(resource.uid)?.amount ?? 0,
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
