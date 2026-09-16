import {
  EQUIPMENT_TYPE_ORDER,
  getEquipmentBlueprintChoiceBoxTier,
  getEquipmentTier,
  getEquipmentTypeKey,
  getUniversalEquipmentBlueprintTypeKey,
} from "~/domain/growth-resource";

const ALLOCATION_RANGE_ERROR = "장비 설계도 대체 계산 범위가 너무 커요";

export type EquipmentBlueprintDirectDemandInput = {
  uid: string;
  inventoryUid?: string;
  requiredAmount: number;
  ownedAmount: number;
};

export type EquipmentBlueprintChoiceBoxInput = {
  uid: string;
  inventoryUid?: string;
  ownedAmount: number;
};

export type EquipmentBlueprintUniversalInput = {
  uid: string;
  inventoryUid?: string;
  ownedAmount: number;
};

export type EquipmentBlueprintDemandAllocation = {
  uid: string;
  inventoryUid: string;
  typeKey: string;
  tier: number;
  requiredAmount: number;
  directOwnedAmount: number;
  directDeficit: number;
  choiceBoxAmount: number;
  universalBlueprintAmount: number;
  universalBlueprintCost: number;
  finalDeficit: number;
};

export type EquipmentBlueprintChoiceBoxAllocation = {
  uid: string;
  inventoryUid: string;
  tier: number;
  ownedAmount: number;
  requiredAmount: number;
  usedAmount: number;
  remainingAmount: number;
};

export type EquipmentBlueprintUniversalAllocation = {
  uid: string;
  inventoryUid: string;
  typeKey: string;
  ownedAmount: number;
  requiredAmount: number;
  usedAmount: number;
  remainingAmount: number;
};

export type EquipmentBlueprintAllocation = {
  demands: EquipmentBlueprintDemandAllocation[];
  choiceBoxes: EquipmentBlueprintChoiceBoxAllocation[];
  universalBlueprints: EquipmentBlueprintUniversalAllocation[];
  totalDirectDeficit: number;
  totalFinalDeficit: number;
};

type NormalizedDemand = EquipmentBlueprintDirectDemandInput & {
  inventoryUid: string;
  typeKey: string;
  tier: number;
  directDeficit: number;
};

type NormalizedChoiceBox = EquipmentBlueprintChoiceBoxInput & {
  inventoryUid: string;
  tier: number;
};

type NormalizedUniversal = EquipmentBlueprintUniversalInput & {
  inventoryUid: string;
  typeKey: string;
};

/**
 * Allocates equipment blueprint deficits in a stable, bounded order.
 *
 * Direct blueprint inventory is deducted by each demand first. Same-tier
 * choice boxes then cover demands in Tier/category/UID order. Finally,
 * category-specific universal blueprints cover the remaining demand in the
 * same order, consuming the tier-specific number of universal blueprints.
 */
