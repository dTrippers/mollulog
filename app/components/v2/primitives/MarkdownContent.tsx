import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { cn } from "~/lib/utils";

// The same sanitize rules as the 1.x MarkdownText. Keep them identical: this allowlist is a security boundary.
const allowedTags = sanitizeHtml.defaults.allowedTags.concat(["img"]);
const allowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ["href", "name", "title"],
  img: ["src", "alt", "title", "width", "height", "loading"],
};

// Visual size follows the markdown level: `#` and `##` read as the section size, `###` and deeper as the body-strong size.
const headingClassName = {
  large: "mt-8 mb-2 text-base leading-6 font-semibold text-v2-fg",
  small: "mt-6 mb-2 text-sm leading-5 font-semibold text-v2-fg",
} as const;

const headingPattern = /<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g;

// The DOM level starts at `headingLevel` for the shallowest body heading and steps by one per distinct markdown level, so
// the outline never skips a level (axe heading-order). The visual size still follows the markdown level.
function shiftHeadings(html: string, headingLevel: 2 | 3): string {
  const markdownLevels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]));
  if (markdownLevels.length === 0) {
    return html;
  }
  const distinctLevels = [...new Set(markdownLevels)].sort((a, b) => a - b);
  return html.replace(headingPattern, (_match, level: string, _attributes: string | undefined, content: string) => {
    const markdownLevel = Number(level);
    const domLevel = Math.min(6, headingLevel + distinctLevels.indexOf(markdownLevel));
    const visual = markdownLevel <= 2 ? headingClassName.large : headingClassName.small;
    return `<h${domLevel} class="${visual}">${content}</h${domLevel}>`;
  });
}

// Body typography and the image rule (A): left-aligned, a 1px divider boundary, height capped at min(60svh, 36rem), and
// the aspect ratio kept. Color comes from v2 tokens only.
const contentClassName = cn(
  "break-keep text-sm leading-6 text-v2-fg-secondary [overflow-wrap:anywhere]",
  "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
  "[&_p]:my-3",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li>ul]:my-0 [&_li>ul]:[list-style-type:circle]",
  "[&_li]:my-1 [&_li::marker]:text-v2-fg-tertiary",
  "[&_a]:font-medium [&_a]:text-v2-link [&_a]:underline [&_a]:decoration-v2-link [&_a]:underline-offset-2",
  "[&_a:hover]:decoration-2",
  "[&_strong]:font-semibold [&_strong]:text-v2-fg [&_a_strong]:text-v2-link",
  "[&_hr]:my-6 [&_hr]:border-v2-divider",
  "[&_img]:my-5 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:max-h-[min(60svh,36rem)]",
  "[&_img]:rounded-md [&_img]:bg-v2-inset [&_img]:outline-1 [&_img]:-outline-offset-1 [&_img]:outline-v2-divider",
);

export type MarkdownContentProps = {
  text: string;
  // The DOM level of the shallowest body heading: 2 on the detail page, 3 inside an expanded list post.
  headingLevel: 2 | 3;
};

export function MarkdownContent({ text, headingLevel }: MarkdownContentProps) {
  const html = sanitizeHtml(marked(text, { async: false }), {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
  });

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown is sanitized before injection
    <div className={contentClassName} dangerouslySetInnerHTML={{ __html: shiftHeadings(html, headingLevel) }} />
  );
}
