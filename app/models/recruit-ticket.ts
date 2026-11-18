import { drizzle } from "drizzle-orm/node-postgres";
import { pgRecruitTicketsTable } from "~/db/postgres/schema";
import type {
  RecruitTicketItemSource,
  RecruitTicketPoolSource,
  RecruitTicketProductSource,
  RecruitTicketSelection,
  RecruitTicketSource,
} from "~/domain/recruit-tickets";
import { graphql } from "~/graphql";
import type {
  RecruitTicketPoolsQuery,
  RecruitTicketProductItemsQuery,
  RecruitTicketProductsQuery,
} from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "~/lib/cache";
import { toUtcIso } from "~/lib/date-time";
import { withPostgresClient } from "~/lib/postgres.server";

const RECRUIT_TICKET_SOURCE_CACHE_KEY = cacheKey("source", "recruit-ticket", 2, "gl");
const PRODUCT_PAGE_SIZE = 100;
// Every GL product (some hundreds) in one request where possible, so the source stays within the regeneration deadline.
const PRODUCT_ITEMS_PAGE_SIZE = 1000;
const ITEM_QUERY_CHUNK_SIZE = 200;

const recruitTicketProductsQuery = graphql(`
  query RecruitTicketProducts($endAfter: ISO8601DateTime, $after: String, $first: Int) {
    shopProducts(region: gl, endAfter: $endAfter, after: $after, first: $first) {
      nodes {
        uid
        clientUid
        name
        startAt
        endAt
        endType
        contents { rewardType rewardUid }
        studentPools { uid clientUid itemUid sourceType startAt endAt entries { studentUid } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`);

const recruitTicketProductItemsQuery = graphql(`
  query RecruitTicketProductItems($after: String, $first: Int) {
    shopProducts(region: gl, after: $after, first: $first) {
      nodes { clientUid contents { rewardType rewardUid } }
      pageInfo { hasNextPage endCursor }
    }
  }
`);

const recruitTicketPoolsQuery = graphql(`
  query RecruitTicketPools($openAfter: ISO8601DateTime) {
    itemStudentPools(region: gl, openAfter: $openAfter) {
      uid clientUid itemUid sourceType startAt endAt entries { studentUid }
    }
  }
`);

const recruitTicketItemsQuery = graphql(`
  query RecruitTicketItems($uids: [String!]) {
    items(uids: $uids) { uid name gachaTicketType imageUrl(region: gl) expiresAt(region: gl) }
  }
`);

type PoolNode = RecruitTicketPoolsQuery["itemStudentPools"][number];

function optionalInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toUtcIso(value as string | Date);
}

// A pool without clientUid is an operator's candidate for a planned product, not a pool the client gives.
function normalizePool(pool: PoolNode): RecruitTicketPoolSource | null {
  if (pool.clientUid === null) return null;
  return {
    uid: pool.uid,
    itemUid: pool.itemUid,
    sourceType: pool.sourceType,
    startAt: optionalInstant(pool.startAt),
    endAt: optionalInstant(pool.endAt),
    studentUids: pool.entries.map((entry) => entry.studentUid),
  };
}

async function readProducts(endAfter: Date): Promise<RecruitTicketProductSource[]> {
  const products: RecruitTicketProductSource[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await runQuery(recruitTicketProductsQuery, { endAfter, after, first: PRODUCT_PAGE_SIZE });
    if (error) throw error;
    if (!data) throw new Error("BAQL shop products response is missing data");
    const page: RecruitTicketProductsQuery["shopProducts"] = data.shopProducts;
    for (const node of page.nodes) {
      // Planned products (no clientUid) are not in the client yet.
      if (node.clientUid === null) continue;
      const pools = node.studentPools.flatMap((pool) => normalizePool(pool) ?? []);
      if (pools.length === 0) continue;
      products.push({
        uid: node.uid,
        name: node.name?.trim() || null,
        startAt: optionalInstant(node.startAt),
        endAt: node.endType === "scheduled" ? optionalInstant(node.endAt) : null,
        contents: node.contents
          .filter((content) => content.rewardType === "item")
          .map((content) => ({ itemUid: content.rewardUid })),
        pools,
      });
    }
    const { hasNextPage, endCursor } = page.pageInfo;
    if (!hasNextPage) return products;
    if (!endCursor) throw new Error("BAQL shop products page is missing its end cursor");
    after = endCursor;
  }
}

