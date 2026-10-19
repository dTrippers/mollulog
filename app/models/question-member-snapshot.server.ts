import type { FavoriteStudent } from "~/domain/favorite-student";
import type { MemberSnapshot } from "~/models/al1s-question-contract";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getUserPartiesByUserId, type Party } from "~/models/party.server";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import { getRelationshipLevels, type RelationshipLevel } from "~/models/relationship-level";

export function mapQuestionSnapshotStudents(
  recruitedStudents: RecruitedStudent[],
  relationshipLevels: RelationshipLevel[],
): MemberSnapshot["students"] {
  const relationshipsByStudent = new Map(relationshipLevels.map((level) => [level.studentId, level]));
  return recruitedStudents.map((student) => ({
    studentUid: student.studentUid,
    star: Math.min(student.tier, 5),
    weaponStar: Math.max(student.tier - 5, 0),
    level: student.level,
    skills: {
      ex: student.skillEx,
      normal: student.skillNormal,
      enhanced: student.skillEnhanced,
      sub: student.skillSub,
    },
    equipmentTiers: [student.equip1, student.equip2, student.equip3],
    equipSpecial: student.equipSpecial,
    relationshipLevel: relationshipsByStudent.get(student.studentUid)?.currentLevel ?? null,
  }));
}

export function mapQuestionSnapshotFavorites(favorites: FavoriteStudent[]): MemberSnapshot["favorites"] {
  return favorites.map(({ studentId, contentId }) => ({ studentUid: studentId, contentId }));
}

type SnapshotSources = {
  getRecruitedStudents: typeof getRecruitedStudents;
  getRelationshipLevels: typeof getRelationshipLevels;
  getUserFavoritedStudents: typeof getUserFavoritedStudents;
  getUserPartiesByUserId: typeof getUserPartiesByUserId;
};

const databaseSources: SnapshotSources = {
  getRecruitedStudents,
  getRelationshipLevels,
  getUserFavoritedStudents,
  getUserPartiesByUserId,
};

export function mapQuestionSnapshotFormations(parties: Party[]): MemberSnapshot["formations"] {
  return parties
    .filter((party) => party.studentIds.length > 0)
    .map(({ name, raidType, seasonIndex, studentIds }) => ({
      name,
      raidType,
      seasonIndex,
      studentUids: studentIds.map((row) => [...row]),
    }));
}

export async function buildQuestionMemberSnapshot(
  env: Env,
  senseiId: number,
  sources: SnapshotSources = databaseSources,
): Promise<MemberSnapshot> {
  const [recruitedStudents, relationshipLevels, favorites, parties] = await Promise.all([
    sources.getRecruitedStudents(env, senseiId),
    sources.getRelationshipLevels(env, senseiId),
    sources.getUserFavoritedStudents(env, senseiId),
    sources.getUserPartiesByUserId(env, senseiId, { includePrivate: true }),
  ]);

  return {
    version: 1,
    students: mapQuestionSnapshotStudents(recruitedStudents, relationshipLevels),
    favorites: mapQuestionSnapshotFavorites(favorites),
    formations: mapQuestionSnapshotFormations(parties),
  };
}
