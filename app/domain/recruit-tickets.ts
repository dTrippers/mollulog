import { getInstantTime, type UtcIsoString } from "~/lib/date-time";

// Recruitment ticket cards for the 상품 / 패키지 › 모집권 tab. A card is a ticket in a product (one per product and ticket
// item), or tickets no product gives that share a name and target students. Only the cards an operator chose to show
// (see the recruit_tickets table) reach the tab.

export type RecruitTicketKind = "select" | "fixed";

// BAQL Item.gachaTicketType labels (snake-cased client GachaTicketType) of the tickets the tab shows. A 선택권 lets the
// player pick one target student; a 확정권 gives at least one ★3 target student without a pick.
export const RECRUIT_TICKET_KIND_BY_GACHA_TICKET_TYPE: Readonly<Record<string, RecruitTicketKind>> = {
  select_recruit: "select",
  package_three_star: "fixed",
  three_star: "fixed",
  start_dash: "fixed",
  package_limited_three_star: "fixed",
  package_property_three_star: "fixed",
  package_academy_three_star: "fixed",
  package_three_star_r88_explosion: "fixed",
  package_three_star_r88_pierce: "fixed",
  package_three_star_r88_mystic: "fixed",
  package_three_star_r88_sonic: "fixed",
};

export const RECRUIT_TICKET_KIND_COPY: Readonly<Record<RecruitTicketKind, { label: string; description: string }>> = {
  select: { label: "선택권", description: "대상 학생 중 한 명을 골라 모집합니다." },
  fixed: {
    label: "확정권",
    description: "대상 ★3 학생이 1명 이상 확정으로 나옵니다. 대상 학생을 선택할 수는 없습니다.",
  },
};

export function recruitTicketKindOf(gachaTicketType: string | null): RecruitTicketKind | null {
  if (gachaTicketType === null) return null;
  return Object.hasOwn(RECRUIT_TICKET_KIND_BY_GACHA_TICKET_TYPE, gachaTicketType)
    ? RECRUIT_TICKET_KIND_BY_GACHA_TICKET_TYPE[gachaTicketType]
    : null;
}

export type RecruitTicketPoolSource = {
  uid: string;
  itemUid: string;
  // `banner`: a ticket banner, open for its sale. `selection`: the selection recipe the item opens.
  sourceType: string;
  startAt: UtcIsoString | null;
  endAt: UtcIsoString | null;
  studentUids: string[];
};

export type RecruitTicketProductContentSource = {
  itemUid: string;
};

export type RecruitTicketProductSource = {
  uid: string;
  name: string | null;
  startAt: UtcIsoString | null;
  // The sale end for a product sold until a fixed time; null for a product without one.
  endAt: UtcIsoString | null;
  contents: RecruitTicketProductContentSource[];
  pools: RecruitTicketPoolSource[];
};

export type RecruitTicketItemSource = {
  uid: string;
  name: string;
  gachaTicketType: string | null;
  imageUrl: string | null;
  // The last time a held ticket can be used; null for one that never expires.
  expiresAt: UtcIsoString | null;
};

export type RecruitTicketSource = {
  products: RecruitTicketProductSource[];
  // Pools of every item, open at or after the time the source was read.
  pools: RecruitTicketPoolSource[];
  items: Record<string, RecruitTicketItemSource>;
  // Items any GL client product gives, whether or not it is still on sale. Such a ticket only gets product cards.
  productItemUids: string[];
};

export type RecruitTicketStudentSource = {
  uid: string;
  name: string;
  initialTier: number;
  order: number;
};

export type RecruitTicketSelection = {
  productUid: string | null;
  itemUid: string;
};

export type RecruitTicketCardStudent = {
  uid: string;
  name: string;
  unrecruited: boolean;
  // The Sensei's tier (1-5 stars, then 6-9 for exclusive weapon 1-4); null when not recruited or signed out.
  tier: number | null;
};