export function allocateEquipmentBlueprints({
  directDemands,
  choiceBoxes,
  universalBlueprints,
}: {
  directDemands: readonly EquipmentBlueprintDirectDemandInput[];
  choiceBoxes: readonly EquipmentBlueprintChoiceBoxInput[];
  universalBlueprints: readonly EquipmentBlueprintUniversalInput[];
}): EquipmentBlueprintAllocation {
  const demands = normalizeDemands(directDemands);
  const normalizedChoiceBoxes = normalizeChoiceBoxes(choiceBoxes);
  const normalizedUniversalBlueprints = normalizeUniversalBlueprints(universalBlueprints);
  const totalDirectDeficit = demands.reduce((sum, demand) => addSafeIntegers(sum, demand.directDeficit), 0);
  const remainingDeficits = demands.map((demand) => demand.directDeficit);
  const choiceBoxAmounts = demands.map(() => 0);
  const universalBlueprintAmounts = demands.map(() => 0);
  const choiceCapacityByTier = sumChoiceBoxAmountsByTier(normalizedChoiceBoxes);
  const universalCapacityByType = sumUniversalBlueprintAmountsByType(normalizedUniversalBlueprints);
  const remainingChoiceCapacityByTier = new Map(choiceCapacityByTier);
  const remainingUniversalCapacityByType = new Map(universalCapacityByType);
  const requiredChoiceAmountsByTier = new Map<number, number>();
  const usedChoiceAmountsByTier = new Map<number, number>();
  const requiredUniversalAmountsByType = new Map<string, number>();
  const usedUniversalAmountsByType = new Map<string, number>();

  for (let demandIndex = 0; demandIndex < demands.length; demandIndex += 1) {
    const demand = demands[demandIndex];
    const choiceCapacity = remainingChoiceCapacityByTier.get(demand.tier) ?? 0;
    const choiceAmount = Math.min(remainingDeficits[demandIndex], choiceCapacity);
    remainingDeficits[demandIndex] = subtractSafeIntegers(remainingDeficits[demandIndex], choiceAmount);
    choiceBoxAmounts[demandIndex] = choiceAmount;
    remainingChoiceCapacityByTier.set(demand.tier, subtractSafeIntegers(choiceCapacity, choiceAmount));
    usedChoiceAmountsByTier.set(
      demand.tier,
      addSafeIntegers(usedChoiceAmountsByTier.get(demand.tier) ?? 0, choiceAmount),
    );

    const tierCost = getUniversalBlueprintCost(demand.tier);
    const requiredUniversalDirectAmount = remainingDeficits[demandIndex];
    const requiredUniversalAmount = multiplySafeIntegers(requiredUniversalDirectAmount, tierCost);
    requiredUniversalAmountsByType.set(
      demand.typeKey,
      addSafeIntegers(requiredUniversalAmountsByType.get(demand.typeKey) ?? 0, requiredUniversalAmount),
    );

    const universalCapacity = remainingUniversalCapacityByType.get(demand.typeKey) ?? 0;
    const universalAmount =
      requiredUniversalDirectAmount > 0 && universalCapacity >= tierCost
        ? Math.min(requiredUniversalDirectAmount, Math.floor(universalCapacity / tierCost))
        : 0;
    universalBlueprintAmounts[demandIndex] = universalAmount;
    remainingDeficits[demandIndex] = subtractSafeIntegers(remainingDeficits[demandIndex], universalAmount);
    const universalCost = multiplySafeIntegers(universalAmount, tierCost);
    remainingUniversalCapacityByType.set(demand.typeKey, subtractSafeIntegers(universalCapacity, universalCost));
    usedUniversalAmountsByType.set(
      demand.typeKey,
      addSafeIntegers(usedUniversalAmountsByType.get(demand.typeKey) ?? 0, universalCost),
    );
    requiredChoiceAmountsByTier.set(
      demand.tier,
      addSafeIntegers(
        requiredChoiceAmountsByTier.get(demand.tier) ?? 0,
        subtractSafeIntegers(demand.directDeficit, universalAmount),
      ),
    );
  }

  const demandAllocations = demands.map((demand, demandIndex) => {
    const universalBlueprintCost = multiplySafeIntegers(
      universalBlueprintAmounts[demandIndex],
      getUniversalBlueprintCost(demand.tier),
    );
    return {
      uid: demand.uid,
      inventoryUid: demand.inventoryUid,
      typeKey: demand.typeKey,
      tier: demand.tier,
      requiredAmount: demand.requiredAmount,
      directOwnedAmount: demand.ownedAmount,
      directDeficit: demand.directDeficit,
      choiceBoxAmount: choiceBoxAmounts[demandIndex],
      universalBlueprintAmount: universalBlueprintAmounts[demandIndex],
      universalBlueprintCost,
      finalDeficit: remainingDeficits[demandIndex],
    };
  });

  return {
    demands: demandAllocations,
    choiceBoxes: buildChoiceBoxAllocations(normalizedChoiceBoxes, requiredChoiceAmountsByTier, usedChoiceAmountsByTier),
    universalBlueprints: buildUniversalBlueprintAllocations(
      normalizedUniversalBlueprints,
      requiredUniversalAmountsByType,
      usedUniversalAmountsByType,
    ),
    totalDirectDeficit,
    totalFinalDeficit: remainingDeficits.reduce((sum, amount) => addSafeIntegers(sum, amount), 0),
  };
}

export function getUniversalBlueprintCost(tier: number): number {
  const cost = UNIVERSAL_BLUEPRINT_COST_BY_TIER[tier];
  if (cost == null) {
    throw new Error("장비 설계도 Tier를 확인하지 못했어요");
  }
  return cost;
}

const UNIVERSAL_BLUEPRINT_COST_BY_TIER: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 7,
  6: 10,
  7: 15,
  8: 20,
  9: 30,
  10: 50,
};

