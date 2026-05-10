import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { growthResourceInventoryTable } from "./growth-resource-inventory";

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

export const userResourceInventoryDraftsTable = sqliteTable("user_resource_inventory_drafts", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  status: text().notNull().default("pending"),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
  appliedAt: text(),
});

export const userResourceInventoryDraftItemsTable = sqliteTable("user_resource_inventory_draft_items", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  draftUid: text().notNull(),
  itemUid: text().notNull(),
  quantity: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
});

function toInventoryModel(resourceInventory: typeof growthResourceInventoryTable.$inferSelect): UserResourceInventory {
  return {
    uid: resourceInventory.uid,
    itemUid: resourceInventory.itemUid,
    quantity: resourceInventory.quantity,
  };
}

function toDraftStatus(status: string): UserResourceInventoryDraftStatus {
  if (status === "pending" || status === "applied" || status === "discarded") {
    return status;
  }

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
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    }
    return Number(trimmed);
  }

  throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
}

export function validateUserResourceInventoryQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("보유 수량은 0 이상의 정수만 입력할 수 있어요");
  }
}

export async function getUserResourceInventories(env: Env, userId: number): Promise<UserResourceInventory[]> {
  const db = drizzle(env.DB);
  const inventories = await db
    .select()
    .from(growthResourceInventoryTable)
    .where(eq(growthResourceInventoryTable.userId, userId));

  return inventories.map(toInventoryModel);
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
  if (uniqueItemUids.length === 0) {
    return {};
  }

  const db = drizzle(env.DB);
  const inventories = await db
    .select()
    .from(growthResourceInventoryTable)
    .where(and(eq(growthResourceInventoryTable.userId, userId), inArray(growthResourceInventoryTable.itemUid, uniqueItemUids)));

  return inventories.reduce(
    (acc, inventory) => {
      acc[inventory.itemUid] = inventory.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export async function upsertUserResourceInventory(env: Env, userId: number, itemUid: string, quantity: number) {
  validateUserResourceInventoryQuantity(quantity);

  const db = drizzle(env.DB);
  await runInventoryBatch(db, [createUserResourceInventoryStatement(db, userId, itemUid, quantity)]);
}

export async function upsertUserResourceInventories(env: Env, userId: number, items: UserResourceInventoryInput[]) {
  const normalizedItems = normalizeInventoryItems(items);
  if (normalizedItems.length === 0) {
    return;
  }

  const db = drizzle(env.DB);
  await runInventoryBatch(
    db,
    normalizedItems.map((item) => createUserResourceInventoryStatement(db, userId, item.itemUid, item.quantity)),
  );
}

export async function createUserResourceInventoryDraft(
  env: Env,
  userId: number,
  items: UserResourceInventoryDraftInput[],
): Promise<string> {
  const normalizedItems = normalizeDraftItems(items);
  if (normalizedItems.length === 0) {
    throw new Error("변경된 보유 재화가 없어요");
  }

  const db = drizzle(env.DB);
  const draftUid = nanoid(12);
  await runInventoryBatch(db, [
    db.insert(userResourceInventoryDraftsTable).values({
      uid: draftUid,
      userId,
      status: "pending",
    }),
    db.insert(userResourceInventoryDraftItemsTable).values(
      normalizedItems.map((item) => ({
        uid: nanoid(8),
        draftUid,
        itemUid: item.itemUid,
        quantity: item.quantity,
      })),
    ),
  ]);

  return draftUid;
}

export async function getUserResourceInventoryDraft(
  env: Env,
  userId: number,
  draftUid: string,
): Promise<UserResourceInventoryDraft | null> {
  const db = drizzle(env.DB);
  const [draft] = await db
    .select()
    .from(userResourceInventoryDraftsTable)
    .where(and(eq(userResourceInventoryDraftsTable.uid, draftUid), eq(userResourceInventoryDraftsTable.userId, userId)));

  if (!draft) {
    return null;
  }

  const items = await db
    .select()
    .from(userResourceInventoryDraftItemsTable)
    .where(eq(userResourceInventoryDraftItemsTable.draftUid, draftUid));

  return {
    uid: draft.uid,
    userId: draft.userId,
    status: toDraftStatus(draft.status),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    appliedAt: draft.appliedAt,
    items: items.map(toDraftItemModel),
  };
}

export async function applyUserResourceInventoryDraft(env: Env, userId: number, draftUid: string) {
  const draft = await getUserResourceInventoryDraft(env, userId, draftUid);
  if (!draft) {
    throw new Error("Draft를 찾을 수 없어요");
  }
  if (draft.status !== "pending") {
    throw new Error("이미 처리된 Draft예요");
  }

  await env.DB.batch([
    ...draft.items.map((item) =>
      createConditionalDraftInventoryStatement(env, userId, draftUid, item.itemUid, item.quantity),
    ),
    env.DB.prepare(`
      update user_resource_inventory_drafts
      set status = 'applied',
          updatedAt = current_timestamp,
          appliedAt = current_timestamp
      where uid = ?1
        and userId = ?2
        and status = 'pending'
    `).bind(draftUid, userId),
  ]);

  const appliedDraft = await getUserResourceInventoryDraft(env, userId, draftUid);
  if (appliedDraft?.status !== "applied") {
    throw new Error("이미 처리된 Draft예요");
  }
}

export async function discardUserResourceInventoryDraft(env: Env, userId: number, draftUid: string) {
  const db = drizzle(env.DB);
  await db
    .update(userResourceInventoryDraftsTable)
    .set({ status: "discarded", updatedAt: sql`current_timestamp` })
    .where(
      and(
        eq(userResourceInventoryDraftsTable.uid, draftUid),
        eq(userResourceInventoryDraftsTable.userId, userId),
        eq(userResourceInventoryDraftsTable.status, "pending"),
      ),
    );
}

function normalizeDraftItems(items: UserResourceInventoryDraftInput[]): UserResourceInventoryDraftInput[] {
  return normalizeInventoryItems(items);
}

function createConditionalDraftInventoryStatement(
  env: Env,
  userId: number,
  draftUid: string,
  itemUid: string,
  quantity: number,
): D1PreparedStatement {
  validateUserResourceInventoryQuantity(quantity);

  if (quantity <= 0) {
    return env.DB.prepare(`
      delete from growth_resource_inventory
      where userId = ?1
        and itemUid = ?2
        and exists (
          select 1
          from user_resource_inventory_drafts
          where uid = ?3
            and userId = ?1
            and status = 'pending'
        )
    `).bind(userId, itemUid, draftUid);
  }

  return env.DB.prepare(`
    insert into growth_resource_inventory (uid, userId, itemUid, quantity)
    select ?1, ?2, ?3, ?4
    where exists (
      select 1
      from user_resource_inventory_drafts
      where uid = ?5
        and userId = ?2
        and status = 'pending'
    )
    on conflict(userId, itemUid) do update set
      quantity = excluded.quantity,
      updatedAt = current_timestamp
  `).bind(nanoid(8), userId, itemUid, quantity, draftUid);
}

function normalizeInventoryItems(items: UserResourceInventoryInput[]): UserResourceInventoryInput[] {
  const itemMap = new Map<string, number>();
  for (const item of items) {
    const itemUid = item.itemUid.trim();
    if (!itemUid) {
      continue;
    }
    validateUserResourceInventoryQuantity(item.quantity);
    itemMap.set(itemUid, item.quantity);
  }

  return [...itemMap.entries()].map(([itemUid, quantity]) => ({ itemUid, quantity }));
}

function createUserResourceInventoryStatement(
  db: DrizzleD1Database,
  userId: number,
  itemUid: string,
  quantity: number,
): BatchItem<"sqlite"> {
  if (quantity === 0) {
    return db
      .delete(growthResourceInventoryTable)
      .where(and(eq(growthResourceInventoryTable.userId, userId), eq(growthResourceInventoryTable.itemUid, itemUid)));
  }

  return db
    .insert(growthResourceInventoryTable)
    .values({ uid: nanoid(8), userId, itemUid, quantity })
    .onConflictDoUpdate({
      target: [growthResourceInventoryTable.userId, growthResourceInventoryTable.itemUid],
      set: { quantity, updatedAt: sql`current_timestamp` },
    });
}

async function runInventoryBatch(db: DrizzleD1Database, statements: BatchItem<"sqlite">[]) {
  if (statements.length === 0) {
    return;
  }

  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
