import { and, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { isUniqueConstraintError } from "~/lib/db";
import { type Sensei, getSenseiById, senseisTable } from "./sensei";

export type AuthProvider = "google" | "github";

export const authIdentitiesTable = sqliteTable(
  "auth_identities",
  {
    id: int().primaryKey({ autoIncrement: true }),
    senseiId: int().notNull(),
    provider: text().notNull().$type<AuthProvider>(),
    providerUserId: text().notNull(),
    createdAt: text().notNull().default(sql`current_timestamp`),
    updatedAt: text().notNull().default(sql`current_timestamp`),
  },
  (table) => [uniqueIndex("auth_identities_provider_user").on(table.provider, table.providerUserId)],
);

function legacyProviderColumn(provider: AuthProvider) {
  return provider === "google" ? senseisTable.googleId : senseisTable.githubId;
}

export async function getSenseiByAuthIdentity(
  env: Env,
  provider: AuthProvider,
  providerUserId: string,
): Promise<Sensei | null> {
  const db = drizzle(env.DB);
  const identityResult = await db
    .select({ sensei: senseisTable })
    .from(authIdentitiesTable)
    .innerJoin(senseisTable, eq(authIdentitiesTable.senseiId, senseisTable.id))
    .where(
      and(
        eq(authIdentitiesTable.provider, provider),
        eq(authIdentitiesTable.providerUserId, providerUserId),
        eq(senseisTable.active, 1),
      ),
    )
    .limit(1);

  if (identityResult.length > 0) {
    return getSenseiById(env, identityResult[0].sensei.id);
  }

  const fallbackResult = await db
    .select()
    .from(senseisTable)
    .where(and(eq(legacyProviderColumn(provider), providerUserId), eq(senseisTable.active, 1)))
    .limit(1);

  if (fallbackResult.length > 0) {
    await createAuthIdentity(env, fallbackResult[0].id, provider, providerUserId);
    return getSenseiById(env, fallbackResult[0].id);
  }

  return reviveInactiveLegacySensei(env, provider, providerUserId);
}

async function reviveInactiveLegacySensei(
  env: Env,
  provider: AuthProvider,
  providerUserId: string,
): Promise<Sensei | null> {
  const db = drizzle(env.DB);
  const column = legacyProviderColumn(provider);
  const providerMatches =
    provider === "google"
      ? or(eq(column, providerUserId), eq(column, `zzz_${providerUserId}`))
      : eq(column, providerUserId);
  const result = await db
    .select()
    .from(senseisTable)
    .where(and(eq(senseisTable.active, 0), providerMatches))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  if (provider === "google") {
    await db.update(senseisTable).set({ active: 1, googleId: providerUserId }).where(eq(senseisTable.id, result[0].id));
  } else {
    await db.update(senseisTable).set({ active: 1, githubId: providerUserId }).where(eq(senseisTable.id, result[0].id));
  }

  await createAuthIdentity(env, result[0].id, provider, providerUserId);
  return getSenseiById(env, result[0].id);
}

export async function getAuthIdentityStatuses(env: Env, senseiId: number): Promise<Record<AuthProvider, boolean>> {
  const db = drizzle(env.DB);
  const sensei = await db.select().from(senseisTable).where(eq(senseisTable.id, senseiId)).limit(1);
  const identities = await db.select().from(authIdentitiesTable).where(eq(authIdentitiesTable.senseiId, senseiId));

  return {
    google: identities.some((identity) => identity.provider === "google") || Boolean(sensei[0]?.googleId),
    github: identities.some((identity) => identity.provider === "github") || Boolean(sensei[0]?.githubId),
  };
}

export async function createAuthIdentity(
  env: Env,
  senseiId: number,
  provider: AuthProvider,
  providerUserId: string,
): Promise<void> {
  const db = drizzle(env.DB);
  await db.insert(authIdentitiesTable).values({ senseiId, provider, providerUserId }).onConflictDoNothing();
}

export async function linkAuthIdentity(
  env: Env,
  senseiId: number,
  provider: AuthProvider,
  providerUserId: string,
): Promise<{ ok: true } | { ok: false; reason: "conflict" }> {
  const existingSensei = await getSenseiByAuthIdentity(env, provider, providerUserId);
  if (existingSensei && existingSensei.id !== senseiId) {
    return { ok: false, reason: "conflict" };
  }

  const db = drizzle(env.DB);
  try {
    await createAuthIdentity(env, senseiId, provider, providerUserId);
    if (provider === "google") {
      await db.update(senseisTable).set({ googleId: providerUserId }).where(eq(senseisTable.id, senseiId));
    } else {
      await db.update(senseisTable).set({ githubId: providerUserId }).where(eq(senseisTable.id, senseiId));
    }
  } catch (e) {
    const uniqueError = isUniqueConstraintError(e as Error);
    if (
      uniqueError &&
      (uniqueError.column === "provider" ||
        uniqueError.column === "providerUserId" ||
        uniqueError.column === "githubId" ||
        uniqueError.column === "googleId")
    ) {
      return { ok: false, reason: "conflict" };
    }
    throw e;
  }

  return { ok: true };
}
