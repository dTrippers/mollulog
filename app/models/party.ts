import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  communityPostsTable,
  deleteCommunityPostByUid,
  type PartyInfoCommunityPostBlock,
  parseCommunityPostBlocks,
} from "./community";
import { getSenseisById, type Sensei, senseiProfileVisibilityFilter, senseisTable } from "./sensei";

export type DBParty = {
  uid: string;
  title: string | null;
  userId: number;
  subjectRaidType: string | null;
  subjectSeasonIndex: number | null;
  visibility: "public" | "unlisted" | "private";
  blocks: string;
};

export type Party = {
  uid: string;
  sensei?: {
    username: string;
    profileStudentId: string | null;
  };
  name: string;
  studentIds: (string | null)[][];
  raidType: string | null;
  seasonIndex: number | null;
  memo: string | null;
  showAsRaidTip: boolean;
};

function getPartyInfoBlock(blocks: ReturnType<typeof parseCommunityPostBlocks>): PartyInfoCommunityPostBlock | null {
  const block = blocks.find((entry): entry is PartyInfoCommunityPostBlock => entry.type === "party_info");
  return block ?? null;
}

function getPlaintextMemo(blocks: ReturnType<typeof parseCommunityPostBlocks>): string | null {
  const block = blocks.find((entry) => entry.type === "plaintext" || entry.type === "markdown");
  if (!block || block.text.trim().length === 0) {
    return null;
  }

  return block.text;
}

function toModel(row: DBParty): Party {
  const blocks = parseCommunityPostBlocks(row.blocks);
  const partyInfoBlock = getPartyInfoBlock(blocks);
  const memo = partyInfoBlock?.memo?.trim() || getPlaintextMemo(blocks);

  return {
    uid: row.uid,
    name: row.title ?? partyInfoBlock?.title ?? "이름 없는 공략",
    studentIds: partyInfoBlock?.units ?? [],
    raidType: row.subjectRaidType ?? partyInfoBlock?.raidType ?? null,
    seasonIndex: row.subjectSeasonIndex ?? partyInfoBlock?.seasonIndex ?? null,
    memo,
    showAsRaidTip: row.visibility === "public",
  };
}

export async function getUserParties(
  env: Env,
  username: string,
  { includePrivate = false }: { includePrivate?: boolean } = {},
): Promise<Party[]> {
  const db = drizzle(env.DB);
  const posts = await db
    .select({
      uid: communityPostsTable.uid,
      title: communityPostsTable.title,
      userId: communityPostsTable.userId,
      subjectRaidType: communityPostsTable.subjectRaidType,
      subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
      visibility: communityPostsTable.visibility,
      blocks: communityPostsTable.blocks,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(
      and(
        eq(communityPostsTable.postType, "guide"),
        eq(senseisTable.username, username),
        includePrivate ? undefined : inArray(communityPostsTable.visibility, ["public", "unlisted"]),
      ),
    );

  return posts.map((row) => toModel(row));
}

export async function getPartiesByRaidReference(
  env: Env,
  raidType: string,
  seasonIndex: number,
  includeSensei = false,
): Promise<Party[]> {
  const db = drizzle(env.DB);
  const rows = await db
    .select({
      uid: communityPostsTable.uid,
      title: communityPostsTable.title,
      userId: communityPostsTable.userId,
      subjectRaidType: communityPostsTable.subjectRaidType,
      subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
      visibility: communityPostsTable.visibility,
      blocks: communityPostsTable.blocks,
    })
    .from(communityPostsTable)
    .innerJoin(senseisTable, eq(communityPostsTable.userId, senseisTable.id))
    .where(
      and(
        eq(communityPostsTable.postType, "guide"),
        eq(communityPostsTable.visibility, "public"),
        senseiProfileVisibilityFilter(),
        eq(communityPostsTable.subjectRaidType, raidType),
        eq(communityPostsTable.subjectSeasonIndex, seasonIndex),
      ),
    );

  if (rows.length === 0) {
    return [];
  }

  const senseiMap = new Map<number, Sensei>();
  if (includeSensei) {
    const senseis = await getSenseisById(
      env,
      rows.map((row) => row.userId),
    );
    for (const sensei of senseis) {
      senseiMap.set(sensei.id, sensei);
    }
  }

  return rows.map((row) => {
    const sensei = includeSensei ? senseiMap.get(row.userId) : undefined;
    return {
      ...toModel(row),
      sensei: sensei
        ? {
            username: sensei.username,
            profileStudentId: sensei.profileStudentId,
          }
        : undefined,
    };
  });
}

export async function removePartyByUid(env: Env, userId: number, uid: string) {
  await deleteCommunityPostByUid(env, uid, userId);
}
