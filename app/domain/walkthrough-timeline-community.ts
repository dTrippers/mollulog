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

export function createWalkthroughTimelineCommunityPostBlocks({
  uid,
  description,
  bossUid,
  terrain,
  defenseType,
  maxDifficulty,
  document,
}: {
  uid: string;
  description: string;
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
    ...(description.trim().length > 0 ? [{ type: "plaintext" as const, text: description.trim() }] : []),
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
