import { eq } from "drizzle-orm";
import { type IdentityRepositoryOptions, utcIsoString, withIdentityDatabase } from "~/db/postgres/identity";
import { pgSenseiPrivaciesTable } from "~/db/postgres/schema";

export const senseiPrivaciesTable = pgSenseiPrivaciesTable;

export type SenseiPrivacy = {
  id: number;
  userId: number;
  memberCode: string | null;
  createdAt: string;
  updatedAt: string;
};

function toModel(row: typeof pgSenseiPrivaciesTable.$inferSelect): SenseiPrivacy {
  return {
    id: row.id,
    userId: row.userId,
    memberCode: row.memberCode,
    createdAt: utcIsoString(row.createdAt),
    updatedAt: utcIsoString(row.updatedAt),
  };
}

export async function getSenseiPrivacyByUserId(
  env: Env,
  userId: number,
  options: IdentityRepositoryOptions = {},
): Promise<SenseiPrivacy | null> {
  return withIdentityDatabase(
    env,
    "sensei_privacy_by_user",
    async (db) => {
      const [row] = await db
        .select()
        .from(pgSenseiPrivaciesTable)
        .where(eq(pgSenseiPrivaciesTable.userId, userId))
        .limit(1);
      return row ? toModel(row) : null;
    },
    options,
  );
}

export async function upsertSenseiPrivacy(
  env: Env,
  userId: number,
  memberCode: string | null,
  options: IdentityRepositoryOptions = {},
): Promise<void> {
  await withIdentityDatabase(
    env,
    "upsert_sensei_privacy",
    async (db) => {
      await db
        .insert(pgSenseiPrivaciesTable)
        .values({ userId, memberCode })
        .onConflictDoUpdate({
          target: [pgSenseiPrivaciesTable.userId],
          set: { memberCode, updatedAt: new Date() },
        });
    },
    options,
  );
}
