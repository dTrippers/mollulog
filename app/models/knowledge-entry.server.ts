import { getPostgresPublishedInlineKnowledgeEntries } from "~/db/postgres/knowledge-entry";
import type { PublicKnowledgeEntry } from "./knowledge-entry";

export type { PublicKnowledgeEntry } from "./knowledge-entry";

export async function getPublishedInlineKnowledgeEntries(
  env: Env,
  options: { ctx?: ExecutionContext } = {},
): Promise<PublicKnowledgeEntry[]> {
  return getPostgresPublishedInlineKnowledgeEntries(env, options);
}
