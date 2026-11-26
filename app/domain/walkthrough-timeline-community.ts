import type {
  WalkthroughTimelineDefenseType,
  WalkthroughTimelineDifficulty,
  WalkthroughTimelineDocument,
  WalkthroughTimelineTerrain,
} from "~/domain/walkthrough-timeline";

export type WalkthroughTimelineCommunityPostBlock = {
  type: "walkthrough_timeline";
  timelineUid: string;
  bossUid: string;
  terrain: WalkthroughTimelineTerrain;
  defenseType: WalkthroughTimelineDefenseType;
  maxDifficulty: WalkthroughTimelineDifficulty;
  partySize?: WalkthroughTimelineDocument["partySize"];
  partyCount: number;
  usedStudentUids: string[];
};

type WalkthroughTimelineCommunityPostBlocks = Array<
  { type: "plaintext"; text: string } | WalkthroughTimelineCommunityPostBlock
>;

// The feed shows the start of the body as plain text, as it showed the description before.
export const WALKTHROUGH_COMMUNITY_TEXT_LENGTH = 300;

// Cuts by code point, so an emoji is never split into a lone surrogate, which PostgreSQL's jsonb rejects.
export function walkthroughCommunityText(bodyText: string): string {
  const characters = Array.from(bodyText.trim());
  return characters.length > WALKTHROUGH_COMMUNITY_TEXT_LENGTH
    ? `${characters.slice(0, WALKTHROUGH_COMMUNITY_TEXT_LENGTH).join("").trimEnd()}…`
    : characters.join("");
}

export function createWalkthroughTimelineCommunityPostBlocks({
  uid,
  bodyText,
  bossUid,
  terrain,
  defenseType,
  maxDifficulty,
  document,
}: {
  uid: string;
  // The body as plain text, with mentions as their names.
  bodyText: string;
  bossUid: string;
  terrain: WalkthroughTimelineTerrain;
  defenseType: WalkthroughTimelineDefenseType;
  maxDifficulty: WalkthroughTimelineDifficulty;
  document: WalkthroughTimelineDocument;
}): WalkthroughTimelineCommunityPostBlocks {
  const usedStudentUids = [
    ...new Set(document.parties[0]?.units.flatMap((unit) => (unit.studentUid ? [unit.studentUid] : [])) ?? []),
  ];

  return [
    ...(bodyText.trim().length > 0 ? [{ type: "plaintext" as const, text: walkthroughCommunityText(bodyText) }] : []),
    {
      type: "walkthrough_timeline",
      timelineUid: uid,
      bossUid,
      terrain,
      defenseType,
      maxDifficulty,
      partySize: document.partySize,
      partyCount: document.parties.length,
      usedStudentUids,
    },
  ];
}
