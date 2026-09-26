import type { KnowledgeAnnotationSegment, PublicKnowledgeEntry } from "~/models/knowledge-entry";

export type AnnotatedKnowledgeDescriptionPart = {
  key: string;
  dynamic: boolean;
  emphasized: boolean;
  segments: KnowledgeAnnotationSegment[];
};

type AliasCandidate = {
  aliasCharacters: string[];
  entryIndex: number;
  entry: PublicKnowledgeEntry;
};

type NormalizedCharacter = {
  value: string;
  start: number;
  end: number;
};

const wordCharacter = /[\p{L}\p{N}_]/u;
const hangulCharacter = /\p{Script=Hangul}/u;
const horizontalWhitespace = /[^\S\r\n]/u;
const horizontalWhitespaceRuns = /[^\S\r\n]+/gu;

const koreanPostpositions = [
  "으로부터",
  "으로도",
  "에게서",
  "한테서",
  "에서부터",
  "으로써",
  "으로서",
  "에서는",
  "이라도",
  "이랑은",
  "이어서",
  "께서는",
  "께서",
  "와는",
  "과는",
  "랑은",
  "에는",
  "에도",
  "로서는",
  "로써",
  "로서",
  "로는",
  "로도",
  "라도",
  "이란",
  "란",
  "에게는",
  "한테는",
  "으로는",
  "에서도",
  "에게",
  "한테",
  "부터",
  "까지",
  "처럼",
  "보다",
  "마다",
  "밖에",
  "뿐",
  "만큼",
  "대로",
  "이라",
  "이나",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "과",
  "와",
  "에",
  "에서",
  "의",
  "로",
  "으로",
  "도",
  "만",
  "랑",
  "하고",
  "께",
  "씩",
  "조차",
  "마저",
  "커녕",
  "이랑",
].sort((left, right) => right.length - left.length);

/**
 * Annotates registered aliases while preserving every source character.
 * Whitespace may vary inside an alias; matching remains case-sensitive and
 * requires a token boundary or a recognized Korean postposition.
 */
export function annotateKnowledgeText(
  text: string,
  entries: readonly PublicKnowledgeEntry[],
  seenEntryIndexes = new Set<number>(),
): KnowledgeAnnotationSegment[] {
  if (text.length === 0 || entries.length === 0) return [{ kind: "text", text }];

  const normalizedText = normalizeText(text);
  if (normalizedText.length === 0) return [{ kind: "text", text }];

  const candidates = buildAliasCandidates(entries);
  if (candidates.length === 0) return [{ kind: "text", text }];

  const segments: KnowledgeAnnotationSegment[] = [];
  let cursor = 0;
  let normalizedIndex = 0;

  while (normalizedIndex < normalizedText.length) {
    const matchingCandidates = candidates.filter((candidate) =>
      candidateMatchesAt(candidate, normalizedText, normalizedIndex, text),
    );
    if (matchingCandidates.length === 0) {
      normalizedIndex += 1;
      continue;
    }

    const longestLength = matchingCandidates[0].aliasCharacters.length;
    const longestCandidates = matchingCandidates.filter(
      (candidate) => candidate.aliasCharacters.length === longestLength,
    );
    const distinctEntryIndexes = [...new Set(longestCandidates.map(({ entryIndex }) => entryIndex))];
    if (distinctEntryIndexes.length !== 1) {
      const ambiguousEndIndex = normalizedIndex + longestLength;
      const ambiguousEnd = normalizedText[ambiguousEndIndex - 1].end;
      const ambiguousEndWithSuffix = ambiguousEnd + getPostpositionSuffix(text, ambiguousEnd).length;
      while (
        normalizedIndex < normalizedText.length &&
        normalizedText[normalizedIndex].start < ambiguousEndWithSuffix
      ) {
        normalizedIndex += 1;
      }
      continue;
    }

    const candidate = longestCandidates[0];
    const start = normalizedText[normalizedIndex].start;
    const matchedEndIndex = normalizedIndex + candidate.aliasCharacters.length;
    const matchedEnd = normalizedText[matchedEndIndex - 1].end;
    const suffix = getPostpositionSuffix(text, matchedEnd);
    const end = matchedEnd + suffix.length;
    const noWrapTailLength = getNoWrapTailLength(text, end);

    if (start < cursor) {
      normalizedIndex += 1;
      continue;
    }

    appendText(segments, text.slice(cursor, start));
    const matchedText = text.slice(start, matchedEnd);
    if (seenEntryIndexes.has(candidate.entryIndex)) {
      appendText(segments, matchedText + suffix);
    } else {
      seenEntryIndexes.add(candidate.entryIndex);
      segments.push({ kind: "term", text: matchedText, suffix, noWrapTailLength, entry: candidate.entry });
    }

    cursor = end;
    while (normalizedIndex < normalizedText.length && normalizedText[normalizedIndex].start < end) {
      normalizedIndex += 1;
    }
  }

  appendText(segments, text.slice(cursor));
  return segments;
}

