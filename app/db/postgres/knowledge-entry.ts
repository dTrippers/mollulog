import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PostgresClientFactory } from "~/lib/postgres.server";
import { createPostgresClient, withPostgresClient } from "~/lib/postgres.server";
import type { PublicKnowledgeEntry } from "~/models/knowledge-entry";
import { pgKnowledgeEntriesTable, pgKnowledgeEntryRevisionsTable } from "./schema";

export type PostgresKnowledgeEntryOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function parsePublicKnowledgeEntry(value: {
  title: string;
  aliases: unknown;
  body: string | null;
}): PublicKnowledgeEntry {
  if (!value.title.trim() || !value.body?.trim()) {
    throw new Error("Published knowledge entry is missing display text");
  }
  if (!Array.isArray(value.aliases) || !value.aliases.every((alias) => typeof alias === "string" && alias.trim())) {
    throw new Error("Published knowledge entry has invalid aliases");
  }
  if (!value.aliases.includes(value.title)) {
    throw new Error("Published knowledge entry aliases must include its title");
  }
  return { title: value.title, aliases: [...value.aliases], body: value.body };
}

export async function getPostgresPublishedInlineKnowledgeEntries(
  env: Pick<Env, "HYPERDRIVE">,
  options: PostgresKnowledgeEntryOptions = {},
): Promise<PublicKnowledgeEntry[]> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "knowledge_entries");
        const rows = await drizzle(client)
          .select({
            title: pgKnowledgeEntryRevisionsTable.title,
            aliases: pgKnowledgeEntryRevisionsTable.aliases,
            body: pgKnowledgeEntryRevisionsTable.body,
          })
          .from(pgKnowledgeEntriesTable)
          .innerJoin(
            pgKnowledgeEntryRevisionsTable,
            and(
              eq(pgKnowledgeEntryRevisionsTable.entryId, pgKnowledgeEntriesTable.id),
              eq(pgKnowledgeEntryRevisionsTable.id, pgKnowledgeEntriesTable.publishedRevisionId),
            ),
          )
          .where(
            and(
              eq(pgKnowledgeEntriesTable.kind, "term"),
              isNull(pgKnowledgeEntriesTable.archivedAt),
              isNotNull(pgKnowledgeEntriesTable.publishedRevisionId),
              eq(pgKnowledgeEntryRevisionsTable.status, "published"),
              eq(pgKnowledgeEntryRevisionsTable.inlineEnabled, true),
            ),
          )
          .orderBy(asc(pgKnowledgeEntryRevisionsTable.id));
        span?.setAttribute("db.response.returned_rows", rows.length);
        return rows.map(parsePublicKnowledgeEntry);
      };
      return ctx ? ctx.tracing.enterSpan("postgres.knowledge_entries.get_public_inline", execute) : execute();
    },
    createClient,
    ctx,
  );
}
