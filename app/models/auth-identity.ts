import { and, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid/non-secure";
import {
  assertDiscordOwnership,
  DiscordOwnershipConflictError,
  type IdentityDatabase,
  type IdentityRepositoryOptions,
  lockDiscordOwnershipUser,
  withDiscordOwnershipTransaction,
  withIdentityDatabase,
  withIdentityTransaction,
} from "~/db/postgres/identity";
import { pgAuthIdentitiesTable, pgSenseisTable } from "~/db/postgres/schema";
import { postgresUniqueConstraintName } from "~/lib/db";
import { type Sensei, type SenseiCreateFields, toSenseiModel } from "./sensei";

export type AuthProvider = "google" | "github" | "discord";

export const authIdentitiesTable = pgAuthIdentitiesTable;

type LegacyAuthProvider = Exclude<AuthProvider, "discord">;

type DiscordSenseiProjection = Pick<
  typeof pgSenseisTable.$inferSelect,
  | "id"
  | "uid"
  | "username"
  | "friendCode"
  | "profileStudentId"
  | "active"
  | "bio"
  | "role"
  | "profileVisibility"
  | "growthVisibility"
>;

function toDiscordSenseiModel(row: DiscordSenseiProjection): Sensei {
  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    friendCode: row.friendCode,
    profileStudentId: row.profileStudentId,
    bio: row.bio,
    active: row.active,
    role: row.role,
    profileVisibility: row.profileVisibility ?? "public",
    growthVisibility: row.growthVisibility ?? false,
  };
}

function legacyProviderColumn(provider: LegacyAuthProvider) {
  return provider === "google" ? pgSenseisTable.googleId : pgSenseisTable.githubId;
}

function providerMatch(provider: LegacyAuthProvider, providerUserId: string) {
  const column = legacyProviderColumn(provider);
  return provider === "google"
    ? or(eq(column, providerUserId), eq(column, `zzz_${providerUserId}`))
    : eq(column, providerUserId);
}