function normalizeDemands(inputs: readonly EquipmentBlueprintDirectDemandInput[]): NormalizedDemand[] {
  return inputs
    .flatMap((input) => {
      const typeKey = getEquipmentTypeKey(input.uid);
      if (typeKey === null) {
        return [];
      }
      const requiredAmount = normalizeAmount(input.requiredAmount, "필요 장비 설계도");
      const ownedAmount = normalizeAmount(input.ownedAmount, "보유 장비 설계도");
      return [
        {
          ...input,
          inventoryUid: input.inventoryUid ?? input.uid,
          typeKey,
          tier: getEquipmentTier(input.uid),
          requiredAmount,
          ownedAmount,
          directDeficit: Math.max(0, subtractSafeIntegers(requiredAmount, ownedAmount)),
        },
      ];
    })
    .sort(compareDemands);
}

function normalizeChoiceBoxes(inputs: readonly EquipmentBlueprintChoiceBoxInput[]): NormalizedChoiceBox[] {
  return inputs
    .flatMap((input) => {
      const tier = getEquipmentBlueprintChoiceBoxTier(input.uid);
      if (tier === null) {
        return [];
      }
      return [
        {
          ...input,
          inventoryUid: input.inventoryUid ?? input.uid,
          tier,
          ownedAmount: normalizeAmount(input.ownedAmount, "보유 선택 상자"),
        },
      ];
    })
    .sort(compareChoiceBoxes);
}

function normalizeUniversalBlueprints(inputs: readonly EquipmentBlueprintUniversalInput[]): NormalizedUniversal[] {
  return inputs
    .flatMap((input) => {
      const typeKey = getUniversalEquipmentBlueprintTypeKey(input.uid);
      if (typeKey === null) {
        return [];
      }
      return [
        {
          ...input,
          inventoryUid: input.inventoryUid ?? input.uid,
          typeKey,
          ownedAmount: normalizeAmount(input.ownedAmount, "보유 만능 설계도"),
        },
      ];
    })
    .sort(compareUniversalBlueprints);
}

function sumChoiceBoxAmountsByTier(choiceBoxes: readonly NormalizedChoiceBox[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const choiceBox of choiceBoxes) {
    totals.set(choiceBox.tier, addSafeIntegers(totals.get(choiceBox.tier) ?? 0, choiceBox.ownedAmount));
  }
  return totals;
}

function sumUniversalBlueprintAmountsByType(universalBlueprints: readonly NormalizedUniversal[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const universal of universalBlueprints) {
    totals.set(universal.typeKey, addSafeIntegers(totals.get(universal.typeKey) ?? 0, universal.ownedAmount));
  }
  return totals;
}

function buildChoiceBoxAllocations(
  choiceBoxes: readonly NormalizedChoiceBox[],
  requiredAmountsByTier: ReadonlyMap<number, number>,
  usedAmountsByTier: ReadonlyMap<number, number>,
): EquipmentBlueprintChoiceBoxAllocation[] {
  const requiredAmounts = distributePoolAmountsByKey(
    choiceBoxes,
    (choiceBox) => choiceBox.tier,
    (choiceBox) => choiceBox.ownedAmount,
    requiredAmountsByTier,
  );
  const usedAmounts = distributePoolAmountsByKey(
    choiceBoxes,
    (choiceBox) => choiceBox.tier,
    (choiceBox) => choiceBox.ownedAmount,
    usedAmountsByTier,
  );

  return choiceBoxes.map((choiceBox, choiceBoxIndex) => ({
    uid: choiceBox.uid,
    inventoryUid: choiceBox.inventoryUid,
    tier: choiceBox.tier,
    ownedAmount: choiceBox.ownedAmount,
    requiredAmount: requiredAmounts[choiceBoxIndex],
    usedAmount: usedAmounts[choiceBoxIndex],
    remainingAmount: subtractSafeIntegers(choiceBox.ownedAmount, requiredAmounts[choiceBoxIndex]),
  }));
}