export function annotateKnowledgeDescriptionParts(
  parts: readonly { key: string; text: string; dynamic: boolean; emphasized: boolean }[],
  entries: readonly PublicKnowledgeEntry[],
): AnnotatedKnowledgeDescriptionPart[] {
  const seenEntryIndexes = new Set<number>();
  return parts.map((part) => ({
    key: part.key,
    dynamic: part.dynamic,
    emphasized: part.emphasized,
    segments: part.dynamic
      ? [{ kind: "text", text: part.text }]
      : annotateKnowledgeText(part.text, entries, seenEntryIndexes),
  }));
}

function buildAliasCandidates(entries: readonly PublicKnowledgeEntry[]): AliasCandidate[] {
  return entries
    .flatMap((entry, entryIndex) =>
      entry.aliases
        .map((alias) => normalizeAlias(alias))
        .filter((alias) => alias.length > 0)
        .map((alias) => ({ aliasCharacters: Array.from(alias), entryIndex, entry })),
    )
    .sort(
      (left, right) => right.aliasCharacters.length - left.aliasCharacters.length || left.entryIndex - right.entryIndex,
    );
}

function candidateMatchesAt(
  candidate: AliasCandidate,
  text: readonly NormalizedCharacter[],
  index: number,
  originalText: string,
): boolean {
  if (index + candidate.aliasCharacters.length > text.length) return false;
  for (let offset = 0; offset < candidate.aliasCharacters.length; offset += 1) {
    if (text[index + offset].value !== candidate.aliasCharacters[offset]) return false;
  }

  const start = text[index].start;
  const previous = text[index - 1];
  if (previous && wordCharacter.test(previous.value) && !hasWhitespaceBetween(originalText, previous.end, start)) {
    return false;
  }

  const matchedEnd = text[index + candidate.aliasCharacters.length - 1].end;
  const next = text[index + candidate.aliasCharacters.length];
  if (!next || hasWhitespaceBetween(originalText, matchedEnd, next.start)) return true;
  if (!wordCharacter.test(next.value)) return true;
  if (!hangulCharacter.test(next.value)) return false;

  return getPostpositionSuffix(originalText, matchedEnd).length > 0;
}

function normalizeText(text: string): NormalizedCharacter[] {
  const normalized: NormalizedCharacter[] = [];
  for (let start = 0; start < text.length; ) {
    const codePoint = text.codePointAt(start);
    if (codePoint === undefined) break;
    const value = String.fromCodePoint(codePoint);
    const end = start + value.length;
    if (!horizontalWhitespace.test(value)) normalized.push({ value, start, end });
    start = end;
  }
  return normalized;
}

function normalizeAlias(alias: string): string {
  return alias.trim().replace(horizontalWhitespaceRuns, "");
}

function hasWhitespaceBetween(text: string, start: number, end: number): boolean {
  return start < end && horizontalWhitespace.test(text.slice(start, end));
}

function getPostpositionSuffix(text: string, start: number): string {
  const remainder = text.slice(start);
  for (const postposition of koreanPostpositions) {
    if (!remainder.startsWith(postposition)) continue;
    const after = remainder.slice(postposition.length, postposition.length + 1);
    if (after && hangulCharacter.test(after)) continue;
    return postposition;
  }
  return "";
}

function getNoWrapTailLength(text: string, start: number): number {
  let end = start;
  while (end < text.length) {
    const codePoint = text.codePointAt(end);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    if (/\s/u.test(character)) break;
    end += character.length;
  }
  return end - start;
}

function appendText(segments: KnowledgeAnnotationSegment[], text: string): void {
  if (!text) return;
  const previous = segments.at(-1);
  if (previous?.kind === "text") {
    previous.text += text;
  } else {
    segments.push({ kind: "text", text });
  }
}
