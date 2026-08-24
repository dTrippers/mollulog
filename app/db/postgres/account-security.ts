import { and, eq, or } from "drizzle-orm";
import {
  type IdentityDatabase,
  type IdentityRepositoryOptions,
  withIdentityDatabase,
  withIdentityTransaction,
} from "~/db/postgres/identity";
import {
  pgAuthIdentitiesTable,
  pgConnectApiKeysTable,
  pgFeedbackTicketsTable,
  pgFollowershipsTable,
  pgPasskeysTable,
  pgPendingSenseiRegistrationsTable,
  pgSenseiPrivaciesTable,
  pgSenseisTable,
} from "~/db/postgres/schema";
import type { AuthProvider } from "~/models/auth-identity";

export type AccountSessionState = {
  active: boolean;
};

export type AccountLeaveResult = { status: "left" } | { status: "not_found" | "inactive" | "username_mismatch" };

export type AccountSecurityRepositoryOptions = IdentityRepositoryOptions;

export async function getAccountSessionState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: AccountSecurityRepositoryOptions = {},
): Promise<AccountSessionState | null> {
  return withIdentityDatabase(
    env,
    "account_session_state",
    async (db) => {
      const [row] = await db
        .select({
          active: pgSenseisTable.active,
        })
        .from(pgSenseisTable)
        .where(eq(pgSenseisTable.id, userId))
        .limit(1);
      return row ?? null;
    },
    options,
  );
}

function addOAuthIdentifier(
  identifiers: Map<string, { provider: AuthProvider; providerUserId: string }>,
  provider: AuthProvider,
  providerUserId: string | null,
) {
  if (!providerUserId) return;
  identifiers.set(`${provider}:${providerUserId}`, { provider, providerUserId });
}

/**
 * Deactivates an account while preserving all user-authored records that use
 * its internal numeric ID. The row lock and username check make a stale form
 * submission harmless even when another request changed the account first.
 */
export async function leaveAccount(
  env: Pick<Env, "HYPERDRIVE">,
  input: { userId: number; username: string },
  options: AccountSecurityRepositoryOptions = {},
): Promise<AccountLeaveResult> {
  return withIdentityTransaction(
    env,
    "leave_account",
    async (db: IdentityDatabase): Promise<AccountLeaveResult> => {
      const [sensei] = await db
        .select({
          id: pgSenseisTable.id,
          uid: pgSenseisTable.uid,
          username: pgSenseisTable.username,
          googleId: pgSenseisTable.googleId,
          githubId: pgSenseisTable.githubId,
          active: pgSenseisTable.active,
        })
        .from(pgSenseisTable)
        .where(eq(pgSenseisTable.id, input.userId))
        .limit(1)
        .for("update");

      if (!sensei) return { status: "not_found" };
      if (!sensei.active) return { status: "inactive" };
      if (sensei.username !== input.username) return { status: "username_mismatch" };

      const identities = await db
        .select({ provider: pgAuthIdentitiesTable.provider, providerUserId: pgAuthIdentitiesTable.providerUserId })
        .from(pgAuthIdentitiesTable)
        .where(eq(pgAuthIdentitiesTable.senseiId, sensei.id));
      const oauthIdentifiers = new Map<string, { provider: AuthProvider; providerUserId: string }>();
      addOAuthIdentifier(oauthIdentifiers, "google", sensei.googleId);
      addOAuthIdentifier(oauthIdentifiers, "github", sensei.githubId);
      for (const identity of identities) {
        addOAuthIdentifier(oauthIdentifiers, identity.provider, identity.providerUserId);
      }

      await db.delete(pgAuthIdentitiesTable).where(eq(pgAuthIdentitiesTable.senseiId, sensei.id));
      await db.delete(pgPasskeysTable).where(eq(pgPasskeysTable.userId, sensei.id));
      await db.delete(pgSenseiPrivaciesTable).where(eq(pgSenseiPrivaciesTable.userId, sensei.id));
      await db
        .delete(pgFollowershipsTable)
        .where(or(eq(pgFollowershipsTable.followerId, sensei.id), eq(pgFollowershipsTable.followeeId, sensei.id)));
      await db.delete(pgConnectApiKeysTable).where(eq(pgConnectApiKeysTable.userId, sensei.id));
      await db
        .update(pgFeedbackTicketsTable)
        .set({ replyEmail: null })
        .where(eq(pgFeedbackTicketsTable.userId, sensei.id));

      const pendingRegistrationConditions = [...oauthIdentifiers.values()].map(({ provider, providerUserId }) =>
        and(
          eq(pgPendingSenseiRegistrationsTable.provider, provider),
          eq(pgPendingSenseiRegistrationsTable.providerUserId, providerUserId),
        ),
      );
      if (pendingRegistrationConditions.length > 0) {
        await db.delete(pgPendingSenseiRegistrationsTable).where(or(...pendingRegistrationConditions));
      }

      await db
        .update(pgSenseisTable)
        .set({
          active: false,
          profileVisibility: "private",
          username: `deleted-${sensei.uid}`,
          bio: null,
          friendCode: null,
          profileStudentId: null,
          googleId: null,
          githubId: null,
          role: "guest",
          updatedAt: new Date(),
        })
        .where(eq(pgSenseisTable.id, sensei.id));

      return { status: "left" };
    },
    options,
  );
}
