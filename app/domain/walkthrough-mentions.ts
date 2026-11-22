import type { GuideMentionKind, GuideMentionLabelResolver } from "./guide-body";
import type { WalkthroughParty } from "./walkthrough-timeline";

// What a mention in a guide body points at, looked up in the guide's current formation and the current student data.
// A mention whose target is gone resolves to `missing`, which the chip shows as its own state instead of a stale name.
export type WalkthroughMentionTarget =
  | { kind: "party"; party: WalkthroughParty; partyIndex: number }
  | { kind: "student"; studentUid: string; name: string }
  | { kind: "missing"; mentionKind: GuideMentionKind };

export const WALKTHROUGH_MISSING_MENTION_LABEL: Record<GuideMentionKind, string> = {
  party: "삭제된 파티",
  student: "알 수 없는 학생",
};

export function walkthroughPartyLabel(partyIndex: number): string {
  return `파티 ${partyIndex + 1}`;
}

export function resolveWalkthroughMention(
  kind: GuideMentionKind,
  id: string,
  parties: readonly WalkthroughParty[],
  studentName: (uid: string) => string | undefined,
): WalkthroughMentionTarget {
  if (kind === "party") {
    const partyIndex = parties.findIndex((party) => party.uid === id);
    const party = parties[partyIndex];
    return party ? { kind: "party", party, partyIndex } : { kind: "missing", mentionKind: kind };
  }
  const name = studentName(id);
  return name ? { kind: "student", studentUid: id, name } : { kind: "missing", mentionKind: kind };
}

export function walkthroughMentionTargetLabel(target: WalkthroughMentionTarget): string {
  if (target.kind === "party") return walkthroughPartyLabel(target.partyIndex);
  if (target.kind === "student") return target.name;
  return WALKTHROUGH_MISSING_MENTION_LABEL[target.mentionKind];
}

export function walkthroughMentionLabelResolver(
  parties: readonly WalkthroughParty[],
  studentName: (uid: string) => string | undefined,
): GuideMentionLabelResolver {
  return (kind, id) => walkthroughMentionTargetLabel(resolveWalkthroughMention(kind, id, parties, studentName));
}
