import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgUserResourceInventoryDraftItemsTable, pgUserResourceInventoryDraftsTable } from "~/db/postgres/schema";
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

export type UserResourceInventoryDraftStatus = "pending" | "applied" | "discarded";

export type UserResourceInventoryDraft = {
  uid: string;
  userId: number;
  status: UserResourceInventoryDraftStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  items: UserResourceInventoryDraftItem[];
};

export type UserResourceInventoryDraftItem = {
  uid: string;
  draftUid: string;
  itemUid: string;
  quantity: number;
};

export type UserResourceInventoryDraftInput = {
  itemUid: string;
  quantity: number;
};

export type UserResourceInventoryInput = {
  itemUid: string;
  quantity: number;
};

export const userResourceInventoryDraftsTable = pgUserResourceInventoryDraftsTable;
export const userResourceInventoryDraftItemsTable = pgUserResourceInventoryDraftItemsTable;

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toInventoryModel(resourceInventory: typeof growthResourceInventoryTable.$inferSelect): UserResourceInventory {
  return {
    uid: resourceInventory.uid,
    itemUid: resourceInventory.itemUid,
    quantity: resourceInventory.quantity,
  };
}

function toDraftStatus(status: string): UserResourceInventoryDraftStatus {
  if (status === "pending" || status === "applied" || status === "discarded") return status;
  return "pending";
}

function toDraftItemModel(
  draftItem: typeof userResourceInventoryDraftItemsTable.$inferSelect,
): UserResourceInventoryDraftItem {
  return {
    uid: draftItem.uid,
    draftUid: draftItem.draftUid,
    itemUid: draftItem.itemUid,
    quantity: draftItem.quantity,
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

export async function createUserResourceInventoryDraft(
  env: Env,
  userId: number,
  items: UserResourceInventoryDraftInput[],
): Promise<string> {
  const normalizedItems = normalizeDraftItems(items);
  if (normalizedItems.length === 0) throw new Error("변경된 보유 재화가 없어요");

  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const draftUid = nanoid(12);
    await db.transaction(async (tx) => {
      await tx.insert(userResourceInventoryDraftsTable).values({ uid: draftUid, userId, status: "pending" });
      for (let offset = 0; offset < normalizedItems.length; offset += PG_WRITE_CHUNK_SIZE) {
        const chunk = normalizedItems.slice(offset, offset + PG_WRITE_CHUNK_SIZE);
        await tx
          .insert(userResourceInventoryDraftItemsTable)
          .values(chunk.map((item) => ({ uid: nanoid(8), draftUid, itemUid: item.itemUid, quantity: item.quantity })));
      }
    });
    return draftUid;
  });
}

export async function getUserResourceInventoryDraft(
  env: Env,
  userId: number,
  draftUid: string,
): Promise<UserResourceInventoryDraft | null> {
  return withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const [draft] = await db
      .select()
      .from(userResourceInventoryDraftsTable)
      .where(
        and(eq(userResourceInventoryDraftsTable.uid, draftUid), eq(userResourceInventoryDraftsTable.userId, userId)),
      );
    if (!draft) return null;
    const items = await db
      .select()
      .from(userResourceInventoryDraftItemsTable)
      .where(eq(userResourceInventoryDraftItemsTable.draftUid, draftUid))
      .orderBy(asc(userResourceInventoryDraftItemsTable.id));
    return {
      uid: draft.uid,
      userId: draft.userId,
      status: toDraftStatus(draft.status),
      createdAt: toIso(draft.createdAt) ?? "",
      updatedAt: toIso(draft.updatedAt) ?? "",
      appliedAt: toIso(draft.appliedAt),
      items: items.map(toDraftItemModel),
    };
  });
}

export async function applyUserResourceInventoryDraft(env: Env, userId: number, draftUid: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(userResourceInventoryDraftsTable)
        .where(
          and(eq(userResourceInventoryDraftsTable.uid, draftUid), eq(userResourceInventoryDraftsTable.userId, userId)),
        )
        .for("update");
      if (!draft) throw new Error("Draft를 찾을 수 없어요");
      if (draft.status !== "pending") throw new Error("이미 처리된 Draft예요");
      const items = await tx
        .select()
        .from(userResourceInventoryDraftItemsTable)
        .where(eq(userResourceInventoryDraftItemsTable.draftUid, draftUid))
        .orderBy(asc(userResourceInventoryDraftItemsTable.id));
      await writeInventoryItems(
        tx,
        userId,
        items.map((item) => ({ itemUid: item.itemUid, quantity: item.quantity })),
      );
      const now = new Date();
      await tx
        .update(userResourceInventoryDraftsTable)
        .set({ status: "applied", updatedAt: now, appliedAt: now })
        .where(
          and(
            eq(userResourceInventoryDraftsTable.uid, draftUid),
            eq(userResourceInventoryDraftsTable.userId, userId),
            eq(userResourceInventoryDraftsTable.status, "pending"),
          ),
        );
    });
  });
}

export async function discardUserResourceInventoryDraft(env: Env, userId: number, draftUid: string) {
  await withPostgresClient(env, async (client) => {
    const db = drizzle(client);
    const result = await db
      .update(userResourceInventoryDraftsTable)
      .set({ status: "discarded", updatedAt: new Date() })
      .where(
        and(
          eq(userResourceInventoryDraftsTable.uid, draftUid),
          eq(userResourceInventoryDraftsTable.userId, userId),
          eq(userResourceInventoryDraftsTable.status, "pending"),
        ),
      )
      .returning({ uid: userResourceInventoryDraftsTable.uid });
    if (result.length === 0) {
      const [draft] = await db
        .select({ status: userResourceInventoryDraftsTable.status })
        .from(userResourceInventoryDraftsTable)
        .where(
          and(eq(userResourceInventoryDraftsTable.uid, draftUid), eq(userResourceInventoryDraftsTable.userId, userId)),
        );
      if (!draft) throw new Error("Draft를 찾을 수 없어요");
      throw new Error("이미 처리된 Draft예요");
    }
  });
}

function normalizeDraftItems(items: UserResourceInventoryDraftInput[]): UserResourceInventoryDraftInput[] {
  return normalizeInventoryItems(items);
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
