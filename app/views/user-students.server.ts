import type { StudentGrowthEquipmentLimit } from "~/domain/student-growth-edit";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import type { Sensei } from "~/models/sensei";
import {
  getAllStudents,
  getStudentGrowthEquipmentCatalog,
  getStudentGrowthVisualsBatch,
  getStudentWeaponAvailability,
  type StudentGrowthEquipment,
} from "~/models/student";

export type UserStudentsViewMode = "summary" | "growth";

export type UserStudentsEquipment = {
  // False when the student has no equipment in this slot.
  available: boolean;
  category: string | null;
  tier: number | null;
  level: number | null;
  // The highest level the stored tier allows, for the "MAX" mark and the edit range.
  maxLevel: number | null;
  // The catalog item of the stored tier, for its image.
  uid: string | null;
};

export type UserStudentsGrowth = {
  bond: number | null;
  level: number | null;
  weaponLevel: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equipment: [UserStudentsEquipment, UserStudentsEquipment, UserStudentsEquipment];
  equipSpecial: number | null;
  equipSpecialAvailable: boolean;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  // The student has a unique weapon, so the weapon level and the ability release can apply (from ★6). The stored values
  // are raw: the screen decides from the tier it shows whether a value applies.
  weaponAvailable: boolean;
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
  // What each equipment category and tier allows, for the edit table. Empty outside the growth view.
  equipmentLimits: StudentGrowthEquipmentLimit[];
};

type GrowthApplicability = {
  equipSpecialAvailable: boolean;
  weaponAvailable: boolean;
};

export function canViewUserStudentGrowth(sensei: Sensei, viewerUserId?: number): boolean {
  if (sensei.id === viewerUserId) return true;
  return sensei.profileVisibility === "public" && sensei.growthVisibility === true;
}

export function toUserStudentsGrowth(
  recruitedStudent: RecruitedStudent,
  applicability: GrowthApplicability,
  equipmentCatalog: StudentGrowthEquipment,
  equipmentCategories: readonly string[],
  bond: number | null,
): UserStudentsGrowth {
  const tiers = [recruitedStudent.equip1, recruitedStudent.equip2, recruitedStudent.equip3];
  const levels = [
    recruitedStudent.equip1Level ?? null,
    recruitedStudent.equip2Level ?? null,
    recruitedStudent.equip3Level ?? null,
  ];
  const equipment = [0, 1, 2].map((index): UserStudentsEquipment => {
    const category = equipmentCategories[index];
    if (!category) {
      return { available: false, category: null, tier: null, level: null, maxLevel: null, uid: null };
    }
    const tier = tiers[index];
    // A slot with no stored tier is read at tier 1, as the detail screen and the server check do.
    const catalogItem = equipmentCatalog.find(
      (candidate) => candidate.category === category && candidate.tier === (tier ?? 1),
    );
    if (tier !== null && !catalogItem) {
      throw new Error("학생 성장 시각 자료의 장비 티어를 확인하지 못했어요");
    }
    return {
      available: true,
      category,
      tier,
      level: levels[index],
      maxLevel: catalogItem?.maxLevel ?? null,
      uid: tier === null ? null : (catalogItem?.uid ?? null),
    };
  }) as UserStudentsGrowth["equipment"];
  return {
    bond,
    level: recruitedStudent.level,
    weaponLevel: recruitedStudent.weaponLevel,
    skillEx: recruitedStudent.skillEx,
    skillNormal: recruitedStudent.skillNormal,
    skillEnhanced: recruitedStudent.skillEnhanced,
    skillSub: recruitedStudent.skillSub,
    equipment,
    equipSpecial: recruitedStudent.equipSpecial,
    equipSpecialAvailable: applicability.equipSpecialAvailable,
    abilityHp: recruitedStudent.abilityHp,
    abilityAtk: recruitedStudent.abilityAtk,
    abilityHeal: recruitedStudent.abilityHeal,
    weaponAvailable: applicability.weaponAvailable,
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
  const resolvedRecruitedStudents = recruitedStudents.flatMap((recruitedStudent) => {
    const student = studentsByUid.get(recruitedStudent.studentUid);
    return student ? [{ recruitedStudent, student }] : [];
  });

  const applicabilityByStudentUid = new Map<string, GrowthApplicability>();
  let equipmentCatalog: StudentGrowthEquipment = [];
  let bondByStudentUid = new Map<string, number | null>();
  if (view === "growth") {
    const recruitedStudentUids = resolvedRecruitedStudents.map(({ recruitedStudent }) => recruitedStudent.studentUid);
    const [weaponAvailabilityByStudentUid, growthVisuals, equipment, relationships] = await Promise.all([
      getStudentWeaponAvailability(env, recruitedStudentUids),
      getStudentGrowthVisualsBatch(env, recruitedStudentUids),
      resolvedRecruitedStudents.length > 0 ? getStudentGrowthEquipmentCatalog(env) : Promise.resolve([]),
      getRelationshipLevels(env, sensei.id, recruitedStudentUids),
    ]);
    equipmentCatalog = equipment;
    bondByStudentUid = new Map(
      relationships.map((relationship) => [relationship.studentId, relationship.currentLevel]),
    );
    for (const { recruitedStudent } of resolvedRecruitedStudents) {
      if (!weaponAvailabilityByStudentUid.has(recruitedStudent.studentUid)) {
        throw new Error("학생 고유무기 정보를 확인하지 못했어요");
      }
      const growthVisual = growthVisuals.get(recruitedStudent.studentUid);
      if (!growthVisual) {
        throw new Error("학생 성장 시각 자료를 확인하지 못했어요");
      }
      applicabilityByStudentUid.set(recruitedStudent.studentUid, {
        equipSpecialAvailable: growthVisual.gearAvailable,
        weaponAvailable: weaponAvailabilityByStudentUid.get(recruitedStudent.studentUid) === true,
      });
    }
  }

  return {
    view,
    growthVisibility,
    canViewGrowth,
    noRecruited: resolvedRecruitedStudents.length === 0,
    equipmentLimits: equipmentCatalog.map(({ category, tier, maxLevel }) => ({ category, tier, maxLevel })),
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
          applicabilityByStudentUid.get(student.uid) as GrowthApplicability,
          equipmentCatalog,
          student.equipments,
          bondByStudentUid.get(student.uid) ?? null,
        ),
      };
    }),
  };
}