export type RecruitTicketCard = {
  key: string;
  kind: RecruitTicketKind;
  title: string;
  product: { uid: string; name: string } | null;
  iconUrl: string | null;
  iconItemUid: string;
  // A product card's sale period; null on a card outside products.
  periodStartAt: UtcIsoString | null;
  periodEndAt: UtcIsoString | null;
  // A card outside products: the last time its tickets can be used, null when one never expires. Null on a product card.
  usableUntil: UtcIsoString | null;
  // When the current target students stop being the targets while the ticket stays on sale or in use.
  targetsChangeAt: UtcIsoString | null;
  students: RecruitTicketCardStudent[];
};

export type RecruitTicketCardProblem = { key: string; reason: string };

export type RecruitTicketCardsResult = {
  cards: RecruitTicketCard[];
  // Cards an operator chose but that cannot be shown, for logging.
  problems: RecruitTicketCardProblem[];
};

type CurrentPools = {
  pools: RecruitTicketPoolSource[];
};

type Candidate = Omit<RecruitTicketCard, "students" | "iconUrl" | "iconItemUid"> & {
  itemUids: string[];
  studentUids: string[];
};

type ItemGroup = Omit<Candidate, "key" | "usableUntil" | "targetsChangeAt"> & {
  // The end of the first item's current pools, for the target change notice.
  poolsEndAt: UtcIsoString | null;
};

function time(instant: UtcIsoString): number {
  return getInstantTime(instant);
}

function minInstant(values: Array<UtcIsoString | null>): UtcIsoString | null {
  let result: UtcIsoString | null = null;
  for (const value of values) {
    if (value !== null && (result === null || time(value) < time(result))) result = value;
  }
  return result;
}

// The pools that give the ticket's students at `at`: those open then, or else the next ones to open. Null when every
// pool has closed.
export function selectCurrentPools(pools: RecruitTicketPoolSource[], at: number): CurrentPools | null {
  const open = pools.filter(
    (pool) => (pool.startAt === null || time(pool.startAt) <= at) && (pool.endAt === null || at < time(pool.endAt)),
  );
  if (open.length > 0) return { pools: open };

  const upcoming = pools.filter((pool) => pool.startAt !== null && time(pool.startAt) > at);
  const nextStart = minInstant(upcoming.map((pool) => pool.startAt));
  if (nextStart === null) return null;
  return { pools: upcoming.filter((pool) => pool.startAt === nextStart) };
}

function unionStudentUids(pools: RecruitTicketPoolSource[]): string[] {
  return [...new Set(pools.flatMap((pool) => pool.studentUids))];
}

// The time the current targets may change, shown only when the ticket outlasts the current pools: a product still on
// sale after they close, or a ticket outside products still usable then. A null card end never ends.
function targetsChangeAt(poolsEndAt: UtcIsoString | null, cardEndAt: UtcIsoString | null): UtcIsoString | null {
  if (poolsEndAt === null) return null;
  if (cardEndAt !== null && time(cardEndAt) <= time(poolsEndAt)) return null;
  return poolsEndAt;
}

function poolsEndAtOf(current: CurrentPools): UtcIsoString | null {
  return minInstant(current.pools.map((pool) => pool.endAt));
}

// The latest expiry of the items, or null when one of them never expires.
function lastUsableAt(itemUids: string[], items: Record<string, RecruitTicketItemSource>): UtcIsoString | null {
  let result: UtcIsoString | null = null;
  for (const itemUid of itemUids) {
    const expiresAt = items[itemUid]?.expiresAt ?? null;
    if (expiresAt === null) return null;
    if (result === null || time(expiresAt) > time(result)) result = expiresAt;
  }
  return result;
}

