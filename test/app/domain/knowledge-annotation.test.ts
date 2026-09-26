import { describe, expect, it } from "@jest/globals";
import { annotateKnowledgeDescriptionParts, annotateKnowledgeText } from "~/domain/knowledge-annotation";
import type { KnowledgeAnnotationSegment, PublicKnowledgeEntry } from "~/models/knowledge-entry";

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

function originalText(segments: readonly KnowledgeAnnotationSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

describe("knowledge annotation", () => {
  it("finds a registered alias without consuming the letters after it", () => {
    const source = "공포를 부여하고 공포 상태";
    const segments = annotateKnowledgeText(source, [fear]);

    expect(segments).toEqual([
      { kind: "term", text: "공포", noWrapTailLength: 1, entry: fear },
      { kind: "text", text: "를 부여하고 공포 상태" },
    ]);
    expect(originalText(segments)).toBe(source);
  });

  it("prefers the longest matching alias and accepts registered spacing variants", () => {
    const segments = annotateKnowledgeText("군중 제어를 설명하고 CC 효과", [crowdControl]);

    expect(segments[0]).toEqual({ kind: "term", text: "군중 제어", noWrapTailLength: 1, entry: crowdControl });
    expect(segments.slice(1)).toEqual([{ kind: "text", text: "를 설명하고 CC 효과" }]);
  });

  it("prefers a longer entry alias over a shorter alias at the same position", () => {
    const enhancedCrowdControl: PublicKnowledgeEntry = {
      title: "군중제어 강화력",
      aliases: ["군중제어 강화력"],
      body: "군중제어 강화력 설명",
    };
    const source = "군중제어 강화력 증가";

    expect(annotateKnowledgeText(source, [crowdControl, enhancedCrowdControl])).toEqual([
      { kind: "term", text: "군중제어 강화력", noWrapTailLength: 0, entry: enhancedCrowdControl },
      { kind: "text", text: " 증가" },
    ]);
  });

  it("matches aliases inside longer words but does not match across line breaks", () => {
    const source = "극공포와 공포증";
    const segments = annotateKnowledgeText(source, [fear]);

    expect(segments).toEqual([
      { kind: "text", text: "극" },
      { kind: "term", text: "공포", noWrapTailLength: 1, entry: fear },
      { kind: "text", text: "와 공포증" },
    ]);
    expect(originalText(segments)).toBe(source);
    expect(annotateKnowledgeText("공\n포", [fear])).toEqual([{ kind: "text", text: "공\n포" }]);
  });

  it("binds trailing text through the next whitespace or static-part end without changing matches", () => {
    const source = "공포(3.9초간 적용";
    const segments = annotateKnowledgeText(source, [fear]);
    const firstTerm = segments[0];

    expect(firstTerm).toMatchObject({ kind: "term", text: "공포" });
    if (firstTerm.kind !== "term") throw new Error("Expected a term segment");
    expect(source.slice(firstTerm.text.length, firstTerm.text.length + firstTerm.noWrapTailLength)).toBe("(3.9초간");
    expect(annotateKnowledgeText("공포(", [fear])[0]).toMatchObject({ kind: "term", noWrapTailLength: 1 });

    const multipleMatches = annotateKnowledgeText("공포(군중제어 효과", [fear, crowdControl]);
    expect(multipleMatches.filter((segment) => segment.kind === "term").map((segment) => segment.entry.title)).toEqual([
      "공포",
      "군중제어",
    ]);
    expect(originalText(multipleMatches)).toBe("공포(군중제어 효과");
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

  it("matches punctuation in aliases literally", () => {
    const special: PublicKnowledgeEntry = { title: "A+B", aliases: ["A+B"], body: "문자 그대로" };

    expect(annotateKnowledgeText("A+B와 AB", [special])).toEqual([
      { kind: "term", text: "A+B", noWrapTailLength: 1, entry: special },
      { kind: "text", text: "와 AB" },
    ]);
  });

  it.each(["를", "에게서는", "증", "고", "며", "이고"])("matches without a suffix list: %s", (suffix) => {
    const source = `공포${suffix} 설명`;
    const segments = annotateKnowledgeText(source, [fear]);

    expect(segments[0]).toMatchObject({ kind: "term", text: "공포", noWrapTailLength: suffix.length });
    expect(originalText(segments)).toBe(source);
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

    expect(parts[0].segments[0]).toMatchObject({ kind: "term", text: "공포" });
    expect(parts[1].segments).toEqual([{ kind: "text", text: "30%" }]);
    expect(parts[2].segments).toEqual([{ kind: "text", text: "공포 상태" }]);
    expect(parts.map((part) => originalText(part.segments)).join("")).toBe("공포를 부여30%공포 상태");
  });
});
