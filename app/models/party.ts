import { nanoid } from "nanoid/non-secure";
import { getSenseisById, type Sensei } from "./sensei";

export type DBParty = {
  id: number;
  uid: string;
  name: string;
  userId: number;
  raidId: string | null;
  memo: string;
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
  raidId: string | null;
  memo: string | null;
  showAsRaidTip: boolean;
};

// Get all parties for a user
const GET_PARTIES_BY_RAID_QUERY = "select * from parties where raidId = ?1 and showAsRaidTip = true";

export async function getUserParties(env: Env, username: string): Promise<Party[]> {
  const query = "select p.* from parties p, senseis s where p.userId = s.id and s.username = ?1";
  const result = await env.DB.prepare(query).bind(username).all<DBParty>();
  return result.results.map(toModel);
}

export async function getPartiesByRaidId(env: Env, raidId: string, includeSensei = false): Promise<Party[]> {
  const result = await env.DB.prepare(GET_PARTIES_BY_RAID_QUERY).bind(raidId).all<DBParty>();
  const rows = result.results;
  if (rows.length === 0) {
    return [];
  }

  const senseiMap = new Map<number, Sensei>();
  if (includeSensei) {
    const senseis = await getSenseisById(env, rows.map((row) => row.userId));
    senseis.forEach((sensei) => senseiMap.set(sensei.id, sensei));
  }

  return rows.map((row) => {
    const sensei = includeSensei ? senseiMap.get(row.userId) : undefined;
    return {
      ...toModel(row),
      sensei : sensei ? { username: sensei.username, profileStudentId: sensei.profileStudentId } : undefined,
    };
  });
}

// Delete a party by its UID
const DELETE_PARTY_QUERY = "delete from parties where uid = ?1 and userId = ?2";

export async function removePartyByUid(env: Env, userId: number, uid: string) {
  return env.DB.prepare(DELETE_PARTY_QUERY).bind(uid, userId).run();
}

// Create a party
type PartyCreateFields = Pick<Party, "name" | "studentIds" | "raidId" | "showAsRaidTip" | "memo">;

const CREATE_PARTY_QUERY = "insert into parties (uid, name, userId, raidId, students, showAsRaidTip, memo) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)";

export async function createParty(env: Env, sensei: Sensei, fields: PartyCreateFields) {
  const result = await env.DB.prepare(CREATE_PARTY_QUERY).bind(
    nanoid(8),
    fields.name,
    sensei.id,
    fields.raidId,
    JSON.stringify(fields.studentIds),
    fields.showAsRaidTip,
    fields.memo,
  ).run();

  if (result.error) {
    console.error(result.error);
  }
  return;
}

// Update a party
type PartyUpdateFields = Partial<PartyCreateFields>;

const UPDATE_PARTY_QUERY = "update parties set name = ?1, raidId = ?2, students = ?3, showAsRaidTip = ?4, memo = ?5 where uid = ?6 and userId = ?7";

export async function updateParty(env: Env, sensei: Sensei, uid: string, fields: PartyUpdateFields) {
  const existingParty = (await getUserParties(env, sensei.username)).find((party) => party.uid === uid);
  if (!existingParty) {
    return;
  }

  const result = await env.DB.prepare(UPDATE_PARTY_QUERY).bind(
    fields.name ?? existingParty.name,
    fields.raidId ?? existingParty.raidId,
    JSON.stringify(fields.studentIds ?? existingParty.studentIds),
    fields.showAsRaidTip ?? existingParty.showAsRaidTip,
    fields.memo ?? existingParty.memo,
    uid,
    sensei.id,
  ).run();

  if (result.error) {
    console.error(result.error);
  }
  return;
}

function toModel(row: DBParty): Party {
  return {
    uid: row.uid,
    name: row.name,
    studentIds: JSON.parse(row.students),
    raidId: row.raidId,
    memo: row.memo,
    showAsRaidTip: row.showAsRaidTip === 1,
  };
}
