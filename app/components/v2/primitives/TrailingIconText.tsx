import type { ReactNode } from "react";

// Text followed by an inline icon, such as a link's chevron. The last word and the icon never break apart, so a wrapped
// name does not leave the icon alone on the next line. The text before the last space or line break wraps as usual, and
// a line break in the text is kept for a `whitespace-pre-line` parent.
export function TrailingIconText({ text, children }: { text: string; children: ReactNode }) {
  const trimmed = text.trimEnd();
  const match = /^([\s\S]*\s)(\S+)$/.exec(trimmed);
  const head = match ? match[1] : "";
  const lastWord = match ? match[2] : trimmed;
  return (
    <>
      {head}
      <span className="whitespace-nowrap">
        {lastWord}
        {children}
      </span>
    </>
  );
}
