import { selectUniqueMaximalSkillConfiguration } from "~/domain/student-skill-configuration";
import { StudentSkillTypeEnum } from "~/graphql/graphql";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import type { Sensei } from "~/models/sensei";
import {
  getAllStudents,
  getStudentGrowthEquipmentCatalog,
  getStudentGrowthVisualsBatch,
  getStudentWeaponAvailability,
  type StudentGrowthEquipment,
  type StudentGrowthVisuals,
} from "~/models/student";

export type UserStudentsViewMode = "summary" | "growth";

export type UserStudentsGrowth = {
  level: number | null;
  equipSpecial: number | null;
  equipSpecialAvailable: boolean;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  abilityAvailable: boolean;
  skillVisuals?: {
    ex: UserStudentsSkillVisual;
    normal: UserStudentsSkillVisual;
    enhanced: UserStudentsSkillVisual;
    sub: UserStudentsSkillVisual;
  };
  equipmentVisuals?: [UserStudentsEquipmentVisual, UserStudentsEquipmentVisual, UserStudentsEquipmentVisual];
};

export type UserStudentsGrowthWithVisuals = UserStudentsGrowth & {
  skillVisuals: NonNullable<UserStudentsGrowth["skillVisuals"]>;
  equipmentVisuals: NonNullable<UserStudentsGrowth["equipmentVisuals"]>;
};

export type UserStudentsSkillVisual = {
  iconUrl: string;
  level: number | null;
  maxLevel: number;
};

