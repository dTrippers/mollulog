import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid/non-secure";
import { withIdentityDatabase } from "~/db/postgres/identity";
import { pgPendingSenseiRegistrationsTable } from "~/db/postgres/schema";
import type { AuthProvider } from "./auth-identity";

export const pendingSenseiRegistrationsTable = pgPendingSenseiRegistrationsTable;

export type PendingSenseiRegistration = {
  uid: string;
  provider: AuthProvider;
  providerUserId: string;
};

function toModel(row: typeof pgPendingSenseiRegistrationsTable.$inferSelect): PendingSenseiRegistration {
  return {
    uid: row.uid,
    provider: row.provider,
    providerUserId: row.providerUserId,
  };
}

export async function createPendingSenseiRegistration(
  env: Env,
  provider: AuthProvider,
  providerUserId: string,
): Promise<PendingSenseiRegistration> {
  return withIdentityDatabase(env, "create_pending_registration", async (db) => {
    const [existing] = await db
      .select()
      .from(pgPendingSenseiRegistrationsTable)
      .where(
        and(
          eq(pgPendingSenseiRegistrationsTable.provider, provider),
          eq(pgPendingSenseiRegistrationsTable.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    if (existing) return toModel(existing);

    const [inserted] = await db
      .insert(pgPendingSenseiRegistrationsTable)
      .values({ uid: nanoid(24), provider, providerUserId })
      .onConflictDoNothing({
        target: [pgPendingSenseiRegistrationsTable.provider, pgPendingSenseiRegistrationsTable.providerUserId],
      })
      .returning();
    if (inserted) return toModel(inserted);

    const [raced] = await db
      .select()
      .from(pgPendingSenseiRegistrationsTable)
      .where(
        and(
          eq(pgPendingSenseiRegistrationsTable.provider, provider),
          eq(pgPendingSenseiRegistrationsTable.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    if (!raced) throw new Error("Pending registration was not created");
    return toModel(raced);
  });
}

export async function getPendingSenseiRegistration(env: Env, uid: string): Promise<PendingSenseiRegistration | null> {
  return withIdentityDatabase(env, "pending_registration_by_uid", async (db) => {
    const [row] = await db
      .select()
      .from(pgPendingSenseiRegistrationsTable)
      .where(eq(pgPendingSenseiRegistrationsTable.uid, uid))
      .limit(1);
    return row ? toModel(row) : null;
  });
}

export async function deletePendingSenseiRegistration(env: Env, uid: string): Promise<void> {
  await withIdentityDatabase(env, "delete_pending_registration", async (db) => {
    await db.delete(pgPendingSenseiRegistrationsTable).where(eq(pgPendingSenseiRegistrationsTable.uid, uid));
  });
}
