import type { StudentGearData } from "~/domain/growth-resource";
import { getStudentGearData, getStudentGrowthResourceRequirements } from "~/models/growth-resource";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import { getRelationshipLevel, getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudentsMap, type Student } from "~/models/student";
import {
  getStudentGrowthsWithMetadata,
  getStudentGrowthWithMetadata,
  type StudentGrowthWithMetadata,
} from "~/models/student-growth";
import type {
  DeferredGrowthLayoutLoaderData,
  GrowthLayoutLoaderData,
  GrowthResourceRequirementsByStudent,
  GrowthStudent,
} from "./types";

type GrowthDataLoadOptions = {
  logger?: {
    error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  };
};

type GrowthPlannerCoreData = {
  managedStudents: Array<Omit<GrowthStudent, "resourceRequirements">>;
  availableStudents: GrowthLayoutLoaderData["availableStudents"];
  allStudentsMap: Awaited<ReturnType<typeof getAllStudentsMap>>;
  studentGearDataMap: Map<string, StudentGearData | null>;
};

type BuildStudentRowDataParams = {
  studentUid: string;
  student: Student | undefined;
  growth: StudentGrowthWithMetadata | undefined;
  recruitedStudent: RecruitedStudent | undefined;
  relationship: { currentLevel: number | null; targetLevel: number | null } | undefined;
  gearData: StudentGearData | null;
};

function buildStudentRowData(params: BuildStudentRowDataParams): Omit<GrowthStudent, "resourceRequirements"> {
  const { studentUid, student, growth, recruitedStudent, relationship, gearData } = params;
  const isRecruited = recruitedStudent != null;
  return {
    uid: studentUid,
    name: student?.name ?? studentUid,
    order: student?.order ?? -1,
    plannerCreatedAt: growth?.createdAt ?? null,
    isRecruited,
    released: student?.released ?? false,
    hasGear: gearData != null,
    equipments: student?.equipments ?? [],
    tier: recruitedStudent?.tier ?? null,
    initialTier: student?.initialTier ?? 1,
    relationshipCurrentLevel: relationship?.currentLevel ?? null,
    relationshipTargetLevel: relationship?.targetLevel ?? null,
    level: recruitedStudent?.level ?? null,
    weaponLevel: recruitedStudent?.weaponLevel ?? null,
    abilityHp: recruitedStudent?.abilityHp ?? null,
    abilityAtk: recruitedStudent?.abilityAtk ?? null,
    abilityHeal: recruitedStudent?.abilityHeal ?? null,
    skillEx: recruitedStudent?.skillEx ?? null,
    skillNormal: recruitedStudent?.skillNormal ?? null,
    skillEnhanced: recruitedStudent?.skillEnhanced ?? null,
    skillSub: recruitedStudent?.skillSub ?? null,
    equip1: recruitedStudent?.equip1 ?? null,
    equip2: recruitedStudent?.equip2 ?? null,
    equip3: recruitedStudent?.equip3 ?? null,
    equipSpecial: gearData ? (recruitedStudent?.equipSpecial ?? null) : null,
    targetLevel: growth?.targetLevel ?? null,
    targetWeaponLevel: growth?.targetWeaponLevel ?? null,
    targetAbilityHp: growth?.targetAbilityHp ?? null,
    targetAbilityAtk: growth?.targetAbilityAtk ?? null,
    targetAbilityHeal: growth?.targetAbilityHeal ?? null,
    targetSkillEx: growth?.targetSkillEx ?? null,
    targetSkillNormal: growth?.targetSkillNormal ?? null,
    targetSkillEnhanced: growth?.targetSkillEnhanced ?? null,
    targetSkillSub: growth?.targetSkillSub ?? null,
    targetEquip1: growth?.targetEquip1 ?? null,
    targetEquip2: growth?.targetEquip2 ?? null,
    targetEquip3: growth?.targetEquip3 ?? null,
    targetEquipSpecial: gearData ? (growth?.targetEquipSpecial ?? null) : null,
    targetTier: growth?.targetTier ?? null,
  };
}

export async function loadStudentRow(
  env: Env,
  userId: number,
  studentUid: string,
  options: GrowthDataLoadOptions & { includeResourceRequirements?: boolean } = {},
): Promise<GrowthStudent | null> {
  const [growth, relationship, recruitedStudents, allStudentsMap, gearDataMap] = await Promise.all([
    getStudentGrowthWithMetadata(env, userId, studentUid),
    getRelationshipLevel(env, userId, studentUid),
    getRecruitedStudents(env, userId),
    getAllStudentsMap(env, true),
    getStudentGearData(env, [studentUid]),
  ]);

  const student = allStudentsMap[studentUid];
  if (!student) {
    return null;
  }

  const gearData = gearDataMap.get(studentUid) ?? null;
  const recruitedStudent = recruitedStudents.find((entry) => entry.studentUid === studentUid);

  const base = buildStudentRowData({
    studentUid,
    student,
    growth: growth ?? undefined,
    recruitedStudent,
    relationship: relationship
      ? { currentLevel: relationship.currentLevel, targetLevel: relationship.targetLevel }
      : undefined,
    gearData,
  });

  const resourceRequirements = options.includeResourceRequirements
    ? ((
        await getStudentGrowthResourceRequirements(env, [base], allStudentsMap, gearDataMap, {
          logger: options.logger,
        })
      )[studentUid] ?? null)
    : null;

  return {
    ...base,
    resourceRequirements,
  };
}

