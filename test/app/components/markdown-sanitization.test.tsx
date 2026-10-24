import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownText from "~/components/primitives/MarkdownText";
import { MarkdownContent } from "~/components/v2/primitives/MarkdownContent";

describe.each([
  ["MarkdownText", (text: string) => renderToStaticMarkup(<MarkdownText text={text} />)],
  ["MarkdownContent", (text: string) => renderToStaticMarkup(<MarkdownContent text={text} headingLevel={2} />)],
] as const)("%s sanitization", (_name, render) => {
  it("rejects encoded executable URLs and event handlers while preserving safe content", () => {
    const markup = render(
      [
        '<a href="java&#000000115;cript:alert(1)">encoded scheme</a>',
        '<img src="https://mollulog.net/safe.png" onerror="alert(1)" alt="safe image">',
        '<script>alert("script")</script>',
        '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
        '<svg><animate attributeName="href" values="javascript:alert(1)"></animate></svg>',
        "[safe link](https://mollulog.net/news)",
      ].join("\n\n"),
    );

    expect(markup).not.toMatch(/javascript:|onerror|<script|<meta|<svg|<animate/i);
    expect(markup).toContain('src="https://mollulog.net/safe.png"');
    expect(markup).toContain('alt="safe image"');
    expect(markup).toContain('href="https://mollulog.net/news"');
  });
});
