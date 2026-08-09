import type { MinigameConfig, ShopResource } from "~/domain/event-shop";
import { getAppliedRoundCount, getSpecifiedRounds } from "./utils";

const RATIO_EPSILON = 1e-9;

export type ClueSearchExchange = {
  supported: boolean;
  reason?: string;
  clueUids: string[];
  pointResource?: ShopResource["resource"];
  rules: ClueSearchExchangeRule[];
  pointPerClue: Record<string, number>;
  hiddenShopResourceUids: string[];
};

export type ClueSearchExchangeRule = {
  clueType: ShopResource["resource"]["type"];
  clueUid: string;
  clueName?: string;
  pointAmount: number;
  clueAmount: number;
  pointPerClue: number;
};

export type ClueSearchExchangeRate = {
  pointAmount: number;
  clueAmount: number;
};

export type ClueSearchRoundRange = {
  startRound: number;
  endRound: number;
};

export type ClueSearchRoundDetail = {
  round: number;
  loopCount?: number;
  clues: {
    resourceType: ShopResource["resource"]["type"];
    resourceUid: string;
    resourceName?: string;
    quantity: number;
  }[];
  rewards: {
    resourceType: ShopResource["resource"]["type"];
    resourceUid: string;
    resourceName?: string;
    quantity: number;
    rarity?: number;
  }[];
};

type ExchangeRatio = {
  paymentResourceUid: string;
  ratio: number;
};

type ResourceIdentity = {
  type: ShopResource["resource"]["type"];
  uid: string;
};

