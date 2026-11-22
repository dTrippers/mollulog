import { MarkdownText } from "~/components/primitives";

type LegalDocumentProps = {
  html: string;
};

export default function LegalDocument({ html }: LegalDocumentProps) {
  return (
    <article className="max-w-3xl rounded-lg bg-card p-5 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
      <MarkdownText html={html} />
    </article>
  );
}
