import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { withPostgresClient } from "~/lib/postgres.server";
import { growthResourceInventoryTable } from "./growth-resource-inventory";

const PG_WRITE_CHUNK_SIZE = 500;
const PG_IN_QUERY_CHUNK_SIZE = 500;
type InventoryDb = Pick<NodePgDatabase, "insert" | "delete">;

export type UserResourceInventory = {
  uid: string;
  itemUid: string;
  quantity: number;
};

export type UserResourceInventoryInput = {
  itemUid: string;
  quantity: number;
};

function toInventoryModel(resourceInventory: typeof growthResourceInventoryTable.$inferSelect): UserResourceInventory {
  return {
    uid: resourceInventory.uid,
    itemUid: resourceInventory.itemUid,
    quantity: resourceInventory.quantity,
  };
}

export function parseUserResourceInventoryQuantity(value: unknown): number {
  if (typeof value === "number") {
    validateUserResourceInventoryQuantity(value);
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    const parsed = Number(trimmed);
    validateUserResourceInventoryQuantity(parsed);
    return parsed;
  }
  throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
}

export function validateUserResourceInventoryQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
  }
}

export async function getUserResourceInventories(env: Env, userId: number): Promise<UserResourceInventory[]> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const inventories = await db
      .select()
      .from(growthResourceInventoryTable)
      .where(eq(growthResourceInventoryTable.userId, userId));
    return inventories.map(toInventoryModel);
  });
}

export async function getUserResourceInventoryMap(env: Env, userId: number): Promise<Record<string, number>> {
  const inventories = await getUserResourceInventories(env, userId);
  return inventories.reduce(
    (acc, inventory) => {
      acc[inventory.itemUid] = inventory.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export async function getUserResourceInventoryMapByItemUids(
  env: Env,
  userId: number,
  itemUids: string[],
): Promise<Record<string, number>> {
  const uniqueItemUids = [...new Set(itemUids)];
  if (uniqueItemUids.length === 0) return {};

  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const inventories: (typeof growthResourceInventoryTable.$inferSelect)[] = [];
    for (let offset = 0; offset < uniqueItemUids.length; offset += PG_IN_QUERY_CHUNK_SIZE) {
      const chunk = uniqueItemUids.slice(offset, offset + PG_IN_QUERY_CHUNK_SIZE);
      inventories.push(
        ...(await db
          .select()
          .from(growthResourceInventoryTable)
          .where(
            and(eq(growthResourceInventoryTable.userId, userId), inArray(growthResourceInventoryTable.itemUid, chunk)),
          )),
      );
    }
    return inventories.reduce(
      (acc, inventory) => {
        acc[inventory.itemUid] = inventory.quantity;
        return acc;
      },
      {} as Record<string, number>,
    );
  });
}

export async function upsertUserResourceInventory(env: Env, userId: number, itemUid: string, quantity: number) {
  validateUserResourceInventoryQuantity(quantity);
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await writeInventoryItems(db, userId, [{ itemUid, quantity }]);
  });
}

export async function upsertUserResourceInventories(env: Env, userId: number, items: UserResourceInventoryInput[]) {
  const normalizedItems = normalizeInventoryItems(items);
  if (normalizedItems.length === 0) return;
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      await writeInventoryItems(tx, userId, normalizedItems);
    });
  });
}

function normalizeInventoryItems(items: UserResourceInventoryInput[]): UserResourceInventoryInput[] {
  const itemMap = new Map<string, number>();
  for (const item of items) {
    const itemUid = item.itemUid.trim();
    if (!itemUid) continue;
    validateUserResourceInventoryQuantity(item.quantity);
    itemMap.set(itemUid, item.quantity);
  }
  return [...itemMap.entries()].map(([itemUid, quantity]) => ({ itemUid, quantity }));
}

async function writeInventoryItems(db: InventoryDb, userId: number, items: UserResourceInventoryInput[]) {
  const deletes = items.filter((item) => item.quantity <= 0).map((item) => item.itemUid);
  for (let offset = 0; offset < deletes.length; offset += PG_WRITE_CHUNK_SIZE) {
    const chunk = deletes.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
    await db
      .delete(growthResourceInventoryTable)
      .where(
        and(eq(growthResourceInventoryTable.userId, userId), inArray(growthResourceInventoryTable.itemUid, chunk)),
      );
  }

  const inserts = items.filter((item) => item.quantity > 0);
  for (let offset = 0; offset < inserts.length; offset += PG_WRITE_CHUNK_SIZE) {
    const chunk = inserts.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
    await db
      .insert(growthResourceInventoryTable)
      .values(chunk.map((item) => ({ uid: nanoid(8), userId, itemUid: item.itemUid, quantity: item.quantity })))
      .onConflictDoUpdate({
        target: [growthResourceInventoryTable.userId, growthResourceInventoryTable.itemUid],
        set: { quantity: sql`excluded.quantity`, updatedAt: new Date() },
      });
  }
}