function resourceKey(resource: ResourceIdentity): string {
  return `${resource.type}:${resource.uid}`;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= RATIO_EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function rowExchangeRatio(shopResource: ShopResource, paymentResource: ResourceIdentity): ExchangeRatio | null {
  if (
    shopResource.paymentResource.uid !== paymentResource.uid ||
    shopResource.paymentResource.type !== paymentResource.type ||
    shopResource.resourceAmount <= 0
  ) {
    return null;
  }

  if (shopResource.purchaseTiers.length === 0) {
    return null;
  }

  if (shopResource.shopAmount !== null || shopResource.purchaseTiers.some((tier) => tier.quantity !== null)) {
    return null;
  }

  const ratios = shopResource.purchaseTiers.map((tier) => {
    if (
      tier.paymentResource.uid !== paymentResource.uid ||
      tier.paymentResource.type !== paymentResource.type ||
      tier.unitPrice <= 0
    ) {
      return null;
    }

    return shopResource.resourceAmount / tier.unitPrice;
  });
  if (ratios.some((ratio) => ratio === null)) {
    return null;
  }

  const firstRatio = ratios[0] as number;
  if (ratios.some((ratio) => !approximatelyEqual(ratio as number, firstRatio))) {
    return null;
  }

  return { paymentResourceUid: paymentResource.uid, ratio: firstRatio };
}

function unsupported(reason: string, clueUids: string[]): ClueSearchExchange {
  return {
    supported: false,
    reason,
    clueUids,
    rules: [],
    pointPerClue: {},
    hiddenShopResourceUids: [],
  };
}

/**
 * Resolves the bidirectional clue/point exchange from the event's actual shop rows.
 * A mapping is supported only when every clue payment has exactly one fixed-rate
 * row in each direction and all rows share one point resource.
 */
export function resolveClueSearchExchange(
  config: MinigameConfig | null | undefined,
  shopResources: ShopResource[],
): ClueSearchExchange | null {
  if (config?.minigameType !== "clue_search") {
    return null;
  }

  const clueRefs = [
    ...new Map(
      config.rewardGroups
        .flatMap((group) => group.payments)
        .map((payment) => [
          resourceKey({ type: payment.resourceType, uid: payment.resourceUid }),
          { type: payment.resourceType, uid: payment.resourceUid, name: payment.resourceName },
        ]),
    ).values(),
  ];
  const clueUids = [...new Set(clueRefs.map((clue) => clue.uid))];
  if (clueRefs.length === 0) {
    return unsupported("단서 결제 정보가 없어 교환 규칙을 확인할 수 없어요.", clueUids);
  }

  const clueSet = new Set(clueRefs.map((clue) => resourceKey(clue)));
  const pointResources = new Map<string, ResourceIdentity>();
  const forwardRows = new Map<string, ShopResource>();
  const reverseRows = new Map<string, ShopResource>();

  for (const clue of clueRefs) {
    const clueKey = resourceKey(clue);
    const candidates = shopResources.filter(
      (shopResource) =>
        shopResource.resource.uid === clue.uid &&
        shopResource.resource.type === clue.type &&
        !clueSet.has(resourceKey(shopResource.paymentResource)),
    );
    if (candidates.length !== 1) {
      return unsupported("단서와 이벤트 포인트의 양방향 교환 행을 모두 확인할 수 없어요.", clueUids);
    }

    const [forwardRow] = candidates;
    if (!rowExchangeRatio(forwardRow, forwardRow.paymentResource)) {
      return unsupported("단서와 이벤트 포인트의 교환 비율을 확인할 수 없어요.", clueUids);
    }
    pointResources.set(resourceKey(forwardRow.paymentResource), forwardRow.paymentResource);
    forwardRows.set(clueKey, forwardRow);
  }

  if (pointResources.size !== 1) {
    return unsupported("단서 교환에 사용되는 이벤트 포인트가 하나로 일치하지 않아요.", clueUids);
  }

  const pointResourceIdentity = [...pointResources.values()][0];
  if (!pointResourceIdentity) {
    return unsupported("이벤트 포인트 리소스를 확인할 수 없어요.", clueUids);
  }
  let pointResource: ShopResource["resource"] | undefined;
  const pointPerClue: Record<string, number> = {};
  const rules: ClueSearchExchangeRule[] = [];

  for (const clue of clueRefs) {
    const clueKey = resourceKey(clue);
    const forwardRow = forwardRows.get(clueKey);
    if (!forwardRow) {
      return unsupported("단서 교환 행을 확인할 수 없어요.", clueUids);
    }

    const reverseCandidates = shopResources.filter(
      (shopResource) =>
        shopResource.resource.uid === pointResourceIdentity.uid &&
        shopResource.resource.type === pointResourceIdentity.type &&
        shopResource.paymentResource.uid === clue.uid &&
        shopResource.paymentResource.type === clue.type,
    );
    if (reverseCandidates.length !== 1) {
      return unsupported("단서 환급 행이 일부 누락되었거나 중복되어 있어요.", clueUids);
    }

    const [reverseRow] = reverseCandidates;
    if (!rowExchangeRatio(reverseRow, clue)) {
      return unsupported("단서 환급 행의 교환 비율을 확인할 수 없어요.", clueUids);
    }
    const forwardRatio = rowExchangeRatio(forwardRow, pointResourceIdentity)?.ratio;
    const reverseRatio = rowExchangeRatio(reverseRow, clue)?.ratio;
    if (
      forwardRatio === undefined ||
      reverseRatio === undefined ||
      !approximatelyEqual(forwardRatio * reverseRatio, 1)
    ) {
      return unsupported("단서와 이벤트 포인트의 교환 비율이 서로 일치하지 않아요.", clueUids);
    }

    if (!pointResource) {
      pointResource = reverseRow.resource;
    } else if (pointResource.uid !== reverseRow.resource.uid || pointResource.type !== reverseRow.resource.type) {
      return unsupported("이벤트 포인트 리소스가 서로 일치하지 않아요.", clueUids);
    }

    const firstTier = reverseRow.purchaseTiers[0];
    if (firstTier === undefined || firstTier.unitPrice <= 0 || reverseRow.resourceAmount <= 0) {
      return unsupported("단서 교환 수량을 확인할 수 없어요.", clueUids);
    }

    pointPerClue[clueKey] = reverseRatio;
    rules.push({
      clueType: clue.type,
      clueUid: clue.uid,
      clueName: forwardRow.resource.name || clue.name,
      pointAmount: reverseRow.resourceAmount,
      clueAmount: firstTier.unitPrice,
      pointPerClue: reverseRatio,
    });
    reverseRows.set(clueKey, reverseRow);
  }

  if (!pointResource) {
    return unsupported("이벤트 포인트 리소스를 확인할 수 없어요.", clueUids);
  }

  return {
    supported: true,
    clueUids,
    pointResource,
    rules,
    pointPerClue,
    hiddenShopResourceUids: [
      ...new Set([...forwardRows.values(), ...reverseRows.values()].map((shopResource) => shopResource.uid)),
    ],
  };
}

export function filterClueSearchShopResources(
  shopResources: ShopResource[],
  exchange: ClueSearchExchange | null,
): ShopResource[] {
  if (!exchange?.supported || exchange.hiddenShopResourceUids.length === 0) {
    return shopResources;
  }

  const hidden = new Set(exchange.hiddenShopResourceUids);
  return shopResources.filter((shopResource) => !hidden.has(shopResource.uid));
}

export function getClueSearchExchangeRates(exchange: ClueSearchExchange | null): ClueSearchExchangeRate[] {
  if (!exchange?.supported) {
    return [];
  }

  return [
    ...new Map(
      exchange.rules.map((rule) => [
        `${rule.pointAmount}:${rule.clueAmount}`,
        { pointAmount: rule.pointAmount, clueAmount: rule.clueAmount },
      ]),
    ).values(),
  ];
}

export function convertClueSearchCostsToPoints(
  costs: {
    resourceType: ShopResource["resource"]["type"];
    resourceUid: string;
    resourceName?: string;
    quantity: number;
  }[],
  exchange: ClueSearchExchange | null,
): { resourceType: ShopResource["resource"]["type"]; resourceUid: string; resourceName?: string; quantity: number }[] {
  if (!exchange?.supported || !exchange.pointResource) {
    return costs;
  }

  const pointRates = costs.map(
    (cost) => exchange.pointPerClue[resourceKey({ type: cost.resourceType, uid: cost.resourceUid })],
  );
  if (pointRates.some((rate) => rate === undefined)) {
    return costs;
  }

  const pointQuantity = costs.reduce((total, cost, index) => total + cost.quantity * (pointRates[index] ?? 0), 0);
  if (pointQuantity === 0) {
    return [];
  }

  return [
    {
      resourceType: exchange.pointResource.type,
      resourceUid: exchange.pointResource.uid,
      resourceName: exchange.pointResource.name,
      quantity: Number(pointQuantity.toFixed(9)),
    },
  ];
}

export function normalizeClueSearchRoundRange(startRound: number, endRound: number): ClueSearchRoundRange {
  const start = Number.isFinite(startRound) ? Math.max(1, Math.floor(startRound)) : 1;
  const end = Number.isFinite(endRound) ? Math.max(0, Math.floor(endRound)) : 0;
  return { startRound: start, endRound: end };
}

export function clueSearchRoundCount(startRound: number, endRound: number): number {
  const range = normalizeClueSearchRoundRange(startRound, endRound);
  return range.endRound >= range.startRound ? range.endRound - range.startRound + 1 : 0;
}

function matchesRound(
  group: MinigameConfig["rewardGroups"][number],
  round: number,
  specifiedRounds: Set<number>,
): boolean {
  if (Array.isArray(group.rounds)) {
    return group.rounds.includes(round);
  }
  if (group.rounds === "subsequent") {
    return !specifiedRounds.has(round);
  }
  if ("gte" in group.rounds) {
    return round >= group.rounds.gte;
  }
  return group.rounds.remainders.includes(round % group.rounds.divisor);
}

function aggregateResources<
  T extends {
    resourceType: ShopResource["resource"]["type"];
    resourceUid: string;
    quantity: number;
    resourceName?: string;
    rarity?: number;
  },
>(resources: T[]): T[] {
  const totals = new Map<string, T>();
  for (const resource of resources) {
    const key = `${resource.resourceType}:${resource.resourceUid}:${resource.rarity ?? ""}`;
    const existing = totals.get(key);
    if (existing) {
      existing.quantity += resource.quantity;
    } else {
      totals.set(key, { ...resource });
    }
  }
  return [...totals.values()];
}

function isGteRoundGroup(
  group: MinigameConfig["rewardGroups"][number],
): group is MinigameConfig["rewardGroups"][number] & {
  rounds: { gte: number };
} {
  return typeof group.rounds === "object" && "gte" in group.rounds;
}

function getAppliedRoundCountForRange(
  group: MinigameConfig["rewardGroups"][number],
  startRound: number,
  endRound: number,
  specifiedRounds: Set<number>,
): number {
  return (
    getAppliedRoundCount(group, endRound, specifiedRounds) -
    getAppliedRoundCount(group, startRound - 1, specifiedRounds)
  );
}

function buildRoundDetail(
  round: number,
  groups: MinigameConfig["rewardGroups"],
  loopCount?: number,
): ClueSearchRoundDetail {
  return {
    round,
    ...(loopCount === undefined ? {} : { loopCount }),
    clues: aggregateResources(
      groups.flatMap((group) =>
        group.payments.map((payment) => ({
          resourceType: payment.resourceType,
          resourceUid: payment.resourceUid,
          resourceName: payment.resourceName,
          quantity: payment.quantityExpected,
        })),
      ),
    ),
    rewards: aggregateResources(groups.flatMap((group) => group.rewards)),
  };
}

export function getClueSearchOneTimeRounds(config: MinigameConfig): number[] {
  return [
    ...new Set(
      config.rewardGroups
        .flatMap((group) => (Array.isArray(group.rounds) ? group.rounds : []))
        .sort((left, right) => left - right),
    ),
  ];
}

export function getClueSearchOneTimeRange(config: MinigameConfig): ClueSearchRoundRange | null {
  const rounds = getClueSearchOneTimeRounds(config);
  if (rounds.length === 0) {
    return null;
  }

  return { startRound: rounds[0], endRound: rounds[rounds.length - 1] };
}

export function getClueSearchLoopRound(config: MinigameConfig): number | null {
  const loopGroup = config.rewardGroups.find((group) => typeof group.rounds === "object" && "gte" in group.rounds);
  return loopGroup && typeof loopGroup.rounds === "object" && "gte" in loopGroup.rounds ? loopGroup.rounds.gte : null;
}

export function getClueSearchRoundDetails(
  config: MinigameConfig,
  startRound: number,
  endRound: number,
): ClueSearchRoundDetail[] {
  const range = normalizeClueSearchRoundRange(startRound, endRound);
  if (range.endRound < range.startRound) {
    return [];
  }

  const specifiedRounds = getSpecifiedRounds(config.rewardGroups);
  const details: ClueSearchRoundDetail[] = [];
  const oneTimeRounds = getClueSearchOneTimeRounds(config).filter(
    (round) => round >= range.startRound && round <= range.endRound,
  );

  for (const round of oneTimeRounds) {
    const groups = config.rewardGroups.filter(
      (group) => !isGteRoundGroup(group) && matchesRound(group, round, specifiedRounds),
    );
    if (groups.length > 0) {
      details.push(buildRoundDetail(round, groups));
    }
  }

  for (const group of config.rewardGroups.filter(isGteRoundGroup)) {
    const loopCount = getAppliedRoundCountForRange(group, range.startRound, range.endRound, specifiedRounds);
    if (loopCount > 0) {
      details.push(buildRoundDetail(Math.max(group.rounds.gte, range.startRound), [group], loopCount));
    }
  }

  return details.sort((left, right) => left.round - right.round);
}
