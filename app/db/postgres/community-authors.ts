import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { senseisTable } from "~/models/sensei";

export type CommunityAuthor = {
  id: number;
  username: string;
  profileStudentId: string | null;
  profileVisibility: "public" | "private";
};

/**
 * Community tables are PostgreSQL-owned, while identity/profile data remains
 * in D1 for this migration slice. Keep this lookup batched so a feed page does
 * not issue one D1 query per PostgreSQL row.
 */
export async function getCommunityAuthorsByIds(
  env: Pick<Env, "DB">,
  ids: readonly number[],
): Promise<Map<number, CommunityAuthor>> {
  const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));
  if (uniqueIds.length === 0) return new Map();

  const rows = await drizzle(env.DB)
    .select({
      id: senseisTable.id,
      username: senseisTable.username,
      profileStudentId: senseisTable.profileStudentId,
      profileVisibility: senseisTable.profileVisibility,
    })
    .from(senseisTable)
    .where(inArray(senseisTable.id, uniqueIds));

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
