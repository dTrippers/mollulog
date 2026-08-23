import {
  createPostgresPickupHistory,
  deletePostgresPickupHistory,
  getPostgresPickupHistories,
  getPostgresPickupHistory,
  updatePostgresPickupHistory,
} from "~/db/postgres/pickup-history";

export type PickupHistory = {
  uid: string;
  userId: number;
  eventId: string;
  result: {
    trial: number;
    tier3Count: number;
    tier3StudentIds: string[];
    tier2Count?: number;
    tier1Count?: number;
  }[];
  rawResult?: string | null;
};

export async function getPickupHistory(env: Env, userId: number, uid: string, includeRaw?: boolean): Promise<PickupHistory | null> {
  return getPostgresPickupHistory(env, userId, uid, includeRaw);
}

export async function getPickupHistories(env: Env, userId: number): Promise<PickupHistory[]> {
  return getPostgresPickupHistories(env, userId);
}

export async function createPickupHistory(
  env: Env,
  userId: number,
  eventId: string,
  result: PickupHistory["result"],
  rawResult: string | null,
) {
  await createPostgresPickupHistory(env, userId, eventId, result, rawResult);
}

export async function updatePickupHistory(
  env: Env,
  userId: number,
  uid: string,
  eventId: string,
  result: PickupHistory["result"],
  rawResult?: string | null,
) {
  await updatePostgresPickupHistory(env, userId, uid, eventId, result, rawResult);
}

export async function deletePickupHistory(env: Env, userId: number, uid: string) {
  await deletePostgresPickupHistory(env, userId, uid);
}

export function parsePickupHistory(raw: string, students: { uid: string, name: string }[]): PickupHistory["result"] {
  const studentNames = students.map((student) => student.name);
  const studentMap = new Map(students.map((student) => [student.name, student.uid]));

  const result: PickupHistory["result"] = [];
  let trial = 0;
  for (const line of raw.split("\n")) {
    const matched = line.matchAll(/(?<!\d)\d{1}(?!\d)/g);
    const [count1, count2, count3] = Array.from(matched).map((m) => Number.parseInt(m[0]));
    if (count1 === undefined || count2 === undefined || count3 === undefined) {
      continue;
    }

    trial += 10;

    const names = Array.from(line.matchAll(/[가-힣]+/g)).map((m) => m[0]);
    let tierOrderAsc = false;
    if (names.length === count1 || names.length === count3) {
      tierOrderAsc = names.length === count3;
    } else {
      tierOrderAsc = count1 > count3;
    }

    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    if (tierOrderAsc) {
      tier1Count = count1;
      tier2Count = count2;
      tier3Count = count3;
    } else {
      tier1Count = count3;
      tier2Count = count2;
      tier3Count = count1;
    }

    const tier3StudentIds = tier3Count > 0 ? names.map((searchName) => {
      const studentId = studentMap.get(searchName);
      if (studentId) {
        return studentId;
      }

      const [namePart1, namePart2] = [searchName.slice(0, 1), searchName.slice(1)];
      const expectingName = studentNames.find((name) => {
        const [originalName, skinName] = name.split("(").map((each) => each.replace(")", ""));
        return originalName.includes(namePart2) && skinName?.includes(namePart1);
      });

      return expectingName ? studentMap.get(expectingName) ?? null : null;
    }).filter((studentId) => studentId !== null) : [];

    result.push({
      trial,
      tier3Count,
      tier2Count,
      tier1Count,
      tier3StudentIds,
    });
  }

  return result;
}