function compareUid(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

function productCandidates(
  source: RecruitTicketSource,
  now: number,
  problems: RecruitTicketCardProblem[],
  wanted: (key: string) => boolean,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const product of source.products) {
    if (product.endAt !== null && time(product.endAt) <= now) continue;
    const itemUids = [...new Set(product.contents.map((content) => content.itemUid))];
    for (const itemUid of itemUids) {
      const key = productCardKey(product.uid, itemUid);
      const pools = product.pools.filter((pool) => pool.itemUid === itemUid);
      if (pools.length === 0) continue;
      const item = source.items[itemUid];
      if (!item) {
        if (wanted(key)) problems.push({ key, reason: `item ${itemUid} is missing from BAQL` });
        continue;
      }
      const kind = recruitTicketKindOf(item.gachaTicketType);
      if (kind === null) {
        if (wanted(key))
          problems.push({ key, reason: `item ${itemUid} has no shown ticket type (${item.gachaTicketType})` });
        continue;
      }
      if (product.name === null) {
        if (wanted(key)) problems.push({ key, reason: `product ${product.uid} has no name` });
        continue;
      }
      const at = product.startAt === null ? now : Math.max(now, time(product.startAt));
      const current = selectCurrentPools(pools, at);
      if (current === null) continue;

      candidates.push({
        key,
        kind,
        title: item.name,
        product: { uid: product.uid, name: product.name },
        periodStartAt: product.startAt,
        periodEndAt: product.endAt,
        usableUntil: null,
        targetsChangeAt: targetsChangeAt(poolsEndAtOf(current), product.endAt),
        itemUids: [itemUid],
        studentUids: unionStudentUids(current.pools),
      });
    }
  }
  return candidates;
}

function itemCandidates(
  source: RecruitTicketSource,
  now: number,
  problems: RecruitTicketCardProblem[],
  wantedItem: (itemUid: string) => boolean,
): Candidate[] {
  // A ticket a product gives gets product cards only, also after the product's sale has ended.
  const productItemUids = new Set(source.productItemUids);
  const poolsByItem = new Map<string, RecruitTicketPoolSource[]>();
  for (const pool of source.pools) {
    if (productItemUids.has(pool.itemUid)) continue;
    const pools = poolsByItem.get(pool.itemUid) ?? [];
    pools.push(pool);
    poolsByItem.set(pool.itemUid, pools);
  }

  const byGroup = new Map<string, ItemGroup>();
  for (const [itemUid, pools] of [...poolsByItem].sort(([a], [b]) => compareUid(a, b))) {
    const current = selectCurrentPools(pools, now);
    if (current === null) continue;
    const item = source.items[itemUid];
    if (!item) {
      if (wantedItem(itemUid))
        problems.push({ key: itemCardKey([itemUid]), reason: `item ${itemUid} is missing from BAQL` });
      continue;
    }
    const kind = recruitTicketKindOf(item.gachaTicketType);
    if (kind === null) {
      if (wantedItem(itemUid)) {
        problems.push({
          key: itemCardKey([itemUid]),
          reason: `item ${itemUid} has no shown ticket type (${item.gachaTicketType})`,
        });
      }
      continue;
    }
    // An expired ticket cannot be used any more, so it is left out without a problem.
    if (item.expiresAt !== null && time(item.expiresAt) <= now) continue;

    const studentUids = unionStudentUids(current.pools).sort(compareUid);
    const groupKey = JSON.stringify([kind, item.name, studentUids]);
    const existing = byGroup.get(groupKey);
    if (existing) {
      existing.itemUids.push(itemUid);
      continue;
    }
    byGroup.set(groupKey, {
      kind,
      title: item.name,
      product: null,
      periodStartAt: null,
      periodEndAt: null,
      poolsEndAt: poolsEndAtOf(current),
      itemUids: [itemUid],
      studentUids,
    });
  }

  return [...byGroup.values()].map(({ poolsEndAt, ...group }) => {
    const usableUntil = lastUsableAt(group.itemUids, source.items);
    return {
      ...group,
      key: itemCardKey(group.itemUids),
      usableUntil,
      targetsChangeAt: targetsChangeAt(poolsEndAt, usableUntil),
    };
  });
}

export function productCardKey(productUid: string, itemUid: string): string {
  return `product:${productUid}:${itemUid}`;
}

export function itemCardKey(itemUids: string[]): string {
  return `item:${[...itemUids].sort(compareUid).join(",")}`;
}

