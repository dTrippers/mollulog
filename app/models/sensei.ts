import { nanoid } from "nanoid/non-secure";
import { isUniqueConstraintError } from "./base";
import { sqliteTable, int, text } from "drizzle-orm/sqlite-core";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

type SenseiRole = "guest" | "admin";

export const senseisTable = sqliteTable("senseis", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  username: text().notNull().unique(),
  profileStudentId: text(),
  bio: text(),
  friendCode: text(),
  memberCode: text(),
  googleId: text(),
  role: text().notNull().$type<SenseiRole>(),
  active: int().notNull().default(0),
});

export type Sensei = {
  id: number;
  uid: string;
  username: string;
  friendCode: string | null;
  memberCode: string | null;
  profileStudentId: string | null;
  bio: string | null;
  active: boolean;
  role: SenseiRole;
  config?: {
    darkMode?: boolean;
  };
};

// Get a sensei by a single field
export async function getSenseiById(env: Env, id: number): Promise<Sensei | null> {
  const db = drizzle(env.DB);
  const result = await db.select().from(senseisTable).where(eq(senseisTable.id, id)).limit(1);
  return result.length > 0 ? toModel(result[0]) : null;
}

export async function getSenseiByUsername(env: Env, username: string): Promise<Sensei | null> {
  const db = drizzle(env.DB);
  const result = await db.select().from(senseisTable).where(eq(senseisTable.username, username)).limit(1);
  return result.length > 0 ? toModel(result[0]) : null;
}

export async function getSenseisById(env: Env, ids: number[]): Promise<Sensei[]> {
  const uniqueIds = [...new Set(ids)];
  const db = drizzle(env.DB);
  const senseis = await db.select().from(senseisTable).where(inArray(senseisTable.id, uniqueIds));

  return senseis.map((row) => toModel(row));
}

// Get or create a sensei by googleId
export async function getOrCreateSenseiByGoogleId(env: Env, googleId: string): Promise<Sensei> {
  const db = drizzle(env.DB);
  const result = await db.select().from(senseisTable).where(eq(senseisTable.googleId, googleId)).limit(1);
  if (result.length > 0) {
    return toModel(result[0]);
  }

  const createResult = await db.insert(senseisTable).values({ uid: nanoid(8), username: nanoid(8), googleId, role: "guest" }).onConflictDoNothing();
  if (createResult.error) {
    throw createResult.error;
  }

  return getOrCreateSenseiByGoogleId(env, googleId);
}

// Update a sensei
type SenseiUpdateFields = Partial<Pick<Sensei, "username" | "friendCode" | "profileStudentId" | "active" | "bio">>

function nullableFieldToUpdate<T>(value: T | null | undefined, existingValue: T | null): T | null {
  if (value === undefined) {
    return existingValue;
  }
  return value;
}

export async function updateSensei(env: Env, id: number, fields: SenseiUpdateFields): Promise<{ error?: { username?: string } }> {
  const existingSensei = await getSenseiById(env, id);
  if (!existingSensei) {
    return {};
  }

  const db = drizzle(env.DB);
  try {
    await db.update(senseisTable).set({
      username: fields.username ?? existingSensei.username,
      friendCode: nullableFieldToUpdate(fields.friendCode, existingSensei.friendCode),
      profileStudentId: nullableFieldToUpdate(fields.profileStudentId, existingSensei.profileStudentId),
      bio: nullableFieldToUpdate(fields.bio, existingSensei.bio),
      active: (fields.active ?? existingSensei.active) ? 1 : 0,
    }).where(eq(senseisTable.id, id));
  } catch (e) {
    const err = e as Error;
    const uniqueError = isUniqueConstraintError(err);
    if (uniqueError && uniqueError.column === "username") {
      return { error: { username: "이미 사용중인 닉네임입니다." } };
    }

    console.error(e);
    throw e;
  }

  return {};
}

function toModel(row: typeof senseisTable.$inferSelect): Sensei {
  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    friendCode: row.friendCode,
    memberCode: row.memberCode,
    profileStudentId: row.profileStudentId,
    bio: row.bio,
    active: row.active === 1,
    role: row.role,
  };
}
