import { marked } from "marked";

export default function MarkdownText({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-img:rounded-lg prose-p:my-3 prose-headings:my-4 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-hr:my-6 prose-img:my-5">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdown is rendered as trusted HTML in the current content pipeline */}
      <div dangerouslySetInnerHTML={{ __html: marked(text, { async: false }) }} />
    </div>
  );
}