function compareCards(a: Candidate, b: Candidate): number {
  // Product cards with a sale start come first, by start; the other cards follow, the ones usable for the shortest
  // time first and the ones that never expire last.
  if ((a.periodStartAt === null) !== (b.periodStartAt === null)) return a.periodStartAt === null ? 1 : -1;
  if (a.periodStartAt !== null && b.periodStartAt !== null) {
    const diff = time(a.periodStartAt) - time(b.periodStartAt);
    if (diff !== 0) return diff;
  } else if ((a.usableUntil === null) !== (b.usableUntil === null)) {
    return a.usableUntil === null ? 1 : -1;
  } else if (a.usableUntil !== null && b.usableUntil !== null) {
    const diff = time(a.usableUntil) - time(b.usableUntil);
    if (diff !== 0) return diff;
  }
  const title = a.title.localeCompare(b.title, "ko");
  if (title !== 0) return title;
  return compareUid(a.key, b.key);
}

export function buildRecruitTicketCards({
  source,
  students,
  selections,
  recruitedTiers,
  now,
}: {
  source: RecruitTicketSource;
  students: ReadonlyMap<string, RecruitTicketStudentSource>;
  selections: RecruitTicketSelection[];
  // The Sensei's recruited students and their tiers. Null when signed out: no student is marked as not recruited.
  recruitedTiers: ReadonlyMap<string, number> | null;
  now: UtcIsoString;
}): RecruitTicketCardsResult {
  const nowTime = time(now);
  const selectedProductKeys = new Set(
    selections.flatMap((selection) =>
      selection.productUid === null ? [] : [productCardKey(selection.productUid, selection.itemUid)],
    ),
  );
  const selectedItems = new Set(
    selections.flatMap((selection) => (selection.productUid === null ? [selection.itemUid] : [])),
  );
  const problems: RecruitTicketCardProblem[] = [];
  const candidates = [
    ...productCandidates(source, nowTime, problems, (key) => selectedProductKeys.has(key)),
    ...itemCandidates(source, nowTime, problems, (itemUid) => selectedItems.has(itemUid)),
  ];

  const cards: RecruitTicketCard[] = [];
  for (const candidate of candidates.sort(compareCards)) {
    const shownItemUids =
      candidate.product === null
        ? candidate.itemUids.filter((itemUid) => selectedItems.has(itemUid))
        : selectedProductKeys.has(candidate.key)
          ? candidate.itemUids
          : [];
    if (shownItemUids.length === 0) continue;

    const missing = candidate.studentUids.filter((uid) => !students.has(uid));
    if (missing.length > 0) {
      problems.push({ key: candidate.key, reason: `students missing from the catalog: ${missing.join(", ")}` });
      continue;
    }
    const targets = candidate.studentUids
      .map((uid) => students.get(uid) as RecruitTicketStudentSource)
      .filter((student) => candidate.kind !== "fixed" || student.initialTier === 3);
    if (targets.length === 0) {
      problems.push({ key: candidate.key, reason: "no target students" });
      continue;
    }

    const iconItemUid = [...shownItemUids].sort(compareUid)[0];
    const { itemUids: _itemUids, studentUids: _studentUids, ...card } = candidate;
    cards.push({
      ...card,
      iconItemUid,
      iconUrl: source.items[iconItemUid]?.imageUrl ?? null,
      students: orderStudents(targets, recruitedTiers),
    });
  }
  return { cards, problems };
}

// Students the Sensei has not recruited come first; each group follows the student catalog order, newest first.
function orderStudents(
  targets: RecruitTicketStudentSource[],
  recruitedTiers: ReadonlyMap<string, number> | null,
): RecruitTicketCardStudent[] {
  const byOrder = [...targets].sort((a, b) => b.order - a.order || compareUid(a.uid, b.uid));
  const students = byOrder.map((student) => ({
    uid: student.uid,
    name: student.name,
    unrecruited: recruitedTiers !== null && !recruitedTiers.has(student.uid),
    tier: recruitedTiers?.get(student.uid) ?? null,
  }));
  return [...students.filter((student) => student.unrecruited), ...students.filter((student) => !student.unrecruited)];
}