async function loadGrowthPlannerCoreData(env: Env, userId: number): Promise<GrowthPlannerCoreData> {
  const [recruitedStudents, growths, relationshipLevels, allStudentsMap] = await Promise.all([
    getRecruitedStudents(env, userId),
    getStudentGrowthsWithMetadata(env, userId),
    getRelationshipLevels(env, userId),
    getAllStudentsMap(env, true),
  ]);

  const growthMap = growths.reduce(
    (acc, growth) => {
      acc[growth.studentUid] = growth;
      return acc;
    },
    {} as Record<string, (typeof growths)[number]>,
  );
  const relationshipMap = relationshipLevels.reduce(
    (acc, relationshipLevel) => {
      acc[relationshipLevel.studentId] = relationshipLevel;
      return acc;
    },
    {} as Record<string, (typeof relationshipLevels)[number]>,
  );

  const managedUids = new Set(growths.map((growth) => growth.studentUid));
  const recruitedStudentMap = recruitedStudents.reduce(
    (acc, recruitedStudent) => {
      acc[recruitedStudent.studentUid] = recruitedStudent;
      return acc;
    },
    {} as Record<string, RecruitedStudent>,
  );

  const managedStudentsBase = [...managedUids]
    .map((studentUid) => ({
      studentUid,
      student: allStudentsMap[studentUid],
      growth: growthMap[studentUid],
      recruitedStudent: recruitedStudentMap[studentUid],
    }))
    .sort((a, b) => (b.student?.order ?? -1) - (a.student?.order ?? -1));

  const studentGearDataMap = await getStudentGearData(
    env,
    managedStudentsBase.map(({ studentUid }) => studentUid),
  );

  const managedStudentsData = managedStudentsBase.map((entry) => {
    const { studentUid, student, growth, recruitedStudent } = entry;
    const gearData = studentGearDataMap.get(studentUid) ?? null;
    const relationship = relationshipMap[studentUid];

    return buildStudentRowData({
      studentUid,
      student,
      growth,
      recruitedStudent,
      relationship: relationship
        ? { currentLevel: relationship.currentLevel, targetLevel: relationship.targetLevel }
        : undefined,
      gearData,
    });
  });

  return {
    managedStudents: managedStudentsData,
    availableStudents: Object.values(allStudentsMap)
      .filter((student) => !managedUids.has(student.uid))
      .map((student) => ({ uid: student.uid, name: student.name }))
      .sort((a, b) => (allStudentsMap[b.uid]?.order ?? -1) - (allStudentsMap[a.uid]?.order ?? -1)),
    allStudentsMap,
    studentGearDataMap,
  };
}

async function loadGrowthResourceRequirements(
  env: Env,
  coreData: GrowthPlannerCoreData,
  options: GrowthDataLoadOptions,
): Promise<GrowthResourceRequirementsByStudent> {
  return getStudentGrowthResourceRequirements(
    env,
    coreData.managedStudents,
    coreData.allStudentsMap,
    coreData.studentGearDataMap,
    { logger: options.logger },
  );
}

function withResourceRequirements(
  students: GrowthPlannerCoreData["managedStudents"],
  resourceRequirements: GrowthResourceRequirementsByStudent | null,
): GrowthStudent[] {
  return students.map((student) => ({
    ...student,
    resourceRequirements: resourceRequirements?.[student.uid] ?? null,
  }));
}

export async function loadGrowthPlannerData(
  env: Env,
  userId: number,
  options: GrowthDataLoadOptions = {},
): Promise<GrowthLayoutLoaderData> {
  const coreData = await loadGrowthPlannerCoreData(env, userId);
  const resourceRequirements = await loadGrowthResourceRequirements(env, coreData, options);

  return {
    managedStudents: withResourceRequirements(coreData.managedStudents, resourceRequirements),
    availableStudents: coreData.availableStudents,
  };
}

export async function loadDeferredGrowthPlannerData(
  env: Env,
  userId: number,
  options: GrowthDataLoadOptions = {},
): Promise<DeferredGrowthLayoutLoaderData> {
  const coreData = await loadGrowthPlannerCoreData(env, userId);

  return {
    managedStudents: withResourceRequirements(coreData.managedStudents, null),
    availableStudents: coreData.availableStudents,
    resourceRequirements: loadGrowthResourceRequirements(env, coreData, options),
  };
}
