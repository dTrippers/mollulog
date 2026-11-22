import { Marked, marked } from "marked";
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

const chatMarkdown = new Marked({ breaks: true });
chatMarkdown.use({
  extensions: [{
    name: "chatStrong",
    level: "inline",
    start(source) {
      const index = source.indexOf("**");
      return index === -1 ? undefined : index;
    },
    tokenizer(source) {
      const match = /^\*\*(\S(?:[^\n]*?\S)?)\*\*/u.exec(source);
      if (match === null) return undefined;
      const text = match[1];
      if (text === undefined) return undefined;
      return {
        type: "chatStrong",
        raw: match[0],
        text,
        tokens: this.lexer.inlineTokens(text),
      };
    },
    renderer(token) {
      return `<strong>${this.parser.parseInline(token.tokens ?? [])}</strong>`;
    },
  }],
});

export function renderMarkdownToSafeHtml(text: string): string {
  return sanitizeHtml(marked(text, { async: false }), {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
  });
}

export function renderChatMarkdownToSafeHtml(text: string): string {
  const markdownWithoutHtml = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "").replace(/<[^>]*>/g, "");
  return sanitizeHtml(chatMarkdown.parse(markdownWithoutHtml, { async: false }), {
    allowedTags: ["p", "strong", "ul", "ol", "li", "br"],
    allowedAttributes: {},
    allowVulnerableTags: false,
  });
}
