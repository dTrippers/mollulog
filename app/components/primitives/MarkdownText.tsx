import { marked } from "marked";

export default function MarkdownText({ text }: { text: string }) {
  return (
    <div className="prose prose-sm md:prose-base prose-neutral dark:prose-invert max-w-none prose-img:rounded-lg prose-p:my-1 prose-headings:mt-6 prose-headings:mb-2 prose-ul:my-2 prose-li:my-1 prose-hr:my-4 prose-img:my-4">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdown is rendered as trusted HTML in the current content pipeline */}
      <div dangerouslySetInnerHTML={{ __html: marked(text, { async: false }) }} />
    </div>
  );
}
