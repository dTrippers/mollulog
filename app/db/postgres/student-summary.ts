import { and, desc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { StudentSummary } from "~/models/student-summary";
import { normalizeInstant } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import { pgStudentSummaryRevisionsTable } from "./schema";

export type PostgresStudentSummaryOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

function normalizePostgresInstant(value: string | Date) {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

async function selectPublished(
  env: Pick<Env, "HYPERDRIVE">,
  studentUid: string,
  options: PostgresStudentSummaryOptions,
): Promise<StudentSummary | null> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("db.collection.name", "student_summary_revisions");
        const rows = await drizzle(client)
          .select({
            summary: pgStudentSummaryRevisionsTable.summary,
            publishedAt: pgStudentSummaryRevisionsTable.publishedAt,
          })
          .from(pgStudentSummaryRevisionsTable)
          .where(
            and(
              eq(pgStudentSummaryRevisionsTable.studentUid, studentUid),
              isNotNull(pgStudentSummaryRevisionsTable.publishedAt),
            ),
          )
          .orderBy(desc(pgStudentSummaryRevisionsTable.publishedAt), desc(pgStudentSummaryRevisionsTable.id))
          .limit(1);
        span?.setAttribute("db.response.returned_rows", rows.length);
        const row = rows[0];
        if (!row) return null;
        if (!row.publishedAt) {
          throw new Error(`Published student summary for ${studentUid} has no published_at`);
        }
        return {
          summary: row.summary,
          publishedAt: normalizePostgresInstant(row.publishedAt),
        };
      };
      return ctx
        ? ctx.tracing.enterSpan("postgres.student_summary_revisions.get_published", execute)
        : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresPublishedStudentSummary(
  env: Pick<Env, "HYPERDRIVE">,
  studentUid: string,
  options: PostgresStudentSummaryOptions = {},
): Promise<StudentSummary | null> {
  if (!studentUid) {
    throw new Error("Student UID is required to load a published summary");
  }
  return selectPublished(env, studentUid, options);
}
