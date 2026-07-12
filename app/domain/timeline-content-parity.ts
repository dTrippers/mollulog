import type { TimelineContent } from "~/domain/timeline-content";

export type TimelineContentParity = {
  matched: boolean;
  sourceCount: number;
  targetCount: number;
  missingTargetUids: string[];
  unexpectedTargetUids: string[];
  mismatchedUids: string[];
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalJson(content: TimelineContent): string {
  return JSON.stringify(canonicalize(content));
}

export function compareTimelineContents(source: TimelineContent[], target: TimelineContent[]): TimelineContentParity {
  const sourceByUid = new Map(source.map((content) => [content.uid, content]));
  const targetByUid = new Map(target.map((content) => [content.uid, content]));
  const missingTargetUids = [...sourceByUid.keys()].filter((uid) => !targetByUid.has(uid)).sort();
  const unexpectedTargetUids = [...targetByUid.keys()].filter((uid) => !sourceByUid.has(uid)).sort();
  const mismatchedUids = [...sourceByUid.entries()]
    .filter(([uid, content]) => {
      const targetContent = targetByUid.get(uid);
      return targetContent !== undefined && canonicalJson(content) !== canonicalJson(targetContent);
    })
    .map(([uid]) => uid)
    .sort();

  return {
    matched: missingTargetUids.length === 0 && unexpectedTargetUids.length === 0 && mismatchedUids.length === 0,
    sourceCount: source.length,
    targetCount: target.length,
    missingTargetUids,
    unexpectedTargetUids,
    mismatchedUids,
  };
}
