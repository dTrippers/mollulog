import { MarkdownText } from "~/components/primitives";

type LegalDocumentProps = {
  content: string;
};

export default function LegalDocument({ content }: LegalDocumentProps) {
  return (
    <article className="max-w-3xl rounded-lg bg-card p-5 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
      <MarkdownText text={content} />
    </article>
  );
}
