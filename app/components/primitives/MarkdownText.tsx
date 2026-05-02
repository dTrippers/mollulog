import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const allowedTags = sanitizeHtml.defaults.allowedTags.concat(["img"]);
const allowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ["href", "name", "title"],
  img: ["src", "alt", "title", "width", "height", "loading"],
};

export default function MarkdownText({ text }: { text: string }) {
  const html = sanitizeHtml(marked(text, { async: false }), {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
  });

  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-img:rounded-lg prose-p:my-3 prose-headings:my-4 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-hr:my-6 prose-img:my-5">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown is sanitized before injection */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
