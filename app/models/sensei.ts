import { type AnyColumn, and, eq, inArray, or, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import { isUniqueConstraintError } from "~/lib/db";

type SenseiRole = "guest" | "admin";
export type ProfileVisibility = "public" | "private";

export const senseisTable = sqliteTable("senseis", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  username: text().notNull().unique(),
  profileStudentId: text(),
  bio: text(),
  friendCode: text(),
  googleId: text(),
  githubId: text(),
  role: text().notNull().$type<SenseiRole>(),
  active: int().notNull().default(0),
  profileVisibility: text().notNull().default("public").$type<ProfileVisibility>(),
});

export type Sensei = {
  id: number;
  uid: string;
  username: string;
  friendCode: string | null;
  profileStudentId: string | null;
  bio: string | null;
  active: boolean;
  role: SenseiRole;
  profileVisibility: ProfileVisibility;
  config?: {
    darkMode?: boolean;
  };
};

type SenseiCreateFields = {
  username: string;
  friendCode: string | null;
  profileStudentId: string | null;
  bio: string | null;
  googleId?: string | null;
  githubId?: string | null;
};

// Get a sensei by a single field
export async function getSenseiById(env: Env, id: number): Promise<Sensei | null> {
  const db = drizzle(env.DB);
  const result = await db.select().from(senseisTable).where(eq(senseisTable.id, id)).limit(1);
  return result.length > 0 ? toSenseiModel(result[0]) : null;
}

export async function getSenseiByUsername(env: Env, username: string): Promise<Sensei | null> {
  const db = drizzle(env.DB);
  const result = await db.select().from(senseisTable).where(eq(senseisTable.username, username)).limit(1);
  return result.length > 0 ? toSenseiModel(result[0]) : null;
}

export async function getSenseisById(env: Env, ids: number[]): Promise<Sensei[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return [];
  }
  const db = drizzle(env.DB);
  const senseis = await db.select().from(senseisTable).where(inArray(senseisTable.id, uniqueIds));

  return senseis.map((row) => toSenseiModel(row));
}

export async function getVisibleSenseisById(env: Env, ids: number[], viewerUserId?: number): Promise<Sensei[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const db = drizzle(env.DB);
  const senseis = await db
    .select()
    .from(senseisTable)
    .where(and(inArray(senseisTable.id, uniqueIds), senseiProfileVisibilityFilter(viewerUserId)));

  return senseis.map((row) => toSenseiModel(row));
}

export function isSenseiProfileVisibleTo(sensei: Sensei, viewerUserId?: number): boolean {
  return sensei.profileVisibility === "public" || sensei.id === viewerUserId;
}

export function senseiProfileVisibilityFilter(
  viewerUserId?: number | null,
  ownerUserIdColumn: AnyColumn = senseisTable.id,
): SQLWrapper {
  const publicCondition = eq(senseisTable.profileVisibility, "public");
  if (!viewerUserId) {
    return publicCondition;
  }

  return or(publicCondition, eq(ownerUserIdColumn, viewerUserId)) ?? publicCondition;
}

export async function createSensei(
  env: Env,
  fields: SenseiCreateFields,
): Promise<{ sensei?: Sensei; error?: { form?: string; username?: string } }> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);

  try {
    await db.insert(senseisTable).values({
      uid,
      username: fields.username,
      friendCode: fields.friendCode,
      profileStudentId: fields.profileStudentId,
      bio: fields.bio,
      googleId: fields.googleId,
      githubId: fields.githubId,
      role: "guest",
      active: 1,
    });
  } catch (e) {
    const err = e as Error;
    const uniqueError = isUniqueConstraintError(err);
    if (uniqueError && uniqueError.column === "username") {
      return { error: { username: "이미 사용중인 닉네임입니다." } };
    }
    if (uniqueError && (uniqueError.column === "googleId" || uniqueError.column === "githubId")) {
      return { error: { form: "이미 다른 계정에 연결된 로그인 계정이에요." } };
    }

    console.error(e);
    throw e;
  }

  const sensei = await getSenseiByUsername(env, fields.username);
  return sensei ? { sensei } : {};
}

// Update a sensei
type SenseiUpdateFields = Partial<
  Pick<Sensei, "username" | "friendCode" | "profileStudentId" | "active" | "bio" | "profileVisibility">
>;

function nullableFieldToUpdate<T>(value: T | null | undefined, existingValue: T | null): T | null {
  if (value === undefined) {
    return existingValue;
  }
  return value;
}

export async function updateSensei(
  env: Env,
  id: number,
  fields: SenseiUpdateFields,
): Promise<{ error?: { username?: string } }> {
  const existingSensei = await getSenseiById(env, id);
  if (!existingSensei) {
    return {};
  }

  const db = drizzle(env.DB);
  try {
    await db
      .update(senseisTable)
      .set({
        username: fields.username ?? existingSensei.username,
        friendCode: nullableFieldToUpdate(fields.friendCode, existingSensei.friendCode),
        profileStudentId: nullableFieldToUpdate(fields.profileStudentId, existingSensei.profileStudentId),
        bio: nullableFieldToUpdate(fields.bio, existingSensei.bio),
        active: (fields.active ?? existingSensei.active) ? 1 : 0,
        profileVisibility: fields.profileVisibility ?? existingSensei.profileVisibility,
      })
      .where(eq(senseisTable.id, id));
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

export function toSenseiModel(row: typeof senseisTable.$inferSelect): Sensei {
  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    friendCode: row.friendCode,
    profileStudentId: row.profileStudentId,
    bio: row.bio,
    active: row.active === 1,
    role: row.role,
    profileVisibility: row.profileVisibility ?? "public",
  };
}
