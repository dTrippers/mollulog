import { runQuery } from "~/lib/baql";
import { graphql } from "~/graphql";
import type { Position, TacticRole } from "./content.d";
import { fetchCached } from "./base";
import type { Attack, Defense } from "~/graphql/graphql";

export type Role = "striker" | "special";
export type Student = {
  uid: string;
  name: string;
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
      uid name altNames school initialTier order attackType defenseType position tacticRole birthday role equipments released
    }
  }
`);

export async function getAllStudents(env: Env, includeUnreleased = false): Promise<Student[]> {
  const rawStudents = await getRawStudents(env);
  if (includeUnreleased) {
    return rawStudents;
  }
  return rawStudents.filter(({ released }) => released);
};

export async function getAllStudentsMap(env: Env, includeUnreleased = false): Promise<StudentMap> {
  const rawStudents = await getRawStudents(env);
  const students = includeUnreleased ? rawStudents : rawStudents.filter(({ released }) => released);
  return students.reduce((acc, student) => {
    acc[student.uid] = student;
    return acc;
  }, {} as StudentMap);
}

const rawStudentsKey = "students::v4";

export async function syncRawStudents(env: Env): Promise<Student[]> {
  const { data } = await runQuery(allStudentsQuery, {});
  if (!data?.students) {
    return [];
  }

  await env.KV_USERDATA.put(rawStudentsKey, JSON.stringify(data.students satisfies Student[]), {
    expirationTtl: 60 * 10,
  });
  return data.students satisfies Student[];
}

async function getRawStudents(env: Env): Promise<Student[]> {
  const cached = await env.KV_USERDATA.get(rawStudentsKey);
  if (cached) {
    return JSON.parse(cached) as Student[];
  } else {
    return syncRawStudents(env);
  }
}

const maximumTiers: Record<string, number> = {
  "2025-12-22": 9,
};

export function getMaxTierAt(date: Date): number {
  const dates = Object.keys(maximumTiers).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (new Date(date) >= new Date(dates[i])) {
      return maximumTiers[dates[i]];
    }
  }
  return 8;
}

const studentSkillItemsQuery = graphql(`
  query StudentSkillItems($uid: String!) {
    student(uid: $uid) {
      uid
      schaleDbId
      skillItems(skillType: ex, skillLevel: 5) {
        item { uid subCategory rarity }
      }
    }
  }
`);

export type StudentSkillItem = { item: { uid: string; subCategory: string | null; rarity: number } };

export async function getStudentSkillItems(env: Env, uid: string): Promise<{ schaleDbId: string | null; skillItems: StudentSkillItem[] }> {
  return fetchCached(env, `student-skill-items::v1::${uid}`, async () => {
    const { data } = await runQuery(studentSkillItemsQuery, { uid });
    return {
      schaleDbId: data?.student?.schaleDbId ?? null,
      skillItems: (data?.student?.skillItems ?? []).map((si) => ({
        item: { uid: si.item.uid, subCategory: si.item.subCategory ?? null, rarity: si.item.rarity },
      })),
    };
  }, 7 * 24 * 60 * 60);
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
