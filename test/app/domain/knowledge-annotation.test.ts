import { describe, expect, it } from "@jest/globals";
import { annotateKnowledgeDescriptionParts, annotateKnowledgeText } from "~/domain/knowledge-annotation";
import type { PublicKnowledgeEntry } from "~/models/knowledge-entry";

const fear: PublicKnowledgeEntry = {
  title: "공포",
  aliases: ["공포"],
  body: "공포 설명",
};

const crowdControl: PublicKnowledgeEntry = {
  title: "군중제어",
  aliases: ["군중제어", "군중 제어", "CC"],
  body: "군중제어 설명",
};

describe("knowledge annotation", () => {
  it("preserves source text and groups a recognized postposition with the first match", () => {
    const segments = annotateKnowledgeText("공포를 부여하고 공포 상태", [fear]);

    expect(segments).toEqual([
      { kind: "term", text: "공포", suffix: "를", noWrapTailLength: 0, entry: fear },
      { kind: "text", text: " 부여하고 공포 상태" },
    ]);
    expect(segments.map((segment) => segment.text + (segment.kind === "term" ? segment.suffix : "")).join("")).toBe(
      "공포를 부여하고 공포 상태",
    );
  });

  it("prefers the longest matching alias and accepts registered spacing variants", () => {
    const segments = annotateKnowledgeText("군중 제어를 설명하고 CC 효과", [crowdControl]);

    expect(segments[0]).toEqual({
      kind: "term",
      text: "군중 제어",
      suffix: "를",
      noWrapTailLength: 0,
      entry: crowdControl,
    });
    expect(segments.slice(1)).toEqual([{ kind: "text", text: " 설명하고 CC 효과" }]);
  });

  it("does not annotate arbitrary substrings or match across line breaks", () => {
    expect(annotateKnowledgeText("극공포 상태공포\n상태", [fear])).toEqual([
      { kind: "text", text: "극공포 상태공포\n상태" },
    ]);
  });

  it("binds punctuation through the next whitespace or static-part end without changing matches", () => {
    const withWhitespace = "공포(3.9초간 적용";
    const spacedSegments = annotateKnowledgeText(withWhitespace, [fear]);
    const firstTerm = spacedSegments[0];

    expect(firstTerm).toMatchObject({ kind: "term", text: "공포", suffix: "" });
    if (firstTerm.kind !== "term") throw new Error("Expected a term segment");
    const trailingStart = firstTerm.text.length + firstTerm.suffix.length;
    expect(withWhitespace.slice(trailingStart, trailingStart + firstTerm.noWrapTailLength)).toBe("(3.9초간");

    const atPartEnd = annotateKnowledgeText("공포(", [fear]);
    expect(atPartEnd[0]).toMatchObject({ kind: "term", noWrapTailLength: 1 });

    const multipleMatches = annotateKnowledgeText("공포(군중제어 효과", [fear, crowdControl]);
    expect(multipleMatches.filter((segment) => segment.kind === "term").map((segment) => segment.entry.title)).toEqual([
      "공포",
      "군중제어",
    ]);
    expect(
      multipleMatches.map((segment) => segment.text + (segment.kind === "term" ? segment.suffix : "")).join(""),
    ).toBe("공포(군중제어 효과");
  });

  it("does not extend a static no-wrap tail into a dynamic description part", () => {
    const parts = annotateKnowledgeDescriptionParts(
      [
        { key: "text-0", text: "공포(", dynamic: false, emphasized: false },
        { key: "value-1", text: "3.9초간", dynamic: true, emphasized: true },
      ],
      [fear],
    );

    expect(parts[0].segments[0]).toMatchObject({ kind: "term", text: "공포", noWrapTailLength: 1 });
    expect(parts[1].segments).toEqual([{ kind: "text", text: "3.9초간" }]);
  });

  it("leaves aliases shared by different entries unannotated", () => {
    const duplicate = { ...fear, body: "다른 설명" };

    expect(annotateKnowledgeText("공포를 받음", [fear, duplicate])).toEqual([{ kind: "text", text: "공포를 받음" }]);
  });

  it("does not annotate a shorter alias nested inside a longer ambiguous expression", () => {
    const first: PublicKnowledgeEntry = { title: "군중 제어", aliases: ["군중 제어"], body: "첫 설명" };
    const second: PublicKnowledgeEntry = { title: "군중제어", aliases: ["군중제어"], body: "둘 설명" };
    const nested: PublicKnowledgeEntry = { title: "제어", aliases: ["제어"], body: "중첩 설명" };

    expect(annotateKnowledgeText("군중 제어 효과", [first, second, nested])).toEqual([
      { kind: "text", text: "군중 제어 효과" },
    ]);
  });

  it("matches regex punctuation literally", () => {
    const special: PublicKnowledgeEntry = { title: "A+B", aliases: ["A+B"], body: "문자 그대로" };

    expect(annotateKnowledgeText("A+B와 AB", [special])).toEqual([
      { kind: "term", text: "A+B", suffix: "와", noWrapTailLength: 0, entry: special },
      { kind: "text", text: " AB" },
    ]);
  });

  it.each([
    "라도",
    "에는",
    "에서는",
    "로서",
    "로써",
    "로서는",
    "로는",
    "와는",
    "과는",
    "랑은",
    "이랑은",
    "에도",
    "으로도",
    "로도",
    "이란",
    "란",
  ])("recognizes the noun particle %s", (particle) => {
    const source = `공포${particle} 설명`;
    const segments = annotateKnowledgeText(source, [fear]);

    expect(segments[0]).toMatchObject({ kind: "term", text: "공포", suffix: particle });
    expect(segments.map((segment) => segment.text + (segment.kind === "term" ? segment.suffix : "")).join("")).toBe(
      source,
    );
  });

  it("does not treat word continuation or copula endings as postpositions", () => {
    const source = "공포증 공포고 공포며 공포이고";

    expect(annotateKnowledgeText(source, [fear])).toEqual([{ kind: "text", text: source }]);
  });

  it("keeps dynamic skill values untouched and annotates only the first static occurrence", () => {
    const parts = annotateKnowledgeDescriptionParts(
      [
        { key: "text-0", text: "공포를 부여", dynamic: false, emphasized: false },
        { key: "value-8", text: "30%", dynamic: true, emphasized: true },
        { key: "text-12", text: "공포 상태", dynamic: false, emphasized: false },
      ],
      [fear],
    );

    expect(parts[0].segments[0]).toMatchObject({ kind: "term", text: "공포", suffix: "를" });
    expect(parts[1].segments).toEqual([{ kind: "text", text: "30%" }]);
    expect(parts[2].segments).toEqual([{ kind: "text", text: "공포 상태" }]);
    expect(
      parts
        .map((part) =>
          part.segments.map((segment) => segment.text + (segment.kind === "term" ? segment.suffix : "")).join(""),
        )
        .join(""),
    ).toBe("공포를 부여30%공포 상태");
  });
});
