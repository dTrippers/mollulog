import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, int, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

export type PickupHistory = {
  uid: string;
  userId: number;
  eventId: string;
  result: {
    trial: number;
    tier3Count: number;
    tier3StudentIds: string[];
    tier2Count?: number;
    tier1Count?: number;
  }[];
  rawResult?: string | null;
};

const pickupHistoriesTable = sqliteTable("pickup_histories", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  eventId: text().notNull(),
  result: text().notNull(),
  rawResult: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export async function getPickupHistory(env: Env, userId: number, uid: string, includeRaw?: boolean): Promise<PickupHistory | null> {
  const db = drizzle(env.DB);
  const results = await db.select().from(pickupHistoriesTable)
    .where(and(eq(pickupHistoriesTable.uid, uid), eq(pickupHistoriesTable.userId, userId)))
    .all();

  return results.length > 0 ? toModel(results[0], includeRaw) : null;
}

export async function getPickupHistories(env: Env, userId: number): Promise<PickupHistory[]> {
  const db = drizzle(env.DB);
  const results = await db.select().from(pickupHistoriesTable)
    .where(eq(pickupHistoriesTable.userId, userId))
    .all();

  return results.map((result) => toModel(result));
}

export async function createPickupHistory(env: Env, userId: number, eventId: string, result: PickupHistory["result"], rawResult: string | null) {
  const db = drizzle(env.DB);
  await db.insert(pickupHistoriesTable)
    .values({ uid: nanoid(8), userId, eventId, result: JSON.stringify(result), rawResult });
}

export async function updatePickupHistory(env: Env, userId: number, uid: string, eventId: string, result: PickupHistory["result"], rawResult?: string | null) {
  const db = drizzle(env.DB);
  const updateValue: { eventId: string, result: string, rawResult?: string | null } = { eventId, result: JSON.stringify(result) };
  if (rawResult !== undefined) {
    updateValue.rawResult = rawResult;
  }

  await db.update(pickupHistoriesTable)
    .set({ ...updateValue, updatedAt: sql`current_timestamp` })
    .where(and(eq(pickupHistoriesTable.uid, uid), eq(pickupHistoriesTable.userId, userId)));
}

export async function deletePickupHistory(env: Env, userId: number, uid: string) {
  const db = drizzle(env.DB);
  await db.delete(pickupHistoriesTable)
    .where(and(eq(pickupHistoriesTable.uid, uid), eq(pickupHistoriesTable.userId, userId)));
}

export function parsePickupHistory(raw: string, students: { uid: string, name: string }[]): PickupHistory["result"] {
  const studentNames = students.map((student) => student.name);
  const studentMap = new Map(students.map((student) => [student.name, student.uid]));

  const result: PickupHistory["result"] = [];
  let trial = 0;
  for (const line of raw.split("\n")) {
    const matched = line.matchAll(/(?<!\d)\d{1}(?!\d)/g);
    const [count1, count2, count3] = Array.from(matched).map((m) => Number.parseInt(m[0]));
    if (count1 === undefined || count2 === undefined || count3 === undefined) {
      continue;
    }

    trial += 10;

    const names = Array.from(line.matchAll(/[가-힣]+/g)).map((m) => m[0]);
    const tierOrderAsc = names.length === count1 || names.length === count3
      ? names.length === count3
      : count1 > count3;

    const [tier1Count, tier2Count, tier3Count] = tierOrderAsc
      ? [count1, count2, count3]
      : [count3, count2, count1];

    const tier3StudentIds = tier3Count > 0 ? names.map((searchName) => {
      const studentId = studentMap.get(searchName);
      if (studentId) {
        return studentId;
      }

      const [namePart1, namePart2] = [searchName.slice(0, 1), searchName.slice(1)];
      const expectingName = studentNames.find((name) => {
        const [originalName, skinName] = name.split("(").map((each) => each.replace(")", ""));
        return originalName.includes(namePart2) && skinName?.includes(namePart1);
      });

      return expectingName ? studentMap.get(expectingName) ?? null : null;
    }).filter((studentId) => studentId !== null) : [];

    result.push({
      trial,
      tier3Count,
      tier2Count,
      tier1Count,
      tier3StudentIds,
    });
  }

  return result;
}

type DBPickupHistory = {
  uid: string;
  userId: number;
  eventId: string;
  result: string;
  rawResult: string | null;
};

function toModel(dbResult: DBPickupHistory, includeRaw = false): PickupHistory {
  const result: PickupHistory = {
    uid: dbResult.uid,
    userId: dbResult.userId,
    eventId: dbResult.eventId,
    result: JSON.parse(dbResult.result),
  };

  if (includeRaw) {
    result.rawResult = dbResult.rawResult;
  };

  return result;
}