export async function getSenseiByAuthIdentity(
  env: Env,
  provider: AuthProvider,
  providerUserId: string,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei | null> {
  const normalizedProviderUserId = provider === "discord" ? providerUserId.trim() : providerUserId;
  return withIdentityDatabase(
    env,
    "sensei_by_auth_identity",
    async (db) => {
      if (provider === "discord") {
        const [identityResult] = await db
          .select({
            id: pgSenseisTable.id,
            uid: pgSenseisTable.uid,
            username: pgSenseisTable.username,
            friendCode: pgSenseisTable.friendCode,
            profileStudentId: pgSenseisTable.profileStudentId,
            active: pgSenseisTable.active,
            bio: pgSenseisTable.bio,
            role: pgSenseisTable.role,
            profileVisibility: pgSenseisTable.profileVisibility,
            growthVisibility: pgSenseisTable.growthVisibility,
          })
          .from(pgAuthIdentitiesTable)
          .innerJoin(pgSenseisTable, eq(pgAuthIdentitiesTable.senseiId, pgSenseisTable.id))
          .where(
            and(
              eq(pgAuthIdentitiesTable.provider, provider),
              eq(pgAuthIdentitiesTable.providerUserId, normalizedProviderUserId),
              eq(pgSenseisTable.active, true),
            ),
          )
          .limit(1);
        return identityResult ? toDiscordSenseiModel(identityResult) : null;
      }

      const [identityResult] = await db
        .select({ sensei: pgSenseisTable })
        .from(pgAuthIdentitiesTable)
        .innerJoin(pgSenseisTable, eq(pgAuthIdentitiesTable.senseiId, pgSenseisTable.id))
        .where(
          and(
            eq(pgAuthIdentitiesTable.provider, provider),
            eq(pgAuthIdentitiesTable.providerUserId, providerUserId),
            eq(pgSenseisTable.active, true),
          ),
        )
        .limit(1);
      if (identityResult) return toSenseiModel(identityResult.sensei);

      const [legacyActive] = await db
        .select()
        .from(pgSenseisTable)
        .where(and(eq(legacyProviderColumn(provider), providerUserId), eq(pgSenseisTable.active, true)))
        .limit(1);
      if (legacyActive) {
        await db
          .insert(pgAuthIdentitiesTable)
          .values({ senseiId: legacyActive.id, provider, providerUserId })
          .onConflictDoNothing();
        return toSenseiModel(legacyActive);
      }

      return reviveInactiveLegacySensei(db, provider, providerUserId);
    },
    options,
  );
}

async function reviveInactiveLegacySensei(
  db: IdentityDatabase,
  provider: LegacyAuthProvider,
  providerUserId: string,
): Promise<Sensei | null> {
  const [row] = await db
    .select()
    .from(pgSenseisTable)
    .where(and(eq(pgSenseisTable.active, false), providerMatch(provider, providerUserId)))
    .limit(1);
  if (!row) return null;

  const updatedValues =
    provider === "google"
      ? { active: true, googleId: providerUserId, updatedAt: new Date() }
      : { active: true, githubId: providerUserId, updatedAt: new Date() };
  const [updated] = await db.transaction(async (tx) => {
    await tx.update(pgSenseisTable).set(updatedValues).where(eq(pgSenseisTable.id, row.id));
    await tx.insert(pgAuthIdentitiesTable).values({ senseiId: row.id, provider, providerUserId }).onConflictDoNothing();
    return tx.select().from(pgSenseisTable).where(eq(pgSenseisTable.id, row.id)).limit(1);
  });
  return updated ? toSenseiModel(updated) : null;
}

export async function getAuthIdentityStatuses(
  env: Env,
  senseiId: number,
  options: IdentityRepositoryOptions = {},
): Promise<Record<AuthProvider, boolean>> {
  return withIdentityDatabase(
    env,
    "auth_identity_statuses",
    async (db) => {
      const [[sensei], identities] = await Promise.all([
        db.select().from(pgSenseisTable).where(eq(pgSenseisTable.id, senseiId)).limit(1),
        db.select().from(pgAuthIdentitiesTable).where(eq(pgAuthIdentitiesTable.senseiId, senseiId)),
      ]);

      return {
        google: identities.some((identity) => identity.provider === "google") || Boolean(sensei?.googleId),
        github: identities.some((identity) => identity.provider === "github") || Boolean(sensei?.githubId),
        discord: identities.some((identity) => identity.provider === "discord"),
      };
    },
    options,
  );
}

export async function createAuthIdentity(
  env: Env,
  senseiId: number,
  provider: AuthProvider,
  providerUserId: string,
  options: IdentityRepositoryOptions = {},
): Promise<void> {
  if (provider === "discord") {
    const normalizedProviderUserId = providerUserId.trim();
    await withDiscordOwnershipTransaction(
      env,
      "create_discord_auth_identity",
      { userId: senseiId, discordUserId: normalizedProviderUserId },
      async (db) => {
        await db
          .insert(pgAuthIdentitiesTable)
          .values({ senseiId, provider, providerUserId: normalizedProviderUserId })
          .onConflictDoNothing();
      },
      options,
    );
    return;
  }

  await withIdentityDatabase(
    env,
    "create_auth_identity",
    async (db) => {
      await db.insert(pgAuthIdentitiesTable).values({ senseiId, provider, providerUserId }).onConflictDoNothing();
    },
    options,
  );
}

/** Creates a new profile and its first OAuth identity atomically. */
export async function createSenseiWithAuthIdentity(
  env: Env,
  fields: SenseiCreateFields,
  provider: AuthProvider,
  providerUserId: string,
  options: IdentityRepositoryOptions = {},
): Promise<{ sensei?: Sensei; error?: { form?: string; username?: string } }> {
  const uid = nanoid(8);
  try {
    if (provider === "discord") {
      const normalizedProviderUserId = providerUserId.trim();
      return await withDiscordOwnershipTransaction(
        env,
        "create_sensei_with_discord_auth_identity",
        { discordUserId: normalizedProviderUserId },
        async (db, client) => {
          const [row] = await db
            .insert(pgSenseisTable)
            .values({
              uid,
              username: fields.username,
              friendCode: fields.friendCode,
              profileStudentId: fields.profileStudentId,
              bio: fields.bio,
              role: "guest",
              active: true,
            })
            .returning();
          if (!row) return {};

          // New profiles do not have a numeric user id until the insert above.
          // Acquire the same user lock before claiming the identity row.
          await lockDiscordOwnershipUser(client, row.id);
          await db.insert(pgAuthIdentitiesTable).values({
            senseiId: row.id,
            provider,
            providerUserId: normalizedProviderUserId,
          });
          return { sensei: toSenseiModel(row) };
        },
        options,
      );
    }

    return await withIdentityTransaction(
      env,
      "create_sensei_with_auth_identity",
      async (db) => {
        const [row] = await db
          .insert(pgSenseisTable)
          .values({
            uid,
            username: fields.username,
            friendCode: fields.friendCode,
            profileStudentId: fields.profileStudentId,
            bio: fields.bio,
            googleId: provider === "google" ? providerUserId : null,
            githubId: provider === "github" ? providerUserId : null,
            role: "guest",
            active: true,
          })
          .returning();
        if (!row) return {};

        await db.insert(pgAuthIdentitiesTable).values({ senseiId: row.id, provider, providerUserId });
        return { sensei: toSenseiModel(row) };
      },
      options,
    );
  } catch (error) {
    const constraint = postgresUniqueConstraintName(error);
    if (constraint === "senseis_username_uidx") {
      return { error: { username: "이미 사용중인 닉네임입니다." } };
    }
    if (
      constraint === "senseis_google_id_uidx" ||
      constraint === "senseis_github_id_uidx" ||
      constraint === "auth_identities_provider_user_uidx"
    ) {
      return { error: { form: "이미 다른 계정에 연결된 로그인 계정이에요." } };
    }
    if (error instanceof DiscordOwnershipConflictError) {
      return { error: { form: "이미 연결된 Discord 계정이 있거나 사용할 수 없는 Discord 계정이에요." } };
    }
    console.error(error);
    throw error;
  }
}

export async function linkAuthIdentity(
  env: Env,
  senseiId: number,
  provider: AuthProvider,
  providerUserId: string,
  options: IdentityRepositoryOptions = {},
): Promise<{ ok: true } | { ok: false; reason: "conflict" }> {
  if (provider === "discord") {
    const normalizedProviderUserId = providerUserId.trim();
    try {
      await withDiscordOwnershipTransaction(
        env,
        "link_discord_auth_identity",
        { userId: senseiId, discordUserId: normalizedProviderUserId },
        async (db) => {
          await db
            .insert(pgAuthIdentitiesTable)
            .values({ senseiId, provider, providerUserId: normalizedProviderUserId })
            .onConflictDoNothing();
        },
        options,
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof DiscordOwnershipConflictError) return { ok: false, reason: "conflict" };
      const constraint = postgresUniqueConstraintName(error);
      if (constraint === "auth_identities_provider_user_uidx") return { ok: false, reason: "conflict" };
      throw error;
    }
  }

  try {
    return await withIdentityDatabase(
      env,
      "link_auth_identity",
      async (db) => {
        const [existingIdentity] = await db
          .select({ senseiId: pgAuthIdentitiesTable.senseiId })
          .from(pgAuthIdentitiesTable)
          .where(
            and(eq(pgAuthIdentitiesTable.provider, provider), eq(pgAuthIdentitiesTable.providerUserId, providerUserId)),
          )
          .limit(1);
        if (existingIdentity && existingIdentity.senseiId !== senseiId) {
          return { ok: false, reason: "conflict" };
        }

        const [legacyMatch] = await db
          .select({ id: pgSenseisTable.id })
          .from(pgSenseisTable)
          .where(providerMatch(provider, providerUserId))
          .limit(1);
        if (legacyMatch && legacyMatch.id !== senseiId) {
          return { ok: false, reason: "conflict" };
        }

        await db.transaction(async (tx) => {
          await tx.insert(pgAuthIdentitiesTable).values({ senseiId, provider, providerUserId }).onConflictDoNothing();
          if (provider === "google") {
            await tx
              .update(pgSenseisTable)
              .set({ googleId: providerUserId, updatedAt: new Date() })
              .where(eq(pgSenseisTable.id, senseiId));
          } else {
            await tx
              .update(pgSenseisTable)
              .set({ githubId: providerUserId, updatedAt: new Date() })
              .where(eq(pgSenseisTable.id, senseiId));
          }
        });
        return { ok: true };
      },
      options,
    );
  } catch (error) {
    const constraint = postgresUniqueConstraintName(error);
    if (
      constraint === "auth_identities_provider_user_uidx" ||
      constraint === "senseis_google_id_uidx" ||
      constraint === "senseis_github_id_uidx"
    ) {
      return { ok: false, reason: "conflict" };
    }
    throw error;
  }
}

export async function assertDiscordIdentityOwnership(
  env: Env,
  userId: number | undefined,
  discordUserId: string,
  options: IdentityRepositoryOptions = {},
): Promise<void> {
  await assertDiscordOwnership(env, { userId, discordUserId }, options);
}
