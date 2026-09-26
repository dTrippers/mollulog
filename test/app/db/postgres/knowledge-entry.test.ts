import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPostgresPublishedInlineKnowledgeEntries } from "~/db/postgres/knowledge-entry";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };

type QueryConfig = { text?: string; values?: unknown[] };
type QueryCall = [QueryConfig, unknown[]];

function createMockClient(query: ReturnType<typeof jest.fn>) {
  return {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
}

describe("PostgreSQL public knowledge entries", () => {
  it("reads only current published inline terms and returns display fields", async () => {
    const query = jest.fn<(...args: QueryCall) => Promise<{ rows: [string, string[], string][]; rowCount: number }>>(
      async () => ({
        rows: [["공포", ["공포"], "대상이 잠시 행동하지 못하는 상태 이상이에요."]],
        rowCount: 1,
      }),
    );
    const client = createMockClient(query);

    const result = await getPostgresPublishedInlineKnowledgeEntries(env, { createClient: () => client });

    expect(result).toEqual([
      { title: "공포", aliases: ["공포"], body: "대상이 잠시 행동하지 못하는 상태 이상이에요." },
    ]);
    const queryCall = query.mock.calls.find(([value]) => typeof value === "object" && value !== null);
    expect(queryCall).toBeDefined();
    if (!queryCall) throw new Error("Expected a PostgreSQL query call");
    expect(queryCall[0].text).toContain('"knowledge_entries"."kind" = $1');
    expect(queryCall[0].text).toContain('"knowledge_entries"."archived_at" is null');
    expect(queryCall[0].text).toContain('"knowledge_entry_revisions"."status" = $2');
    expect(queryCall[0].text).toContain('"knowledge_entry_revisions"."inline_enabled" = $3');
    expect(queryCall[0].text).toContain(
      '"knowledge_entry_revisions"."id" = "knowledge_entries"."published_revision_id"',
    );
    expect(queryCall[0].text).toContain('"knowledge_entry_revisions"."entry_id" = "knowledge_entries"."id"');
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed public rows rather than turning them into an empty glossary", async () => {
    const query = jest.fn<(...args: QueryCall) => Promise<{ rows: [string, string[], string][]; rowCount: number }>>(
      async () => ({ rows: [["공포", ["두려움"], "설명"]], rowCount: 1 }),
    );
    const client = createMockClient(query);

    await expect(getPostgresPublishedInlineKnowledgeEntries(env, { createClient: () => client })).rejects.toThrow(
      "aliases must include its title",
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("returns a valid empty result when no public term is available", async () => {
    const query = jest.fn<(...args: QueryCall) => Promise<{ rows: []; rowCount: number }>>(async () => ({
      rows: [],
      rowCount: 0,
    }));
    const client = createMockClient(query);

    await expect(getPostgresPublishedInlineKnowledgeEntries(env, { createClient: () => client })).resolves.toEqual([]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
