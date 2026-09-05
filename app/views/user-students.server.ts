import { getStudentGearData } from "~/models/growth-resource";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import type { Sensei } from "~/models/sensei";
import { getAllStudents, getStudentWeaponAvailability } from "~/models/student";

export type UserStudentsViewMode = "summary" | "growth";

export type UserStudentsGrowth = {
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  equipSpecialAvailable: boolean;
  equipmentAvailable: [boolean, boolean, boolean];
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  abilityCatalogAvailable: boolean;
  abilityAvailable: boolean;
};

export type UserStudent = {
  uid: string;
  name: string;
  attackType: Awaited<ReturnType<typeof getAllStudents>>[number]["attackType"];
  defenseType: Awaited<ReturnType<typeof getAllStudents>>[number]["defenseType"];
  role: Awaited<ReturnType<typeof getAllStudents>>[number]["role"];
  position: Awaited<ReturnType<typeof getAllStudents>>[number]["position"];
  tacticRole: Awaited<ReturnType<typeof getAllStudents>>[number]["tacticRole"];
  order: number;
  initialTier: number;
  tier: number | null;
  growth?: UserStudentsGrowth;
};

export type UserStudentsView = {
  view: UserStudentsViewMode;
  growthVisibility: boolean;
  canViewGrowth: boolean;
  noRecruited: boolean;
  students: UserStudent[];
};

type GrowthApplicability = Pick<UserStudentsGrowth, "equipSpecialAvailable" | "equipmentAvailable">;

export function canViewUserStudentGrowth(sensei: Sensei, viewerUserId?: number): boolean {
  if (sensei.id === viewerUserId) return true;
  return sensei.profileVisibility === "public" && sensei.growthVisibility === true;
}

export function toUserStudentsGrowth(
  recruitedStudent: RecruitedStudent,
  applicability: GrowthApplicability & { abilityAvailable: boolean },
): UserStudentsGrowth {
  const abilityAvailable = applicability.abilityAvailable && recruitedStudent.tier > 5;
  return {
    level: recruitedStudent.level,
    skillEx: recruitedStudent.skillEx,
    skillNormal: recruitedStudent.skillNormal,
    skillEnhanced: recruitedStudent.skillEnhanced,
    skillSub: recruitedStudent.skillSub,
    equip1: recruitedStudent.equip1,
    equip2: recruitedStudent.equip2,
    equip3: recruitedStudent.equip3,
    equipSpecial: applicability.equipSpecialAvailable ? recruitedStudent.equipSpecial : null,
    equipSpecialAvailable: applicability.equipSpecialAvailable,
    equipmentAvailable: applicability.equipmentAvailable,
    abilityHp: abilityAvailable ? recruitedStudent.abilityHp : null,
    abilityAtk: abilityAvailable ? recruitedStudent.abilityAtk : null,
    abilityHeal: abilityAvailable ? recruitedStudent.abilityHeal : null,
    abilityCatalogAvailable: applicability.abilityAvailable,
    abilityAvailable,
  };
}

export async function getUserStudentsView(
  env: Env,
  sensei: Sensei,
  viewerUserId: number | undefined,
  requestedView: UserStudentsViewMode = "summary",
): Promise<UserStudentsView> {
  const growthVisibility = sensei.growthVisibility === true;
  const canViewGrowth = canViewUserStudentGrowth(sensei, viewerUserId);
  const view = requestedView === "growth" && canViewGrowth ? "growth" : "summary";
  const [recruitedStudents, allStudents] = await Promise.all([
    getRecruitedStudents(env, sensei.id),
    getAllStudents(env),
  ]);
  const recruitedByStudentUid = new Map(recruitedStudents.map((student) => [student.studentUid, student]));
  const studentsByUid = new Map(allStudents.map((student) => [student.uid, student]));

  const applicabilityByStudentUid = new Map<string, GrowthApplicability & { abilityAvailable: boolean }>();
  if (view === "growth") {
    const recruitedStudentUids = recruitedStudents.map((recruitedStudent) => recruitedStudent.studentUid);
    const [gearDataByStudentUid, weaponAvailabilityByStudentUid] = await Promise.all([
      getStudentGearData(env, recruitedStudentUids),
      getStudentWeaponAvailability(env, recruitedStudentUids),
    ]);
    for (const recruitedStudent of recruitedStudents) {
      const student = studentsByUid.get(recruitedStudent.studentUid);
      if (!student) {
        throw new Error("보유 학생 정보를 확인하지 못했어요");
      }
      if (!gearDataByStudentUid.has(recruitedStudent.studentUid)) {
        throw new Error("학생 애용품 정보를 확인하지 못했어요");
      }
      if (!weaponAvailabilityByStudentUid.has(recruitedStudent.studentUid)) {
        throw new Error("학생 고유무기 정보를 확인하지 못했어요");
      }
      applicabilityByStudentUid.set(recruitedStudent.studentUid, {
        equipSpecialAvailable: gearDataByStudentUid.get(recruitedStudent.studentUid) !== null,
        equipmentAvailable: [0, 1, 2].map((index) => Boolean(student.equipments[index])) as [boolean, boolean, boolean],
        abilityAvailable: weaponAvailabilityByStudentUid.get(recruitedStudent.studentUid) === true,
      });
    }
  }

  return {
    view,
    growthVisibility,
    canViewGrowth,
    noRecruited: recruitedStudents.length === 0,
    students: allStudents.map((student) => {
      const recruitedStudent = recruitedByStudentUid.get(student.uid);
      const baseStudent: UserStudent = {
        uid: student.uid,
        name: student.name,
        attackType: student.attackType,
        defenseType: student.defenseType,
        role: student.role,
        position: student.position,
        tacticRole: student.tacticRole,
        order: student.order,
        initialTier: student.initialTier,
        tier: recruitedStudent?.tier ?? null,
      };
      if (view !== "growth" || !recruitedStudent) return baseStudent;

      return {
        ...baseStudent,
        growth: toUserStudentsGrowth(
          recruitedStudent,
          applicabilityByStudentUid.get(student.uid) as GrowthApplicability & { abilityAvailable: boolean },
        ),
      };
    }),
  };
}
