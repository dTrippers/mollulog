import { describe, expect, it } from "@jest/globals";
import {
  GUIDE_BODY_LIMITS,
  guideBodyPlainText,
  InvalidGuideBodyError,
  isGuideBodyEmpty,
  normalizeGuideLinkHref,
  parseGuideBody,
  parseYouTubeVideoId,
} from "~/domain/guide-body";

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("parseGuideBody", () => {
  it("keeps the allowlisted nodes, marks, and attributes", () => {
    const body = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "1페이즈" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "굵게", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "https://example.com/a" } }] },
          { type: "mention", attrs: { kind: "party", id: "party-1" } },
          { type: "mention", attrs: { kind: "student", id: "10000" } },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph("항목"),
              { type: "orderedList", content: [{ type: "listItem", content: [paragraph("하위")] }] },
            ],
          },
        ],
      },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [paragraph("셋")] }] },
      { type: "horizontalRule" },
      { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
    );
    expect(parseGuideBody(body)).toEqual(body);
  });

  it("drops attributes outside the allowlist", () => {
    expect(
      parseGuideBody(
        doc({
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              text: "링크",
              marks: [{ type: "link", attrs: { href: "https://example.com", target: "_self", rel: null, class: "x" } }],
            },
            { type: "mention", attrs: { kind: "student", id: "10000", label: "저장된 이름" } },
          ],
        }),
      ),
    ).toEqual(
      doc({
        type: "paragraph",
        content: [
          { type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "https://example.com/" } }] },
          { type: "mention", attrs: { kind: "student", id: "10000" } },
        ],
      }),
    );
  });

  it("stores nothing for an empty body", () => {
    expect(parseGuideBody(null)).toBeNull();
    expect(parseGuideBody(doc({ type: "paragraph" }, paragraph("")))).toBeNull();
    expect(isGuideBodyEmpty(null)).toBe(true);
  });

  it.each([
    ["an unknown node", doc({ type: "codeBlock", content: [{ type: "text", text: "x" }] })],
    [
      "an unknown mark",
      doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "italic" }] }] }),
    ],
    ["a heading level other than 2", doc({ type: "heading", attrs: { level: 1 }, content: [] })],
    [
      "an unknown mention kind",
      doc({ type: "paragraph", content: [{ type: "mention", attrs: { kind: "user", id: "1" } }] }),
    ],
    [
      "a mention without an id",
      doc({ type: "paragraph", content: [{ type: "mention", attrs: { kind: "party", id: "" } }] }),
    ],
    ["an empty list", doc({ type: "bulletList", content: [] })],
    ["a document of another type", { type: "paragraph", content: [] }],
  ])("rejects %s", (_name, body) => {
    expect(() => parseGuideBody(body)).toThrow(InvalidGuideBodyError);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "/relative",
    "mailto:a@example.com",
  ])("rejects the link %s", (href) => {
    expect(() =>
      parseGuideBody(
        doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }] }),
      ),
    ).toThrow("본문의 링크 주소를 확인해 주세요.");
  });

  it("rejects a video id that is not a YouTube id", () => {
    expect(() => parseGuideBody(doc({ type: "youtube", attrs: { videoId: "../embed" } }))).toThrow(
      "본문의 유튜브 영상 주소를 확인해 주세요.",
    );
  });

  it("limits the text length, counting a mention or a video as one character", () => {
    const limit = GUIDE_BODY_LIMITS.characters;
    expect(parseGuideBody(doc(paragraph("가".repeat(limit))))).not.toBeNull();
    expect(() =>
      parseGuideBody(doc(paragraph("가".repeat(limit)), { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } })),
    ).toThrow("본문은 20,000자까지 쓸 수 있어요.");
  });

  it("limits list depth", () => {
    let list: unknown = { type: "bulletList", content: [{ type: "listItem", content: [paragraph("x")] }] };
    for (let depth = 1; depth <= GUIDE_BODY_LIMITS.listDepth; depth += 1) {
      list = { type: "bulletList", content: [{ type: "listItem", content: [paragraph("x"), list] }] };
    }
    expect(() => parseGuideBody(doc(list))).toThrow(InvalidGuideBodyError);
  });

  it("accepts the shape the description backfill writes", () => {
    // db/operations/20261123120100_backfill_raid_walkthrough_body.sql: one paragraph per line, an empty line as an
    // empty paragraph, and each http(s) URL as a link on its own text node.
    const migrated = doc(
      {
        type: "paragraph",
        content: [
          { type: "text", text: "영상: " },
          {
            type: "text",
            text: "https://arca.live/b/bluearchive/178625181",
            marks: [{ type: "link", attrs: { href: "https://arca.live/b/bluearchive/178625181" } }],
          },
        ],
      },
      { type: "paragraph" },
      paragraph("2파티는 예비"),
    );
    expect(parseGuideBody(migrated)).toEqual(migrated);
  });
});

describe("guide body helpers", () => {
  it("accepts only http and https links", () => {
    expect(normalizeGuideLinkHref(" https://example.com/a b ")).toBe("https://example.com/a%20b");
    expect(normalizeGuideLinkHref("ftp://example.com")).toBeNull();
    expect(normalizeGuideLinkHref(`https://example.com/${"a".repeat(GUIDE_BODY_LIMITS.urlLength)}`)).toBeNull();
  });

  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/channel/UC123", null],
    ["https://example.com/watch?v=dQw4w9WgXcQ", null],
  ])("reads the YouTube id of %s", (url, id) => {
    expect(parseYouTubeVideoId(url)).toBe(id);
  });

  it("writes the body as plain lines with mentions by their current names", () => {
    const body = parseGuideBody(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "준비" }] },
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { kind: "party", id: "p1" } },
            { type: "text", text: "에서 " },
            { type: "mention", attrs: { kind: "student", id: "10000" } },
            { type: "text", text: " EX" },
          ],
        },
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph("하나")] }] },
        { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
        { type: "horizontalRule" },
      ),
    );
    expect(guideBodyPlainText(body, (kind, id) => (kind === "party" ? "파티 1" : id === "10000" ? "아루" : "?"))).toBe(
      "준비\n파티 1에서 아루 EX\n하나",
    );
  });
});
