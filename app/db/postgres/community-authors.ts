import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { senseisTable } from "~/models/sensei";

const COMMUNITY_AUTHOR_ID_BATCH_SIZE = 90;

export type CommunityAuthor = {
  id: number;
  username: string;
  profileStudentId: string | null;
  profileVisibility: "public" | "private";
};

/**
 * Temporary migration bridge: community tables are PostgreSQL-owned while
 * identity/profile data remains in D1. Remove this bridge when senseis moves to
 * PostgreSQL. Keep each D1 IN expression below the platform parameter limit.
 */
export async function getCommunityAuthorsByIds(
  env: Pick<Env, "DB">,
  ids: readonly number[],
): Promise<Map<number, CommunityAuthor>> {
  const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));
  if (uniqueIds.length === 0) return new Map();

  const db = drizzle(env.DB);
  const rows = (
    await Promise.all(
      Array.from({ length: Math.ceil(uniqueIds.length / COMMUNITY_AUTHOR_ID_BATCH_SIZE) }, (_, index) => {
        const batch = uniqueIds.slice(
          index * COMMUNITY_AUTHOR_ID_BATCH_SIZE,
          (index + 1) * COMMUNITY_AUTHOR_ID_BATCH_SIZE,
        );
        return db
          .select({
            id: senseisTable.id,
            username: senseisTable.username,
            profileStudentId: senseisTable.profileStudentId,
            profileVisibility: senseisTable.profileVisibility,
          })
          .from(senseisTable)
          .where(inArray(senseisTable.id, batch));
      }),
    )
  ).flat();

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        username: row.username,
        profileStudentId: row.profileStudentId ?? null,
        profileVisibility: row.profileVisibility ?? "public",
      },
    ]),
  );
}

/**
 * Resolve a username in the temporary D1 senseis bridge before querying
 * PostgreSQL-owned community rows. Remove this lookup when senseis moves to
 * PostgreSQL.
 */
export async function getCommunityAuthorIdByUsername(env: Pick<Env, "DB">, username: string): Promise<number | null> {
  const [row] = await drizzle(env.DB)
    .select({ id: senseisTable.id })
    .from(senseisTable)
    .where(eq(senseisTable.username, username))
    .limit(1);
  return row?.id ?? null;
}
