import {
  type StudentGearData,
  fetchStudentGearData,
  getStudentGrowthResourceRequirements,
} from "~/models/growth-resource";
import { getRecruitedStudents, getRecruitedStudentTiers } from "~/models/recruited-student";
import { getRelationshipLevel, getRelationshipLevels } from "~/models/relationship-level";
import { type Student, getAllStudentsMap } from "~/models/student";
import { type StudentGrowth, getStudentGrowth, getStudentGrowths } from "~/models/student-growth";
import type { GrowthLayoutLoaderData, GrowthStudent } from "./types";

type BuildStudentRowDataParams = {
  studentUid: string;
  student: Student | undefined;
  growth: StudentGrowth | undefined;
  isRecruited: boolean;
  tier: number | null;
  relationship: { currentLevel: number | null; targetLevel: number | null } | undefined;
  gearData: StudentGearData | null;
};

function buildStudentRowData(params: BuildStudentRowDataParams): Omit<GrowthStudent, "resourceRequirements"> {
  const { studentUid, student, growth, isRecruited, tier, relationship, gearData } = params;
  return {
    uid: studentUid,
    name: student?.name ?? studentUid,
    order: student?.order ?? -1,
    isRecruited,
    released: student?.released ?? false,
    hasGear: gearData != null,
    equipments: student?.equipments ?? [],
    tier: isRecruited ? tier : null,
    initialTier: student?.initialTier ?? 1,
    relationshipCurrentLevel: relationship?.currentLevel ?? null,
    relationshipTargetLevel: relationship?.targetLevel ?? null,
    level: growth?.level ?? null,
    skillEx: growth?.skillEx ?? null,
    skillNormal: growth?.skillNormal ?? null,
    skillEnhanced: growth?.skillEnhanced ?? null,
    skillSub: growth?.skillSub ?? null,
    equip1: growth?.equip1 ?? null,
    equip2: growth?.equip2 ?? null,
    equip3: growth?.equip3 ?? null,
    equipSpecial: gearData ? (growth?.equipSpecial ?? null) : null,
    targetLevel: growth?.targetLevel ?? null,
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
): Promise<GrowthStudent | null> {
  const [growth, relationship, recruitedTierMap, allStudentsMap, gearDataMap] = await Promise.all([
    getStudentGrowth(env, userId, studentUid),
    getRelationshipLevel(env, userId, studentUid),
    getRecruitedStudentTiers(env, userId),
    getAllStudentsMap(env, true),
    fetchStudentGearData([studentUid]),
  ]);

  const student = allStudentsMap[studentUid];
  if (!student) {
    return null;
  }

  const gearData = gearDataMap.get(studentUid) ?? null;
  const tier = recruitedTierMap[studentUid] ?? null;
  const isRecruited = studentUid in recruitedTierMap;

  const base = buildStudentRowData({
    studentUid,
    student,
    growth: growth ?? undefined,
    isRecruited,
    tier,
    relationship: relationship
      ? { currentLevel: relationship.currentLevel, targetLevel: relationship.targetLevel }
      : undefined,
    gearData,
  });

  const requirementsMap = await getStudentGrowthResourceRequirements([base], allStudentsMap, gearDataMap);

  return {
    ...base,
    resourceRequirements: requirementsMap[studentUid] ?? { items: [], skillUnavailable: false },
  };
}

export async function loadGrowthPlannerData(env: Env, userId: number): Promise<GrowthLayoutLoaderData> {
  const [recruitedStudents, growths, relationshipLevels, allStudentsMap] = await Promise.all([
    getRecruitedStudents(env, userId),
    getStudentGrowths(env, userId),
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
  const recruitedUids = new Set(recruitedStudents.map((recruitedStudent) => recruitedStudent.studentUid));
  const recruitedTierMap = recruitedStudents.reduce(
    (acc, recruitedStudent) => {
      acc[recruitedStudent.studentUid] = recruitedStudent.tier;
      return acc;
    },
    {} as Record<string, number>,
  );

  const managedStudentsBase = [...managedUids]
    .map((studentUid) => ({
      studentUid,
      student: allStudentsMap[studentUid],
      growth: growthMap[studentUid],
      isRecruited: recruitedUids.has(studentUid),
    }))
    .sort((a, b) => (b.student?.order ?? -1) - (a.student?.order ?? -1));

  const studentGearDataMap = await fetchStudentGearData(managedStudentsBase.map(({ studentUid }) => studentUid));

  const managedStudentsData = managedStudentsBase.map((entry) => {
    const { studentUid, student, growth, isRecruited } = entry;
    const gearData = studentGearDataMap.get(studentUid) ?? null;
    const relationship = relationshipMap[studentUid];

    return buildStudentRowData({
      studentUid,
      student,
      growth,
      isRecruited,
      tier: recruitedTierMap[studentUid] ?? null,
      relationship: relationship
        ? { currentLevel: relationship.currentLevel, targetLevel: relationship.targetLevel }
        : undefined,
      gearData,
    });
  });

  const growthResourceRequirements = await getStudentGrowthResourceRequirements(
    managedStudentsData,
    allStudentsMap,
    studentGearDataMap,
  );
  const managedStudents = managedStudentsData.map((student) => ({
    ...student,
    resourceRequirements: growthResourceRequirements[student.uid] ?? { items: [], skillUnavailable: false },
  }));

  const availableStudents = Object.values(allStudentsMap)
    .filter((student) => !managedUids.has(student.uid))
    .map((student) => ({ uid: student.uid, name: student.name }))
    .sort((a, b) => (allStudentsMap[b.uid]?.order ?? -1) - (allStudentsMap[a.uid]?.order ?? -1));

  return { managedStudents, availableStudents };
}
