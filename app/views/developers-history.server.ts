import type { ApiAuditHistoryFilter } from "~/domain/api-audit-history";
import { getItemCatalogResources } from "~/models/item-catalog";
import type { ApiAuditEvent } from "~/models/mollulog-api";
import { getApiAuditHistory, getPersonalApiKeys } from "~/models/mollulog-api";
import { getAllStudents } from "~/models/student";

export async function getDevelopersHistoryView(
  env: Env,
  userId: number,
  { cursor, filter, ctx }: { cursor: string | null; filter: ApiAuditHistoryFilter; ctx?: ExecutionContext },
): Promise<{
  events: ApiAuditEvent[];
  nextCursor: string | null;
  filter: ApiAuditHistoryFilter;
  studentsByUid: Record<string, string>;
  itemNamesByUid: Record<string, string>;
  apiKeysByUid: Record<
    string,
    { readScope: boolean; writeScope: boolean; createdAt: string; expiresAt: string; revokedAt: string | null }
  >;
}> {
  const [history, students, itemResources, apiKeys] = await Promise.all([
    getApiAuditHistory(env, userId, { limit: 50, cursor, filter }, { ctx }),
    getAllStudents(env, true),
    getItemCatalogResources(env),
    getPersonalApiKeys(env, userId, { ctx }),
  ]);

  return {
    events: history.events,
    nextCursor: history.nextCursor,
    filter,
    studentsByUid: Object.fromEntries(students.map(({ uid, name }) => [uid, name])),
    itemNamesByUid: Object.fromEntries(itemResources.map(({ uid, name }) => [uid, name])),
    apiKeysByUid: Object.fromEntries(
      apiKeys.map(({ uid, readScope, writeScope, createdAt, expiresAt, revokedAt }) => [
        uid,
        {
          readScope,
          writeScope,
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          revokedAt: revokedAt?.toISOString() ?? null,
        },
      ]),
    ),
  };
}
