import { graphql } from "~/graphql";
import type { Attack, Defense } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, cacheQuery, fetchLazySourceCached, fetchLazySourceCachedBatch, fetchSourceCached } from "./base";
import type { Position, TacticRole } from "./content.d";

export type Role = "striker" | "special";
export type Student = {
  uid: string;
  name: string;
  familyName: string | null;
  altNames: string[];
  school: string;
  initialTier: number;
  order: number;
  attackType: Attack;
  defenseType: Defense;
  position: Position;
  tacticRole: TacticRole;
  birthday: Date;
  role: Role;
  equipments: string[];
  released: boolean;
};

export type StudentMap = { [id: string]: Student };

const allStudentsQuery = graphql(`
  query AllStudents {
    students {
      uid name familyName altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released
    }
  }
`);

export async function getAllStudents(env: Env, includeUnreleased = false): Promise<Student[]> {
  const rawStudents = await getRawStudents(env);
  if (includeUnreleased) {
    return rawStudents;
  }
  return rawStudents.filter(({ released }) => released);
}

export async function getAllStudentsMap(env: Env, includeUnreleased = false): Promise<StudentMap> {
  const rawStudents = await getRawStudents(env);
  const students = includeUnreleased ? rawStudents : rawStudents.filter(({ released }) => released);
  return students.reduce((acc, student) => {
    acc[student.uid] = student;
    return acc;
  }, {} as StudentMap);
}

const rawStudentsKey = cacheKey("source", "student", 1, "all");

async function fetchStudentsFromBaql(): Promise<Student[]> {
  const { data } = await runQuery(allStudentsQuery, {});
  if (!data?.students) return [];
  return data.students satisfies Student[];
}

export async function syncRawStudents(env: Env): Promise<Student[]> {
  return fetchSourceCached(env, rawStudentsKey, fetchStudentsFromBaql, true);
}

async function getRawStudents(env: Env): Promise<Student[]> {
  return fetchSourceCached(env, rawStudentsKey, fetchStudentsFromBaql, false);
}

const maximumTiers: Record<string, number> = {
  "2025-12-22": 9,
};

export function getMaxTierAt(date: Date | string): number {
  const targetDate = date instanceof Date ? date : new Date(date);
  const dates = Object.keys(maximumTiers).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (targetDate >= new Date(dates[i])) {
      return maximumTiers[dates[i]];
    }
  }
  return 8;
}

const STUDENT_SKILL_ITEMS_TTL = 7 * 24 * 60 * 60;

const studentSkillItemsQuery = graphql(`
  query StudentSkillItems($uids: [String!]) {
    students(uids: $uids) {
      uid
      schaleDbId
      skillItems(skillType: ex, skillLevel: 5) {
        item { uid subCategory rarity }
      }
    }
  }
`);

export type StudentSkillItem = { item: { uid: string; subCategory: string | null; rarity: number } };
export type StudentSkillItems = { schaleDbId: string | null; skillItems: StudentSkillItem[] };

function buildStudentSkillItemsCacheKey(uid: string): string {
  return cacheKey("source", "student-skill-item", 1, cacheQuery({ uid }));
}

async function fetchStudentSkillItemsFromBaql(uids: string[]): Promise<Map<string, StudentSkillItems>> {
  const { data } = await runQuery(studentSkillItemsQuery, { uids });
  const itemsByUid = new Map<string, StudentSkillItems>(
    (data?.students ?? []).map((student) => [
      student.uid,
      {
        schaleDbId: student.schaleDbId ?? null,
        skillItems: (student.skillItems ?? []).map((si) => ({
          item: { uid: si.item.uid, subCategory: si.item.subCategory ?? null, rarity: si.item.rarity },
        })),
      },
    ]),
  );

  for (const uid of uids) {
    if (!itemsByUid.has(uid)) {
      itemsByUid.set(uid, { schaleDbId: null, skillItems: [] });
    }
  }

  return itemsByUid;
}

export async function getStudentSkillItemsBatch(
  env: Env,
  uids: string[],
  forceRefresh = false,
): Promise<Map<string, StudentSkillItems>> {
  const uniqueUids = [...new Set(uids)].sort();
  return fetchLazySourceCachedBatch(
    env,
    uniqueUids.map((uid) => ({ key: uid, dataKey: buildStudentSkillItemsCacheKey(uid) })),
    fetchStudentSkillItemsFromBaql,
    STUDENT_SKILL_ITEMS_TTL,
    forceRefresh,
  );
}

export async function getStudentSkillItems(
  env: Env,
  uid: string,
): Promise<StudentSkillItems> {
  return fetchLazySourceCached(
    env,
    buildStudentSkillItemsCacheKey(uid),
    async () => (await fetchStudentSkillItemsFromBaql([uid])).get(uid) ?? { schaleDbId: null, skillItems: [] },
    STUDENT_SKILL_ITEMS_TTL,
  );
}

export function parseVisibleNames(name: string): string[] {
  const visibleNames = [];
  if (name === "하츠네 미쿠") {
    visibleNames.push("미쿠");
  } else if (name === "미사카 미코토") {
    visibleNames.push("미사카");
  } else if (name === "쇼쿠호 미사키") {
    visibleNames.push("쇼쿠호");
  } else if (name === "사텐 루이코") {
    visibleNames.push("사텐");
  } else if (name === "시로코*테러") {
    visibleNames.push("시로코", "테러");
  } else if (name?.includes("(")) {
    const splits = name.split("(");
    visibleNames.push(splits[0], splits[1].replace(")", ""));
  } else if (name) {
    visibleNames.push(name);
  }
  return visibleNames;
}

export function formatVisibleName(name: string): string {
  const visibleNames = parseVisibleNames(name);
  if (visibleNames.length === 2) {
    return `${visibleNames[0]}(${visibleNames[1]})`;
  }
  return visibleNames.join(" ");
}

export function formatStudentFullName({
  uid,
  name,
  familyName,
}: {
  uid?: string | null;
  name: string;
  familyName?: string | null;
}): string {
  const trimmedFamilyName = familyName?.trim();
  if (!trimmedFamilyName) {
    return name;
  }
  if (uid === "10100" || name === "시로코*테러") {
    return name;
  }
  if (name.startsWith(`${trimmedFamilyName} `)) {
    return name;
  }
  return `${trimmedFamilyName} ${name}`;
}
