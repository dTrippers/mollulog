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

const horizontalWhitespace = /[^\S\r\n]/u;
const horizontalWhitespaceRuns = /[^\S\r\n]+/gu;

/**
 * Annotates registered aliases while preserving every source character.
 * Whitespace may vary inside an alias; matching remains case-sensitive.
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
      candidateMatchesAt(candidate, normalizedText, normalizedIndex),
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
      while (normalizedIndex < normalizedText.length && normalizedText[normalizedIndex].start < ambiguousEnd) {
        normalizedIndex += 1;
      }
      continue;
    }

    const candidate = longestCandidates[0];
    const start = normalizedText[normalizedIndex].start;
    const matchedEndIndex = normalizedIndex + candidate.aliasCharacters.length;
    const matchedEnd = normalizedText[matchedEndIndex - 1].end;
    const noWrapTailLength = getNoWrapTailLength(text, matchedEnd);

    if (start < cursor) {
      normalizedIndex += 1;
      continue;
    }

    appendText(segments, text.slice(cursor, start));
    const matchedText = text.slice(start, matchedEnd);
    if (seenEntryIndexes.has(candidate.entryIndex)) {
      appendText(segments, matchedText);
    } else {
      seenEntryIndexes.add(candidate.entryIndex);
      segments.push({ kind: "term", text: matchedText, noWrapTailLength, entry: candidate.entry });
    }

    cursor = matchedEnd;
    while (normalizedIndex < normalizedText.length && normalizedText[normalizedIndex].start < matchedEnd) {
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

function candidateMatchesAt(candidate: AliasCandidate, text: readonly NormalizedCharacter[], index: number): boolean {
  if (index + candidate.aliasCharacters.length > text.length) return false;
  for (let offset = 0; offset < candidate.aliasCharacters.length; offset += 1) {
    if (text[index + offset].value !== candidate.aliasCharacters[offset]) return false;
  }

  return true;
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
