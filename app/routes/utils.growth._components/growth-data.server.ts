import { fetchStudentGearData, getStudentGrowthResourceRequirements } from "~/models/growth-resource";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import { getStudentGrowths } from "~/models/student-growth";
import type { GrowthLayoutLoaderData } from "./types";

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

    return {
      uid: studentUid,
      name: student?.name ?? studentUid,
      order: student?.order ?? -1,
      isRecruited,
      released: student?.released ?? false,
      hasGear: gearData != null,
      equipments: student?.equipments ?? [],
      tier: isRecruited ? (recruitedTierMap[studentUid] ?? null) : null,
      initialTier: student?.initialTier ?? 1,
      relationshipCurrentLevel: relationshipMap[studentUid]?.currentLevel ?? null,
      relationshipTargetLevel: relationshipMap[studentUid]?.targetLevel ?? null,
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