// Items any GL client product gives, ended products included. Planned products (no clientUid) are left out.
async function readProductItemUids(): Promise<string[]> {
  const itemUids = new Set<string>();
  let after: string | null = null;
  for (;;) {
    const { data, error } = await runQuery(recruitTicketProductItemsQuery, { after, first: PRODUCT_ITEMS_PAGE_SIZE });
    if (error) throw error;
    if (!data) throw new Error("BAQL shop product items response is missing data");
    const page: RecruitTicketProductItemsQuery["shopProducts"] = data.shopProducts;
    for (const node of page.nodes) {
      if (node.clientUid === null) continue;
      for (const content of node.contents) if (content.rewardType === "item") itemUids.add(content.rewardUid);
    }
    const { hasNextPage, endCursor } = page.pageInfo;
    if (!hasNextPage) return [...itemUids].sort();
    if (!endCursor) throw new Error("BAQL shop product items page is missing its end cursor");
    after = endCursor;
  }
}

async function readPools(openAfter: Date): Promise<RecruitTicketPoolSource[]> {
  const { data, error } = await runQuery(recruitTicketPoolsQuery, { openAfter });
  if (error) throw error;
  if (!data || !Array.isArray(data.itemStudentPools)) throw new Error("BAQL item student pools response is missing");
  return data.itemStudentPools.flatMap((pool) => normalizePool(pool) ?? []);
}

async function readItems(uids: string[]): Promise<Record<string, RecruitTicketItemSource>> {
  const items: Record<string, RecruitTicketItemSource> = {};
  for (let index = 0; index < uids.length; index += ITEM_QUERY_CHUNK_SIZE) {
    const chunk = uids.slice(index, index + ITEM_QUERY_CHUNK_SIZE);
    const { data, error } = await runQuery(recruitTicketItemsQuery, { uids: chunk });
    if (error) throw error;
    if (!data || !Array.isArray(data.items)) throw new Error("BAQL items response is missing items");
    for (const item of data.items) {
      const name = item.name.trim();
      if (!name) throw new Error(`BAQL item ${item.uid} is missing its name`);
      items[item.uid] = {
        uid: item.uid,
        name,
        gachaTicketType: item.gachaTicketType,
        imageUrl: item.imageUrl?.trim() || null,
        expiresAt: optionalInstant(item.expiresAt),
      };
    }
  }
  return items;
}

// GL products on sale now or later, the pools open now or later, the items they give, and the items any GL product gives.
// An item BAQL does not have is absent from `items`.
export async function getRecruitTicketSource(env: Env, forceRefresh = false): Promise<RecruitTicketSource> {
  return fetchSourceCached(
    env,
    RECRUIT_TICKET_SOURCE_CACHE_KEY,
    async () => {
      const now = new Date();
      const [products, pools, productItemUids] = await Promise.all([
        readProducts(now),
        readPools(now),
        readProductItemUids(),
      ]);
      const itemUids = [
        ...new Set([
          ...products.flatMap((product) => product.pools.map((pool) => pool.itemUid)),
          ...pools.map((pool) => pool.itemUid),
        ]),
      ].sort();
      return { products, pools, items: await readItems(itemUids), productItemUids };
    },
    forceRefresh,
    { rejectOnForcedRefresh: true },
  );
}

export async function getRecruitTicketSelections(env: Env, ctx?: ExecutionContext): Promise<RecruitTicketSelection[]> {
  return withPostgresClient(
    env,
    async (client) =>
      drizzle(client)
        .select({ productUid: pgRecruitTicketsTable.productUid, itemUid: pgRecruitTicketsTable.itemUid })
        .from(pgRecruitTicketsTable),
    undefined,
    ctx,
  );
}
