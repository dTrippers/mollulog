import { describe, expect, it } from "@jest/globals";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { communityAuthorVisiblePredicate } from "~/db/postgres/community-moderation";

describe("community moderation SQL helper", () => {
  const dialect = new PgDialect();

  it("builds a correlated predicate for anonymous public reads", () => {
    const query = dialect.sqlToQuery(communityAuthorVisiblePredicate(sql.raw("posts.user_id")));
    const normalizedSql = query.sql.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

    expect(normalizedSql).toBe(
      "NOT EXISTS (SELECT 1 FROM community_author_mutes AS cam WHERE cam.user_id = posts.user_id)",
    );
    expect(query.params).toEqual([]);
  });

  it("allows a viewer to retain access to their own muted rows", () => {
    const query = dialect.sqlToQuery(communityAuthorVisiblePredicate(sql.raw("posts.user_id"), 42));
    const normalizedSql = query.sql.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

    expect(normalizedSql).toBe(
      "(posts.user_id = $1 OR NOT EXISTS (SELECT 1 FROM community_author_mutes AS cam WHERE cam.user_id = posts.user_id))",
    );
    expect(query.params).toEqual([42]);
  });
});
