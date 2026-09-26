import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgUserFurnitureInventoryTable } from "~/db/postgres/schema";
import { withPostgresClient } from "~/lib/postgres.server";

export type UserFurnitureInventoryInput = {
  furnitureUid: string;
  quantity: number;
};

export const MAX_USER_FURNITURE_INVENTORY_QUANTITY = 2_147_483_647;
export const USER_FURNITURE_INVENTORY_QUANTITY_ERROR = "보유 수량은 0 이상 2,147,483,647 이하의 정수로 입력해 주세요.";

export function parseUserFurnitureInventoryQuantity(value: unknown): number {
  if (typeof value === "number" && isValidQuantity(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const quantity = Number(value.trim());
    if (isValidQuantity(quantity)) return quantity;
  }
  throw new Error(USER_FURNITURE_INVENTORY_QUANTITY_ERROR);
}

export async function getUserFurnitureInventoryMap(env: Env, userId: number): Promise<Record<string, number>> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const inventories = await db
      .select({
        furnitureUid: pgUserFurnitureInventoryTable.furnitureUid,
        quantity: pgUserFurnitureInventoryTable.quantity,
      })
      .from(pgUserFurnitureInventoryTable)
      .where(eq(pgUserFurnitureInventoryTable.userId, userId));
    return Object.fromEntries(inventories.map(({ furnitureUid, quantity }) => [furnitureUid, quantity]));
  });
}

export async function saveUserFurnitureInventory(
  env: Env,
  userId: number,
  item: UserFurnitureInventoryInput,
): Promise<void> {
  validateInput(item);
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db
      .insert(pgUserFurnitureInventoryTable)
      .values({
        uid: nanoid(8),
        userId,
        furnitureUid: item.furnitureUid,
        quantity: item.quantity,
      })
      .onConflictDoUpdate({
        target: [pgUserFurnitureInventoryTable.userId, pgUserFurnitureInventoryTable.furnitureUid],
        set: { quantity: item.quantity, updatedAt: new Date() },
      });
  });
}

function validateInput(item: UserFurnitureInventoryInput): void {
  if (item.furnitureUid.trim().length === 0) throw new Error("가구 정보가 필요해요");
  if (!isValidQuantity(item.quantity)) {
    throw new Error(USER_FURNITURE_INVENTORY_QUANTITY_ERROR);
  }
}

function isValidQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= MAX_USER_FURNITURE_INVENTORY_QUANTITY;
}
