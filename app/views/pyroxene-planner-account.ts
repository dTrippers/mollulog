import {
  buildRecruitmentOwnedSnapshot,
  EMPTY_RECRUITMENT_STACKS,
  type RecruitmentOwnedSnapshot,
  type RecruitmentStacks,
} from "~/domain/pyroxene-recruitment-goal";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getPyroxeneUserState } from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import type { PyroxenePlannerContent } from "~/views/pyroxene";

type PyroxeneUserState = Awaited<ReturnType<typeof getPyroxeneUserState>>;

export type PyroxenePlannerAccount = {
  favoritedStudents: { contentUid: string; studentUid: string }[];
  latestResources: {
    pyroxene: number;
    oneTimeTicket: number;
    tenTimeTicket: number;
    // Null when the account has never entered its resources.
    inputAt: string | null;
    recruitmentStacks: RecruitmentStacks;
  };
  timelineItems: PyroxeneUserState["timelineItems"];
  calcOptions: PyroxeneUserState["options"];
  eventData: PyroxeneUserState["eventData"];
  recruitmentResultCompletions: {
    eventUid: string;
    recruitmentGroupUid: string;
    recruitmentResultUid: string | null;
  }[];
  recruitedStudentUids: string[];
  recruitmentOwnedSnapshot: RecruitmentOwnedSnapshot;
  collectedSourceKeys: string[];
};

/** The signed-in account's pyroxene planner state, as the pyroxene planner screen calculates it. */
export async function loadPyroxenePlannerAccount(
  env: Env,
  userId: number,
  contents: PyroxenePlannerContent[],
  ctx?: ExecutionContext,
): Promise<PyroxenePlannerAccount> {
  // User state reads share one PostgreSQL client; unrelated repositories remain parallel.
  const recruitmentGroupUids = contents.flatMap((content) =>
    content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
  );

  const ownedReadAt = new Date().toISOString();
  const favoritedStudentsPromise = getUserFavoritedStudents(env, userId, undefined, { ctx });
  const [favoritedStudents, pyroxeneState, recruitmentResults, recruitedStudents, favoriteHeldEleph] =
    await Promise.all([
      favoritedStudentsPromise,
      getPyroxeneUserState(env, userId, { ctx }),
      getRecruitmentResultsByRecruitmentGroupUids(env, userId, recruitmentGroupUids),
      getRecruitedStudents(env, userId),
      favoritedStudentsPromise.then((items) =>
        getUserResourceInventoryMapByItemUids(
          env,
          userId,
          items.map(({ studentId }) => studentId),
        ),
      ),
    ]);

  return {
    favoritedStudents: favoritedStudents.map(({ contentId, studentId }) => ({
      contentUid: contentId,
      studentUid: studentId,
    })),
    latestResources: {
      pyroxene: pyroxeneState.latestResources?.pyroxene ?? 0,
      oneTimeTicket: pyroxeneState.latestResources?.oneTimeTicket ?? 0,
      tenTimeTicket: pyroxeneState.latestResources?.tenTimeTicket ?? 0,
      inputAt: pyroxeneState.latestResources?.inputAt ?? null,
      recruitmentStacks: pyroxeneState.latestResources?.recruitmentStacks ?? EMPTY_RECRUITMENT_STACKS,
    },
    timelineItems: pyroxeneState.timelineItems,
    calcOptions: pyroxeneState.options,
    eventData: pyroxeneState.eventData,
    recruitmentResultCompletions: recruitmentResults.flatMap((result) => {
      if (!result.completedAt) {
        return [];
      }

      const content = contents.find(
        (content) => content.kind === "event" && content.recruitmentGroupUid === result.recruitmentGroupUid,
      );
      return content
        ? [
            {
              eventUid: content.uid,
              recruitmentGroupUid: result.recruitmentGroupUid,
              recruitmentResultUid: result.uid as string | null,
            },
          ]
        : [];
    }),
    recruitedStudentUids: recruitedStudents.map(({ studentUid }) => studentUid),
    recruitmentOwnedSnapshot: buildRecruitmentOwnedSnapshot(
      ownedReadAt,
      favoritedStudents.map(({ studentId }) => studentId),
      Object.fromEntries(recruitedStudents.map(({ studentUid, tier }) => [studentUid, tier])),
      favoriteHeldEleph,
    ),
    collectedSourceKeys: [...pyroxeneState.collectedSourceKeys],
  };
}
