import type { FavoriteStudent } from "~/domain/favorite-student";
import type { PlannerStateDocumentV1 } from "~/domain/planner-state";
import type { MemberSnapshot } from "~/models/al1s-question-contract";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getUserPartiesByUserId, type Party } from "~/models/party.server";
import { getPlannerState } from "~/models/planner-state";
import { getRecruitedStudents, type RecruitedStudent } from "~/models/recruited-student";
import { getRelationshipLevels, type RelationshipLevel } from "~/models/relationship-level";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";

// Held eleph is stored in the growth resource inventory under the student uid.
export function mapQuestionSnapshotStudents(
  recruitedStudents: RecruitedStudent[],
  relationshipLevels: RelationshipLevel[],
  elephByStudentUid: Record<string, number> = {},
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
    eleph: Object.hasOwn(elephByStudentUid, student.studentUid) ? elephByStudentUid[student.studentUid] : null,
  }));
}

export function mapQuestionSnapshotFavorites(favorites: FavoriteStudent[]): MemberSnapshot["favorites"] {
  return favorites.map(({ studentId, contentId }) => ({ studentUid: studentId, contentId }));
}

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

export function mapQuestionSnapshotResources(
  resources: PlannerStateDocumentV1["pyroxene"]["resources"],
): MemberSnapshot["resources"] {
  if (resources === null) return null;
  return {
    inputAt: resources.inputAt,
    pyroxene: resources.pyroxene,
    oneTimeTicket: resources.oneTimeTicket,
    tenTimeTicket: resources.tenTimeTicket,
    recruitmentStacks: resources.recruitmentStacks
      ? { regular: resources.recruitmentStacks.regular, limited: resources.recruitmentStacks.limited }
      : null,
  };
}

// Planner event data is keyed by the BAQL recruitment group uid; targetTiers holds only targets above ★3.
export function mapQuestionSnapshotRecruitmentPlans(
  eventData: PlannerStateDocumentV1["pyroxene"]["eventData"],
): MemberSnapshot["recruitmentPlans"] {
  return Object.entries(eventData)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([recruitmentGroupUid, data]) => ({
      recruitmentGroupUid,
      completed: data.completed,
      expectedTrials: data.expectedTrials,
      targetTiers: Object.entries(data.targetTiers ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([studentUid, targetTier]) => ({ studentUid, targetTier })),
    }));
}

type SnapshotPlannerState = {
  pyroxene: Pick<PlannerStateDocumentV1["pyroxene"], "resources" | "eventData">;
  ap: { accountLevel: number | null } | null;
};

type SnapshotSources = {
  getRecruitedStudents: typeof getRecruitedStudents;
  getRelationshipLevels: typeof getRelationshipLevels;
  getUserFavoritedStudents: typeof getUserFavoritedStudents;
  getUserPartiesByUserId: typeof getUserPartiesByUserId;
  getPlannerState: (env: Env, userId: number) => Promise<SnapshotPlannerState>;
  getUserResourceInventoryMapByItemUids: typeof getUserResourceInventoryMapByItemUids;
};

const databaseSources: SnapshotSources = {
  getRecruitedStudents,
  getRelationshipLevels,
  getUserFavoritedStudents,
  getUserPartiesByUserId,
  getPlannerState: (env, userId) => getPlannerState(env, userId),
  getUserResourceInventoryMapByItemUids,
};

export async function buildQuestionMemberSnapshot(
  env: Env,
  senseiId: number,
  sources: SnapshotSources = databaseSources,
): Promise<MemberSnapshot> {
  const [recruitedStudents, relationshipLevels, favorites, parties, plannerState] = await Promise.all([
    sources.getRecruitedStudents(env, senseiId),
    sources.getRelationshipLevels(env, senseiId),
    sources.getUserFavoritedStudents(env, senseiId),
    sources.getUserPartiesByUserId(env, senseiId, { includePrivate: true }),
    sources.getPlannerState(env, senseiId),
  ]);
  const elephByStudentUid = await sources.getUserResourceInventoryMapByItemUids(
    env,
    senseiId,
    recruitedStudents.map(({ studentUid }) => studentUid),
  );

  return {
    version: 2,
    students: mapQuestionSnapshotStudents(recruitedStudents, relationshipLevels, elephByStudentUid),
    favorites: mapQuestionSnapshotFavorites(favorites),
    formations: mapQuestionSnapshotFormations(parties),
    resources: mapQuestionSnapshotResources(plannerState.pyroxene.resources),
    recruitmentPlans: mapQuestionSnapshotRecruitmentPlans(plannerState.pyroxene.eventData),
    accountLevel: plannerState.ap?.accountLevel ?? null,
  };
}
