import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "~/components/v2/primitives/MarkdownContent";

function render(text: string, headingLevel: 2 | 3 = 2) {
  return renderToStaticMarkup(<MarkdownContent text={text} headingLevel={headingLevel} />);
}

describe("MarkdownContent", () => {
  it("starts the shallowest body heading at the given DOM level and never skips a level", () => {
    const markup = render("# 제목\n\n## 소제목\n\n### 세부\n\n## 다음 소제목");
    expect(markup).toMatch(/<h2 class="[^"]*">제목<\/h2>/);
    expect(markup).toMatch(/<h3 class="[^"]*">소제목<\/h3>/);
    expect(markup).toMatch(/<h4 class="[^"]*">세부<\/h4>/);
    expect(markup).not.toContain("<h5");
  });

  it("starts at h3 inside an expanded list post and keeps the visual size of the markdown level", () => {
    const markup = render("### 작은 제목\n\n#### 더 작은 제목", 3);
    expect(markup).toMatch(/<h3 class="mt-6 mb-2 text-sm[^"]*">작은 제목<\/h3>/);
    expect(markup).toMatch(/<h4 class="mt-6 mb-2 text-sm[^"]*">더 작은 제목<\/h4>/);
  });

  it("uses the large heading size for # and ## and the body-strong size for ###", () => {
    const markup = render("## 큰 제목\n\n### 중간 제목");
    expect(markup).toMatch(/<h2 class="mt-8 mb-2 text-base[^"]*">큰 제목<\/h2>/);
    expect(markup).toMatch(/<h3 class="mt-6 mb-2 text-sm[^"]*">중간 제목<\/h3>/);
  });

  it("keeps headings and emphasis primary while body text is quieter and links are blue", () => {
    const markup = render("# 제목\n\n본문 **강조** [링크](https://mollulog.net/news)");
    expect(markup).toContain("text-v2-fg-secondary");
    expect(markup).toContain('font-semibold text-v2-fg">제목</h2>');
    expect(markup).toContain("[&amp;_strong]:text-v2-fg");
    expect(markup).toContain("[&amp;_a]:text-v2-link");
    expect(markup).toContain('href="https://mollulog.net/news"');
  });

  it("uses circle markers for nested unordered lists and no extra gap above them", () => {
    const markup = render("- 상위\n  - 하위 항목");
    expect(markup).toContain("[&amp;_li&gt;ul]:[list-style-type:circle]");
    expect(markup).toContain("[&amp;_li&gt;ul]:my-0");
    expect(markup).toContain("<ul>");
  });

  it("keeps the 1.x sanitize allowlist: scripts, unsafe schemes, and protocol-relative links are removed", () => {
    const markup = render(
      [
        '<script>alert("x")</script>',
        '<a href="javascript:alert(1)" onclick="x()">나쁜 링크</a>',
        "[상대 주소](//evil.example.com/path)",
        "[안전한 링크](https://mollulog.net/news)",
        '<div style="color:red">본문</div>',
      ].join("\n\n"),
    );
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("onclick");
    expect(markup).not.toContain("evil.example.com");
    expect(markup).not.toContain("style=");
    expect(markup).toContain('href="https://mollulog.net/news"');
  });

  it("keeps image alt text and applies the v2 image rule to every image", () => {
    const markup = render("![작성된 설명](https://mollulog.net/a.png)");
    expect(markup).toContain('alt="작성된 설명"');
    expect(markup).toContain("[&amp;_img]:max-h-[min(60svh,36rem)]");
    expect(markup).toContain("[&amp;_img]:outline-v2-divider");
  });
});