function buildUniversalBlueprintAllocations(
  universalBlueprints: readonly NormalizedUniversal[],
  requiredAmountsByType: ReadonlyMap<string, number>,
  usedAmountsByType: ReadonlyMap<string, number>,
): EquipmentBlueprintUniversalAllocation[] {
  const requiredAmounts = distributePoolAmountsByKey(
    universalBlueprints,
    (universal) => universal.typeKey,
    (universal) => universal.ownedAmount,
    requiredAmountsByType,
  );
  const usedAmounts = distributePoolAmountsByKey(
    universalBlueprints,
    (universal) => universal.typeKey,
    (universal) => universal.ownedAmount,
    usedAmountsByType,
  );

  return universalBlueprints.map((universal, universalIndex) => ({
    uid: universal.uid,
    inventoryUid: universal.inventoryUid,
    typeKey: universal.typeKey,
    ownedAmount: universal.ownedAmount,
    requiredAmount: requiredAmounts[universalIndex],
    usedAmount: usedAmounts[universalIndex],
    remainingAmount: subtractSafeIntegers(universal.ownedAmount, requiredAmounts[universalIndex]),
  }));
}

function distributePoolAmountsByKey<T, K extends string | number>(
  pools: readonly T[],
  getKey: (pool: T) => K,
  getOwnedAmount: (pool: T) => number,
  totalAmountsByKey: ReadonlyMap<K, number>,
): number[] {
  const amounts = Array.from({ length: pools.length }, () => 0);
  let startIndex = 0;
  while (startIndex < pools.length) {
    const key = getKey(pools[startIndex]);
    let endIndex = startIndex + 1;
    while (endIndex < pools.length && getKey(pools[endIndex]) === key) {
      endIndex += 1;
    }
    const distributed = distributePoolAmount(
      pools.slice(startIndex, endIndex).map(getOwnedAmount),
      totalAmountsByKey.get(key) ?? 0,
    );
    distributed.forEach((amount, offset) => {
      amounts[startIndex + offset] = amount;
    });
    startIndex = endIndex;
  }
  return amounts;
}

function distributePoolAmount(ownedAmounts: readonly number[], totalAmount: number): number[] {
  let remainingAmount = totalAmount;
  const amounts = ownedAmounts.map((ownedAmount) => {
    const amount = Math.min(remainingAmount, ownedAmount);
    remainingAmount = subtractSafeIntegers(remainingAmount, amount);
    return amount;
  });
  if (remainingAmount > 0 && amounts.length > 0) {
    const lastIndex = amounts.length - 1;
    amounts[lastIndex] = addSafeIntegers(amounts[lastIndex], remainingAmount);
  }
  return amounts;
}

function compareChoiceBoxes(a: NormalizedChoiceBox, b: NormalizedChoiceBox): number {
  if (a.tier !== b.tier) {
    return a.tier - b.tier;
  }
  return compareNumericUid(a.uid, b.uid);
}

function compareUniversalBlueprints(a: NormalizedUniversal, b: NormalizedUniversal): number {
  const typeOrderDelta =
    EQUIPMENT_TYPE_ORDER.indexOf(a.typeKey as (typeof EQUIPMENT_TYPE_ORDER)[number]) -
    EQUIPMENT_TYPE_ORDER.indexOf(b.typeKey as (typeof EQUIPMENT_TYPE_ORDER)[number]);
  if (typeOrderDelta !== 0) {
    return typeOrderDelta;
  }
  return compareNumericUid(a.uid, b.uid);
}

function compareDemands(a: NormalizedDemand, b: NormalizedDemand): number {
  if (a.tier !== b.tier) {
    return a.tier - b.tier;
  }
  const typeOrderA = EQUIPMENT_TYPE_ORDER.indexOf(a.typeKey as (typeof EQUIPMENT_TYPE_ORDER)[number]);
  const typeOrderB = EQUIPMENT_TYPE_ORDER.indexOf(b.typeKey as (typeof EQUIPMENT_TYPE_ORDER)[number]);
  if (typeOrderA !== typeOrderB) {
    return typeOrderA - typeOrderB;
  }
  return compareNumericUid(a.uid, b.uid);
}

function compareNumericUid(a: string, b: string): number {
  const numericDelta = Number(a) - Number(b);
  return Number.isFinite(numericDelta) && numericDelta !== 0 ? numericDelta : a.localeCompare(b);
}

function normalizeAmount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}은 0 이상의 정수여야 해요`);
  }
  return value;
}

function addSafeIntegers(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error(ALLOCATION_RANGE_ERROR);
  }
  return result;
}

function subtractSafeIntegers(left: number, right: number): number {
  const result = left - right;
  if (!Number.isSafeInteger(result)) {
    throw new Error(ALLOCATION_RANGE_ERROR);
  }
  return result;
}

function multiplySafeIntegers(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new Error(ALLOCATION_RANGE_ERROR);
  }
  return result;
}
