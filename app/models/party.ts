import { nanoid } from "nanoid/non-secure";
import { type Sensei, getSenseisById } from "./sensei";

export type PartyRaidReference = {
  raidType: string;
  seasonIndex: number;
};

export type DBParty = {
  id: number;
  uid: string;
  name: string;
  userId: number;
  raidId: string | null;
  raidType: string | null;
  seasonIndex: number | null;
  memo: string | null;
  showAsRaidTip: number;
  students: string;
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

// Get all parties for a user
const GET_PARTIES_BY_RAID_QUERY =
  "select * from parties where raidType = ?1 and seasonIndex = ?2 and showAsRaidTip = true";

export async function getUserParties(env: Env, username: string): Promise<Party[]> {
  const query = "select p.* from parties p, senseis s where p.userId = s.id and s.username = ?1";
  const result = await env.DB.prepare(query).bind(username).all<DBParty>();
  return result.results.map(toModel);
}

export async function getPartiesByRaidReference(
  env: Env,
  raidType: string,
  seasonIndex: number,
  includeSensei = false,
): Promise<Party[]> {
  const result = await env.DB.prepare(GET_PARTIES_BY_RAID_QUERY).bind(raidType, seasonIndex).all<DBParty>();
  const rows = result.results;
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

// Delete a party by its UID
const DELETE_PARTY_QUERY = "delete from parties where uid = ?1 and userId = ?2";

export async function removePartyByUid(env: Env, userId: number, uid: string) {
  return env.DB.prepare(DELETE_PARTY_QUERY).bind(uid, userId).run();
}

// Create a party
type PartyCreateFields = Pick<
  Party,
  "name" | "studentIds" | "raidType" | "seasonIndex" | "showAsRaidTip" | "memo"
>;

const CREATE_PARTY_QUERY =
  "insert into parties (uid, name, userId, raidId, raidType, seasonIndex, students, showAsRaidTip, memo) values (?1, ?2, ?3, null, ?4, ?5, ?6, ?7, ?8)";

export async function createParty(env: Env, sensei: Sensei, fields: PartyCreateFields) {
  const result = await env.DB.prepare(CREATE_PARTY_QUERY)
    .bind(
      nanoid(8),
      fields.name,
      sensei.id,
      fields.raidType,
      fields.seasonIndex,
      JSON.stringify(fields.studentIds),
      fields.showAsRaidTip,
      fields.memo,
    )
    .run();

  if (result.error) {
    console.error(result.error);
  }
  return;
}

// Update a party
type PartyUpdateFields = Partial<PartyCreateFields>;

const UPDATE_PARTY_QUERY =
  "update parties set name = ?1, raidId = null, raidType = ?2, seasonIndex = ?3, students = ?4, showAsRaidTip = ?5, memo = ?6 where uid = ?7 and userId = ?8";

export async function updateParty(env: Env, sensei: Sensei, uid: string, fields: PartyUpdateFields) {
  const existingParty = (await getUserParties(env, sensei.username)).find((party) => party.uid === uid);
  if (!existingParty) {
    return;
  }

  const nextName = fields.name === undefined ? existingParty.name : fields.name;
  const nextRaidType = fields.raidType === undefined ? existingParty.raidType : fields.raidType;
  const nextSeasonIndex = fields.seasonIndex === undefined ? existingParty.seasonIndex : fields.seasonIndex;
  const nextStudentIds = fields.studentIds === undefined ? existingParty.studentIds : fields.studentIds;
  const nextShowAsRaidTip =
    fields.showAsRaidTip === undefined ? existingParty.showAsRaidTip : fields.showAsRaidTip;
  const nextMemo = fields.memo === undefined ? existingParty.memo : fields.memo;

  const result = await env.DB.prepare(UPDATE_PARTY_QUERY)
    .bind(
      nextName,
      nextRaidType,
      nextSeasonIndex,
      JSON.stringify(nextStudentIds),
      nextShowAsRaidTip,
      nextMemo,
      uid,
      sensei.id,
    )
    .run();

  if (result.error) {
    console.error(result.error);
  }
  return;
}

function toModel(row: DBParty): Party {
  const parsedSeasonIndex =
    row.seasonIndex === null
      ? null
      : typeof row.seasonIndex === "number"
        ? row.seasonIndex
        : Number(row.seasonIndex);

  return {
    uid: row.uid,
    name: row.name,
    studentIds: JSON.parse(row.students),
    raidType: row.raidType,
    seasonIndex: parsedSeasonIndex === null || Number.isNaN(parsedSeasonIndex) ? null : parsedSeasonIndex,
    memo: row.memo,
    showAsRaidTip: row.showAsRaidTip === 1,
  };
}
