import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";

export const senseiPrivaciesTable = sqliteTable("sensei_privacies", {
  id: int().primaryKey({ autoIncrement: true }),
  userId: int().notNull(),
  memberCode: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export type SenseiPrivacy = {
  id: number;
  userId: number;
  memberCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getSenseiPrivacyByUserId(env: Env, userId: number): Promise<SenseiPrivacy | null> {
  const db = drizzle(env.DB);
  const result = await db.select().from(senseiPrivaciesTable).where(eq(senseiPrivaciesTable.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertSenseiPrivacy(env: Env, userId: number, memberCode: string | null): Promise<void> {
  const db = drizzle(env.DB);
  await db.insert(senseiPrivaciesTable)
    .values({ userId, memberCode })
    .onConflictDoUpdate({
      target: [senseiPrivaciesTable.userId],
      set: {
        memberCode,
        updatedAt: sql`current_timestamp`,
      },
    });
}
