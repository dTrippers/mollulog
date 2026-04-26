import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";
import type { AuthProvider } from "./auth-identity";

export const pendingSenseiRegistrationsTable = sqliteTable(
  "pending_sensei_registrations",
  {
    id: int().primaryKey({ autoIncrement: true }),
    uid: text().notNull(),
    provider: text().notNull().$type<AuthProvider>(),
    providerUserId: text().notNull(),
    createdAt: text().notNull().default(sql`current_timestamp`),
    updatedAt: text().notNull().default(sql`current_timestamp`),
  },
  (table) => [
    uniqueIndex("pending_sensei_registrations_uid").on(table.uid),
    uniqueIndex("pending_sensei_registrations_provider_user").on(table.provider, table.providerUserId),
  ],
);

export type PendingSenseiRegistration = {
  uid: string;
  provider: AuthProvider;
  providerUserId: string;
};

export async function createPendingSenseiRegistration(
  env: Env,
  provider: AuthProvider,
  providerUserId: string,
): Promise<PendingSenseiRegistration> {
  const db = drizzle(env.DB);
  const existing = await db
    .select()
    .from(pendingSenseiRegistrationsTable)
    .where(
      and(
        eq(pendingSenseiRegistrationsTable.provider, provider),
        eq(pendingSenseiRegistrationsTable.providerUserId, providerUserId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      uid: existing[0].uid,
      provider: existing[0].provider,
      providerUserId: existing[0].providerUserId,
    };
  }

  const uid = nanoid(24);
  await db.insert(pendingSenseiRegistrationsTable).values({ uid, provider, providerUserId }).onConflictDoNothing();

  return createPendingSenseiRegistration(env, provider, providerUserId);
}

export async function getPendingSenseiRegistration(env: Env, uid: string): Promise<PendingSenseiRegistration | null> {
  const db = drizzle(env.DB);
  const result = await db
    .select()
    .from(pendingSenseiRegistrationsTable)
    .where(eq(pendingSenseiRegistrationsTable.uid, uid))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return {
    uid: result[0].uid,
    provider: result[0].provider,
    providerUserId: result[0].providerUserId,
  };
}

export async function deletePendingSenseiRegistration(env: Env, uid: string): Promise<void> {
  const db = drizzle(env.DB);
  await db.delete(pendingSenseiRegistrationsTable).where(eq(pendingSenseiRegistrationsTable.uid, uid));
}
