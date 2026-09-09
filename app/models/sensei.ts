import { and, eq, inArray, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { nanoid } from "nanoid/non-secure";
import { type IdentityRepositoryOptions, withIdentityDatabase } from "~/db/postgres/identity";
import { pgSenseisTable } from "~/db/postgres/schema";
import { postgresUniqueConstraintName } from "~/lib/db";

export type SenseiRole = "guest" | "admin";
export type ProfileVisibility = "public" | "private";

// Kept as the model-facing table export for callers and test fixtures. The
// canonical table is PostgreSQL after the identity cutover.
export const senseisTable = pgSenseisTable;

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
  growthVisibility?: boolean;
  config?: {
    darkMode?: boolean;
  };
};

export type SenseiCreateFields = {
  username: string;
  friendCode: string | null;
  profileStudentId: string | null;
  bio: string | null;
  googleId?: string | null;
  githubId?: string | null;
};

type SenseiRow = typeof pgSenseisTable.$inferSelect;

export async function getSenseiById(
  env: Env,
  id: number,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei | null> {
  return withIdentityDatabase(
    env,
    "sensei_by_id",
    async (db) => {
      const [row] = await db.select().from(pgSenseisTable).where(eq(pgSenseisTable.id, id)).limit(1);
      return row ? toSenseiModel(row) : null;
    },
    options,
  );
}

export async function getSenseiByUsername(
  env: Env,
  username: string,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei | null> {
  return withIdentityDatabase(
    env,
    "sensei_by_username",
    async (db) => {
      const [row] = await db.select().from(pgSenseisTable).where(eq(pgSenseisTable.username, username)).limit(1);
      return row ? toSenseiModel(row) : null;
    },
    options,
  );
}

export async function getSenseisById(
  env: Env,
  ids: number[],
  options: IdentityRepositoryOptions = {},
): Promise<Sensei[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  return withIdentityDatabase(
    env,
    "senseis_by_id",
    async (db) => {
      const rows = await db.select().from(pgSenseisTable).where(inArray(pgSenseisTable.id, uniqueIds));
      return rows.map(toSenseiModel);
    },
    options,
  );
}

export async function getVisibleSenseisById(
  env: Env,
  ids: number[],
  viewerUserId?: number,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  return withIdentityDatabase(
    env,
    "visible_senseis_by_id",
    async (db) => {
      const rows = await db
        .select()
        .from(pgSenseisTable)
        .where(and(inArray(pgSenseisTable.id, uniqueIds), senseiProfileVisibilityFilter(viewerUserId)));
      return rows.map(toSenseiModel);
    },
    options,
  );
}

export function isSenseiProfileVisibleTo(sensei: Sensei, viewerUserId?: number): boolean {
  return sensei.profileVisibility === "public" || sensei.id === viewerUserId;
}

export function senseiProfileVisibilityFilter(
  viewerUserId?: number | null,
  ownerUserIdColumn: SQLWrapper = pgSenseisTable.id,
): SQL {
  const publicCondition = eq(pgSenseisTable.profileVisibility, "public");
  if (!viewerUserId) return publicCondition;
  return or(publicCondition, sql`${ownerUserIdColumn} = ${viewerUserId}`) ?? publicCondition;
}

export async function createSensei(
  env: Env,
  fields: SenseiCreateFields,
  options: IdentityRepositoryOptions = {},
): Promise<{ sensei?: Sensei; error?: { form?: string; username?: string } }> {
  const uid = nanoid(8);

  try {
    return await withIdentityDatabase(
      env,
      "create_sensei",
      async (db) => {
        const [row] = await db
          .insert(pgSenseisTable)
          .values({
            uid,
            username: fields.username,
            friendCode: fields.friendCode,
            profileStudentId: fields.profileStudentId,
            bio: fields.bio,
            googleId: fields.googleId,
            githubId: fields.githubId,
            role: "guest",
            active: true,
          })
          .returning();
        return row ? { sensei: toSenseiModel(row) } : {};
      },
      options,
    );
  } catch (error) {
    const constraint = postgresUniqueConstraintName(error);
    if (constraint === "senseis_username_uidx") {
      return { error: { username: "이미 사용중인 닉네임입니다." } };
    }
    if (constraint === "senseis_google_id_uidx" || constraint === "senseis_github_id_uidx") {
      return { error: { form: "이미 다른 계정에 연결된 로그인 계정이에요." } };
    }
    console.error(error);
    throw error;
  }
}

type SenseiUpdateFields = Partial<
  Pick<
    Sensei,
    "username" | "friendCode" | "profileStudentId" | "active" | "bio" | "profileVisibility" | "growthVisibility"
  >
>;

export async function updateSensei(
  env: Env,
  id: number,
  fields: SenseiUpdateFields,
  options: IdentityRepositoryOptions = {},
): Promise<{ error?: { username?: string } }> {
  try {
    return await withIdentityDatabase(
      env,
      "update_sensei",
      async (db) => {
        const updateValues = {
          ...(fields.username !== undefined ? { username: fields.username } : {}),
          ...(fields.friendCode !== undefined ? { friendCode: fields.friendCode } : {}),
          ...(fields.profileStudentId !== undefined ? { profileStudentId: fields.profileStudentId } : {}),
          ...(fields.bio !== undefined ? { bio: fields.bio } : {}),
          ...(fields.active !== undefined ? { active: fields.active } : {}),
          ...(fields.profileVisibility !== undefined ? { profileVisibility: fields.profileVisibility } : {}),
          ...(fields.growthVisibility !== undefined ? { growthVisibility: fields.growthVisibility } : {}),
          updatedAt: new Date(),
        };

        await db.update(pgSenseisTable).set(updateValues).where(eq(pgSenseisTable.id, id));
        return {};
      },
      options,
    );
  } catch (error) {
    const constraint = postgresUniqueConstraintName(error);
    if (constraint === "senseis_username_uidx") {
      return { error: { username: "이미 사용중인 닉네임입니다." } };
    }
    console.error(error);
    throw error;
  }
}

export function toSenseiModel(row: SenseiRow): Sensei {
  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    friendCode: row.friendCode,
    profileStudentId: row.profileStudentId,
    bio: row.bio,
    active: typeof row.active === "boolean" ? row.active : Number(row.active) === 1,
    role: row.role as SenseiRole,
    profileVisibility: row.profileVisibility ?? "public",
    growthVisibility: row.growthVisibility ?? false,
  };
}
