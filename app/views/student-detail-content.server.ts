import type { PublicKnowledgeEntry } from "~/models/knowledge-entry";
import { getPublishedInlineKnowledgeEntries } from "~/models/knowledge-entry.server";
import type { StudentSummary } from "~/models/student-summary";
import { getPublishedStudentSummary } from "~/models/student-summary.server";

export type StudentDetailContent = {
  publishedSummary: StudentSummary | null;
  publishedSummaryError: unknown | null;
  knowledgeEntries: PublicKnowledgeEntry[];
  knowledgeLookupStatus: "available" | "failed";
  knowledgeLookupError: unknown | null;
};

/** Composes the independently stored student summary and public inline glossary. */
export async function getStudentDetailContent(
  env: Env,
  studentUid: string,
  options: { ctx?: ExecutionContext } = {},
): Promise<StudentDetailContent> {
  const [summaryResult, knowledgeResult] = await Promise.allSettled([
    getPublishedStudentSummary(env, studentUid, options),
    getPublishedInlineKnowledgeEntries(env, options),
  ]);

  return {
    publishedSummary: summaryResult.status === "fulfilled" ? summaryResult.value : null,
    publishedSummaryError: summaryResult.status === "rejected" ? summaryResult.reason : null,
    knowledgeEntries: knowledgeResult.status === "fulfilled" ? knowledgeResult.value : [],
    knowledgeLookupStatus: knowledgeResult.status === "fulfilled" ? "available" : "failed",
    knowledgeLookupError: knowledgeResult.status === "rejected" ? knowledgeResult.reason : null,
  };
}
