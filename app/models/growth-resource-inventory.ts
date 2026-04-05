import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

export const growthResourceInventoryTable = sqliteTable("growth_resource_inventory", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  itemUid: text().notNull(),
  quantity: int().notNull().default(0),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type GrowthResourceInventory = {
  uid: string;
  itemUid: string;
  quantity: number;
};

function toModel(resourceInventory: typeof growthResourceInventoryTable.$inferSelect): GrowthResourceInventory {
  return {
    uid: resourceInventory.uid,
    itemUid: resourceInventory.itemUid,
    quantity: resourceInventory.quantity,
  };
}

function validateGrowthResourceInventoryQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
  }
}

export async function getGrowthResourceInventories(env: Env, userId: number): Promise<GrowthResourceInventory[]> {
  const db = drizzle(env.DB);
  const inventories = await db
    .select()
    .from(growthResourceInventoryTable)
    .where(eq(growthResourceInventoryTable.userId, userId));

  return inventories.map(toModel);
}

export async function getGrowthResourceInventoryMap(env: Env, userId: number): Promise<Record<string, number>> {
  const inventories = await getGrowthResourceInventories(env, userId);
  return inventories.reduce(
    (acc, inventory) => {
      acc[inventory.itemUid] = inventory.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export async function upsertGrowthResourceInventory(env: Env, userId: number, itemUid: string, quantity: number) {
  validateGrowthResourceInventoryQuantity(quantity);

  const db = drizzle(env.DB);
  if (quantity === 0) {
    await db
      .delete(growthResourceInventoryTable)
      .where(and(eq(growthResourceInventoryTable.userId, userId), eq(growthResourceInventoryTable.itemUid, itemUid)));
    return;
  }

  const uid = nanoid(8);
  await db
    .insert(growthResourceInventoryTable)
    .values({ uid, userId, itemUid, quantity })
    .onConflictDoUpdate({
      target: [growthResourceInventoryTable.userId, growthResourceInventoryTable.itemUid],
      set: { quantity, updatedAt: sql`current_timestamp` },
    });
}
