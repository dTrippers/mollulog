import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPostgresPublishedStudentSummary } from "~/db/postgres/student-summary";

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

describe("PostgreSQL student summaries", () => {
  it("selects only the latest published revision and returns null when absent", async () => {
    const query = jest.fn<(...args: QueryCall) => Promise<{ rows: []; rowCount: number }>>(async () => ({
      rows: [],
      rowCount: 0,
    }));
    const client = createMockClient(query);

    const result = await getPostgresPublishedStudentSummary(env, "student1001", { createClient: () => client });

    expect(result).toBeNull();
    const queryCall = query.mock.calls.find(([value]) => typeof value === "object" && value !== null);
    expect(queryCall).toBeDefined();
    if (!queryCall) throw new Error("Expected a PostgreSQL query call");
    const [queryConfig, queryValues] = queryCall;
    expect(queryConfig.text).toContain('"student_summary_revisions"."student_uid" = $1');
    expect(queryConfig.text).toContain('"student_summary_revisions"."published_at" is not null');
    expect(queryConfig.text).toContain(
      'order by "student_summary_revisions"."published_at" desc, "student_summary_revisions"."id" desc',
    );
    expect(queryConfig.text).toContain("limit $2");
    expect(queryValues).toEqual(["student1001", 1]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("maps the latest published row to the minimal public summary type", async () => {
    const query = jest.fn<(...args: QueryCall) => Promise<{ rows: [string, Date][]; rowCount: number }>>(async () => ({
      rows: [["게릴라 유닛 운영이 뛰어난 학생이에요", new Date("2026-09-18T09:00:00.000Z")]],
      rowCount: 1,
    }));
    const client = createMockClient(query);

    const result = await getPostgresPublishedStudentSummary(env, "student1001", { createClient: () => client });

    expect(result).toEqual({
      summary: "게릴라 유닛 운영이 뛰어난 학생이에요",
      publishedAt: "2026-09-18T09:00:00.000Z",
    });
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty student UID before opening a connection", async () => {
    const query = jest.fn<(...args: QueryCall) => Promise<{ rows: []; rowCount: number }>>(async () => ({
      rows: [],
      rowCount: 0,
    }));
    const client = createMockClient(query);

    await expect(getPostgresPublishedStudentSummary(env, "", { createClient: () => client })).rejects.toThrow(
      "Student UID is required",
    );
    expect(query).not.toHaveBeenCalled();
    expect(client.connect).not.toHaveBeenCalled();
  });
});
