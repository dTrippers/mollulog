import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid/non-secure";
import {
  communityPostsTable,
  createPlaintextCommunityPostBlocks,
  deleteCommunityPostByUid,
  parseCommunityPostBlocks,
  serializeCommunityPostBlocks,
  type PartyInfoCommunityPostBlock,
} from "./community";
import { type Sensei, getSenseisById, senseisTable } from "./sensei";

export type PartyRaidReference = {
  raidType: string;
  seasonIndex: number;
};

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

export function getPartyRaidReference(
  party: { raidType: string | null; seasonIndex: number | null } | null | undefined,
): PartyRaidReference | null {
  if (!party?.raidType || party.seasonIndex === null) {
    return null;
  }

  return {
    raidType: party.raidType,
    seasonIndex: party.seasonIndex,
  };
}

export function serializePartyRaidReference(raid: PartyRaidReference | null | undefined): string | undefined {
  if (!raid) {
    return undefined;
  }

  return `${raid.raidType}:${raid.seasonIndex}`;
}

export function parsePartyRaidReference(
  value: FormDataEntryValue | string | null | undefined,
): PartyRaidReference | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const [raidType, rawSeasonIndex, ...rest] = value.split(":");
  if (!raidType || !rawSeasonIndex || rest.length > 0) {
    return null;
  }

  const seasonIndex = Number.parseInt(rawSeasonIndex, 10);
  if (Number.isNaN(seasonIndex)) {
    return null;
  }

  return { raidType, seasonIndex };
}

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

function buildGuideBlocks(fields: PartyCreateFields): string {
  const blocks = [
    ...createPlaintextCommunityPostBlocks(fields.memo),
    {
      type: "party_info" as const,
      title: fields.name,
      memo: fields.memo,
      raidType: fields.raidType,
      seasonIndex: fields.seasonIndex,
      units: fields.studentIds,
    },
  ];

  return serializeCommunityPostBlocks(blocks);
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
    .where(and(
      eq(communityPostsTable.postType, "guide"),
      eq(senseisTable.username, username),
      includePrivate ? undefined : inArray(communityPostsTable.visibility, ["public", "unlisted"]),
    ));

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
    .where(and(
      eq(communityPostsTable.postType, "guide"),
      eq(communityPostsTable.visibility, "public"),
      eq(communityPostsTable.subjectRaidType, raidType),
      eq(communityPostsTable.subjectSeasonIndex, seasonIndex),
    ));

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

type PartyCreateFields = Pick<
  Party,
  "name" | "studentIds" | "raidType" | "seasonIndex" | "showAsRaidTip" | "memo"
>;

export async function createParty(env: Env, sensei: Sensei, fields: PartyCreateFields) {
  const db = drizzle(env.DB);
  await db.insert(communityPostsTable).values({
    uid: nanoid(8),
    userId: sensei.id,
    postType: "guide",
    title: fields.name,
    visibility: fields.showAsRaidTip ? "public" : "unlisted",
    subjectRaidType: fields.raidType,
    subjectSeasonIndex: fields.seasonIndex,
    blocks: buildGuideBlocks(fields),
  });
}

type PartyUpdateFields = Partial<PartyCreateFields>;

export async function updateParty(env: Env, sensei: Sensei, uid: string, fields: PartyUpdateFields) {
  const db = drizzle(env.DB);
  const existingPost = await db
    .select({
      uid: communityPostsTable.uid,
      title: communityPostsTable.title,
      subjectRaidType: communityPostsTable.subjectRaidType,
      subjectSeasonIndex: communityPostsTable.subjectSeasonIndex,
      visibility: communityPostsTable.visibility,
      blocks: communityPostsTable.blocks,
    })
    .from(communityPostsTable)
    .where(and(eq(communityPostsTable.uid, uid), eq(communityPostsTable.userId, sensei.id), eq(communityPostsTable.postType, "guide")))
    .get();

  if (!existingPost) {
    return;
  }

  const existingParty = toModel({
    uid: existingPost.uid,
    title: existingPost.title,
    userId: sensei.id,
    subjectRaidType: existingPost.subjectRaidType,
    subjectSeasonIndex: existingPost.subjectSeasonIndex,
    visibility: existingPost.visibility,
    blocks: existingPost.blocks,
  });

  const nextFields: PartyCreateFields = {
    name: fields.name ?? existingParty.name,
    studentIds: fields.studentIds ?? existingParty.studentIds,
    raidType: fields.raidType ?? existingParty.raidType,
    seasonIndex: fields.seasonIndex ?? existingParty.seasonIndex,
    showAsRaidTip: fields.showAsRaidTip ?? existingParty.showAsRaidTip,
    memo: fields.memo ?? existingParty.memo,
  };

  await db
    .update(communityPostsTable)
    .set({
      title: nextFields.name,
      visibility: nextFields.showAsRaidTip ? "public" : "unlisted",
      subjectRaidType: nextFields.raidType,
      subjectSeasonIndex: nextFields.seasonIndex,
      blocks: buildGuideBlocks(nextFields),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(communityPostsTable.uid, uid));
}