export type UserStudentsEquipmentVisual = {
  available: boolean;
  uid: string | null;
  tier: number | null;
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

type GrowthApplicability = {
  equipSpecialAvailable: boolean;
  equipmentAvailable: [boolean, boolean, boolean];
};

export function canViewUserStudentGrowth(sensei: Sensei, viewerUserId?: number): boolean {
  if (sensei.id === viewerUserId) return true;
  return sensei.profileVisibility === "public" && sensei.growthVisibility === true;
}

export function toUserStudentsGrowth(
  recruitedStudent: RecruitedStudent,
  applicability: GrowthApplicability & { abilityAvailable: boolean },
  visuals?: StudentGrowthVisuals,
  equipmentCatalog?: StudentGrowthEquipment,
  equipmentCategories: string[] = [],
): UserStudentsGrowth {
  const abilityAvailable = applicability.abilityAvailable && recruitedStudent.tier > 5;
  const baseGrowth: UserStudentsGrowth = {
    level: recruitedStudent.level,
    equipSpecial: applicability.equipSpecialAvailable ? recruitedStudent.equipSpecial : null,
    equipSpecialAvailable: applicability.equipSpecialAvailable,
    abilityHp: abilityAvailable ? recruitedStudent.abilityHp : null,
    abilityAtk: abilityAvailable ? recruitedStudent.abilityAtk : null,
    abilityHeal: abilityAvailable ? recruitedStudent.abilityHeal : null,
    abilityAvailable,
  };
  if (visuals === undefined && equipmentCatalog === undefined) return baseGrowth;
  if (visuals === undefined || equipmentCatalog === undefined) {
    throw new Error("학생 성장 시각 자료를 함께 확인하지 못했어요");
  }
  const selectedSkills = selectGrowthSkills(recruitedStudent, visuals);
  const equipmentVisuals = selectEquipmentVisuals(
    recruitedStudent,
    equipmentCatalog,
    applicability.equipmentAvailable,
    equipmentCategories,
  );
  return {
    ...baseGrowth,
    skillVisuals: {
      ex: selectedSkills.ex,
      normal: selectedSkills.public,
      enhanced: selectedSkills.passive,
      sub: selectedSkills.extra_passive,
    },
    equipmentVisuals,
  };
}

type GrowthSkillVisuals = Record<StudentSkillTypeEnum, UserStudentsSkillVisual>;

const growthSkillFields: Array<{
  slot: StudentSkillTypeEnum;
  levelKey: keyof Pick<RecruitedStudent, "skillEx" | "skillNormal" | "skillEnhanced" | "skillSub">;
}> = [
  { slot: StudentSkillTypeEnum.Ex, levelKey: "skillEx" },
  { slot: StudentSkillTypeEnum.Public, levelKey: "skillNormal" },
  { slot: StudentSkillTypeEnum.Passive, levelKey: "skillEnhanced" },
  { slot: StudentSkillTypeEnum.ExtraPassive, levelKey: "skillSub" },
];

function selectGrowthSkills(recruitedStudent: RecruitedStudent, visuals: StudentGrowthVisuals): GrowthSkillVisuals {
  const weaponStar = recruitedStudent.tier > 5 ? recruitedStudent.tier - 5 : 0;
  const gearTier = recruitedStudent.equipSpecial ?? 0;
  const configuration = selectUniqueMaximalSkillConfiguration(visuals.skillConfigurations, 0, weaponStar, gearTier);
  if (!configuration) {
    throw new Error("학생 성장 시각 자료의 스킬 설정을 선택하지 못했어요");
  }

  const skillByUid = new Map(visuals.skills.map((skill) => [skill.uid, skill]));
  const selected: Partial<GrowthSkillVisuals> = {};
  for (const { slot, levelKey } of growthSkillFields) {
    const slotData = configuration.slots.find((candidate) => candidate.slot === slot);
    if (!slotData) {
      throw new Error("학생 성장 시각 자료의 스킬 슬롯을 확인하지 못했어요");
    }
    const reference = slotData.skills.find((candidate) => candidate.position === 0);
    if (!reference?.skillUid) {
      throw new Error("학생 성장 시각 자료의 스킬 참조를 확인하지 못했어요");
    }
    const skill = skillByUid.get(reference.skillUid);
    if (!skill || skill.skillType !== slot) {
      throw new Error("학생 성장 시각 자료의 스킬 카탈로그를 확인하지 못했어요");
    }
    const iconUrl = skill.iconUrl?.trim();
    if (!iconUrl) {
      throw new Error("학생 성장 시각 자료의 스킬 카탈로그를 확인하지 못했어요");
    }
    selected[slot] = {
      iconUrl,
      level: recruitedStudent[levelKey],
      maxLevel: skill.maxLevel,
    };
  }
  return selected as GrowthSkillVisuals;
}

function selectEquipmentVisuals(
  recruitedStudent: RecruitedStudent,
  equipmentCatalog: StudentGrowthEquipment,
  equipmentAvailable: [boolean, boolean, boolean],
  equipmentCategories: string[],
): [UserStudentsEquipmentVisual, UserStudentsEquipmentVisual, UserStudentsEquipmentVisual] {
  return [0, 1, 2].map((index) => {
    const tier = [recruitedStudent.equip1, recruitedStudent.equip2, recruitedStudent.equip3][index];
    if (!equipmentAvailable[index]) return { available: false, uid: null, tier: null };
    const category = equipmentCategories[index];
    if (!category) {
      throw new Error("학생 성장 시각 자료의 장비 카테고리를 확인하지 못했어요");
    }
    const equipment = equipmentCatalog.find((candidate) => candidate.category === category && candidate.tier === tier);
    if (tier !== null && !equipment) {
      throw new Error("학생 성장 시각 자료의 장비 티어를 확인하지 못했어요");
    }
    return { available: true, uid: equipment?.uid ?? null, tier };
  }) as [UserStudentsEquipmentVisual, UserStudentsEquipmentVisual, UserStudentsEquipmentVisual];
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
  let growthVisualsByStudentUid: Map<string, StudentGrowthVisuals> | undefined;
  let equipmentCatalog: StudentGrowthEquipment | undefined;
  if (view === "growth") {
    const recruitedStudentUids = recruitedStudents.map((recruitedStudent) => recruitedStudent.studentUid);
    const [weaponAvailabilityByStudentUid, growthVisuals, equipment] = await Promise.all([
      getStudentWeaponAvailability(env, recruitedStudentUids),
      getStudentGrowthVisualsBatch(env, recruitedStudentUids),
      recruitedStudentUids.length > 0 ? getStudentGrowthEquipmentCatalog(env) : Promise.resolve([]),
    ]);
    growthVisualsByStudentUid = growthVisuals;
    equipmentCatalog = equipment;
    for (const recruitedStudent of recruitedStudents) {
      const student = studentsByUid.get(recruitedStudent.studentUid);
      if (!student) {
        throw new Error("보유 학생 정보를 확인하지 못했어요");
      }
      if (!weaponAvailabilityByStudentUid.has(recruitedStudent.studentUid)) {
        throw new Error("학생 고유무기 정보를 확인하지 못했어요");
      }
      const growthVisual = growthVisualsByStudentUid?.get(recruitedStudent.studentUid);
      if (!growthVisual) {
        throw new Error("학생 성장 시각 자료를 확인하지 못했어요");
      }
      applicabilityByStudentUid.set(recruitedStudent.studentUid, {
        equipSpecialAvailable: growthVisual.gearAvailable,
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
          growthVisualsByStudentUid?.get(student.uid),
          equipmentCatalog,
          student.equipments,
        ),
      };
    }),
  };
}
