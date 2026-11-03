import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerBlocks } from "~/routes/chat._components/AnswerBlocks";
import { renderChatMarkdownToSafeHtml, renderMarkdownToSafeHtml } from "~/lib/markdown.server";

describe("chat answer blocks", () => {
  it("renders only the chat markdown allowlist for untrusted content", () => {
    const html = renderChatMarkdownToSafeHtml("<script>alert(1)</script>안전 **강조** [링크](https://example.com) ![이미지](https://example.com/a.png)\n\n<ul onclick=alert(1)><li>원문 HTML</li></ul>");
    expect(html).toContain("<strong>강조</strong>");
    expect(html).toContain("안전");
    expect(html).toContain("링크");
    expect(html).not.toMatch(/<(?:script|a|img|ul[^>]*onclick)/i);
    expect(html).not.toContain("alert(1)");
  });

  it("renders chat bold before Korean particles and inside list items", () => {
    const html = renderChatMarkdownToSafeHtml([
      "**이로하(수영복)**의 편성률이 더 높습니다.",
      "**수영복 이부키**를 선택할 수 있습니다.",
      "**시로&쿠로**에서 확인했습니다.",
      "- **이로하(수영복)**의 편성률",
    ].join("\n\n"));

    expect(html).toContain("<strong>이로하(수영복)</strong>의 편성률이 더 높습니다.");
    expect(html).toContain("<strong>수영복 이부키</strong>를 선택할 수 있습니다.");
    expect(html).toContain("<strong>시로&amp;쿠로</strong>에서 확인했습니다.");
    expect(html).toMatch(/<li>\s*<strong>이로하\(수영복\)<\/strong>의 편성률\s*<\/li>/);
    expect(html).not.toContain("**");
  });

  it("keeps spaced and unmatched double asterisks literal and leaves post Markdown unchanged", () => {
    const chatHtml = renderChatMarkdownToSafeHtml("2 ** 3\n\nunmatched ** marker");
    expect(chatHtml).toContain("2 ** 3");
    expect(chatHtml).toContain("unmatched ** marker");
    expect(chatHtml).not.toContain("<strong>");

    const postHtml = renderMarkdownToSafeHtml("**이로하(수영복)**의 편성률");
    expect(postHtml).toContain("**이로하(수영복)**의 편성률");
    expect(postHtml).not.toContain("<strong>");
  });

  it("keeps the accessible bar grid compact and renders legacy text unchanged", () => {
    const chart = renderToStaticMarkup(<AnswerBlocks blocks={[{
      type: "bar_chart", title: "사용률", unit: "fraction", categories: ["루나틱", "토먼트"],
      series: [
        { name: "미카", sourceId: "s1", subject: { type: "student", uid: "student-1" }, values: [0.0004, null] },
        { name: "아리스", sourceId: "s2", values: [0.441, 0] },
      ],
    }]} />);
    expect(chart).toContain("aria-hidden=\"true\"");
    expect(chart).toContain("<table class=\"sr-only\">");
    expect(chart).toContain("grid-cols-[fit-content(6rem)_minmax(0,1fr)_auto]");
    expect(chart).toContain("&lt;0.1%");
    expect(chart).toContain("–");
    expect(renderToStaticMarkup(<AnswerBlocks blocks={[{ type: "plaintext", text: "**기존 평문**" }]} />)).toContain("**기존 평문**");
  });

  it("omits the legend for an unnamed points series and labels its table column", () => {
    const chart = renderToStaticMarkup(<AnswerBlocks blocks={[{
      type: "bar_chart", title: "직접 편성 비율", unit: "percent", categories: ["아코", "히마리"],
      series: [{ name: null, sourceIds: ["s1", "s2"], values: [32.3, 40.1] }],
    }]} />);
    expect(chart).not.toContain("<ul");
    expect(chart).toContain("<th scope=\"col\">값</th>");
    expect(chart).toContain("아코");
    expect(chart).toContain("40.1%");
  });
});
