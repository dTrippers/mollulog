import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Markdown is rendered in loaders so marked and sanitize-html (with its postcss dependency) stay out of the client
// bundle. This allowlist is a security boundary: the returned HTML is injected as-is by MarkdownText and
// MarkdownContent.
const allowedTags = sanitizeHtml.defaults.allowedTags.concat(["img"]);
const allowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ["href", "name", "title"],
  img: ["src", "alt", "title", "width", "height", "loading"],
};

export function renderMarkdownToSafeHtml(text: string): string {
  return sanitizeHtml(marked(text, { async: false }), {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
  });
}
