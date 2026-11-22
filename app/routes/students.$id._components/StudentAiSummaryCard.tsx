import { SparklesIcon } from "@heroicons/react/24/outline";
import { KnowledgeAnnotatedText } from "./StudentKnowledgeAnnotations";
import type { PublicKnowledgeEntry } from "~/models/knowledge-entry";

export default function StudentAiSummaryCard({ summary, entries }: { summary: string; entries: PublicKnowledgeEntry[] }) {
  return (
    <section className="mt-3 rounded-lg bg-v2-surface p-3 md:p-v2-block-p" aria-labelledby="student-ai-summary-title">
      <h3 id="student-ai-summary-title" className="flex items-center gap-1.5 text-sm leading-[1.43] font-semibold">
        <SparklesIcon className="size-4 text-v2-info" aria-hidden="true" />
        <span className="bg-v2-ai-gradient bg-clip-text text-transparent">AI 요약</span>
      </h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-[1.43] text-v2-fg-secondary">
        <KnowledgeAnnotatedText text={summary} entries={entries} />
      </p>
      <p className="mt-2 text-xs leading-[1.43] text-v2-fg-tertiary">AI가 생성한 결과로 내용이 부정확할 수 있어요</p>
    </section>
  );
}
