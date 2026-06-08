import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { nowUtcIso } from "~/lib/date-time";
import { getFutureContents } from "~/models/content";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { canCompleteRecruitmentStudent } from "~/models/recruitment-result-completion";
import {
  addRecruitedStudentToResult,
  deleteRecruitmentResult,
  removeRecruitedStudentFromResult,
  setRecruitmentResultCompletion,
  upsertRecruitmentResult,
  type RecruitmentResultStudent,
} from "~/models/recruitment-result";

export type ActionData =
  | {
      action: "complete";
      recruitmentGroupUid: string;
      contentUid?: string | null;
      studentUid?: string | null;
      tier?: number | null;
      pickup?: boolean;
      trial?: number | null;
      rawResult?: string | null;
      comment?: string | null;
      recruitedStudents?: RecruitmentResultStudent[];
      exchangedStudents?: RecruitmentResultStudent[];
    }
  | {
      action: "completeStudent";
      recruitmentGroupUid: string;
      contentUid?: string | null;
      studentUid: string;
      tier?: number | null;
      pickup?: boolean;
    }
  | {
      action: "uncompleteStudent";
      recruitmentGroupUid: string;
      studentUid: string;
    }
  | {
      action: "cancel";
      recruitmentGroupUid: string;
      contentUid?: string | null;
    }
  | {
      action: "upsert";
      recruitmentGroupUid: string;
      contentUid?: string | null;
      completed?: boolean;
      trial?: number | null;
      rawResult?: string | null;
      comment?: string | null;
      recruitedStudents?: RecruitmentResultStudent[];
      exchangedStudents?: RecruitmentResultStudent[];
    }
  | {
      action: "delete";
      uid: string;
    };

function getStudentsFromAction(actionData: Extract<ActionData, { action: "complete" | "upsert" }>) {
  if (actionData.recruitedStudents) {
    return actionData.recruitedStudents;
  }

  if (actionData.action === "complete" && actionData.studentUid) {
    return [
      {
        studentUid: actionData.studentUid,
        tier: actionData.tier ?? 3,
        pickup: actionData.pickup ?? true,
      },
    ];
  }

  return undefined;
}

type CompleteStudentActionData = Extract<ActionData, { action: "completeStudent" }>;

async function canCompleteRecruitmentAction(env: Env, userId: number, actionData: CompleteStudentActionData) {
  const [contents, favoritedStudents] = await Promise.all([
    getFutureContents(env),
    getUserFavoritedStudents(env, userId),
  ]);

  for (const content of contents) {
    if (content.recruitmentGroupUid !== actionData.recruitmentGroupUid) {
      continue;
    }

    if (
      actionData.contentUid &&
      actionData.contentUid !== content.uid &&
      actionData.contentUid !== content.contentUid
    ) {
      continue;
    }

    const recruitment = content.recruitments.find(
      (item) => item.student?.uid === actionData.studentUid,
    );
    if (!recruitment) {
      continue;
    }

    const favorited = favoritedStudents.some(
      (favorite) => favorite.contentId === content.uid && favorite.studentId === actionData.studentUid,
    );

    return canCompleteRecruitmentStudent({
      recruitmentSince: recruitment.since,
      favorited,
      now: nowUtcIso(),
    });
  }

  return false;
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const actionData = await request.json<ActionData>();
  if (actionData.action === "delete") {
    await deleteRecruitmentResult(env, currentUser.id, actionData.uid);
    return data({ success: true });
  }

  if (!actionData.recruitmentGroupUid) {
    return data({ error: "recruitmentGroupUid is required" }, { status: 400 });
  }

  if (actionData.action === "cancel") {
    const result = await setRecruitmentResultCompletion(env, currentUser.id, actionData.recruitmentGroupUid, false, {
      contentUid: actionData.contentUid ?? null,
    });
    return data({ success: true, result });
  }

  if (actionData.action === "completeStudent") {
    if (!actionData.studentUid) {
      return data({ error: "studentUid is required" }, { status: 400 });
    }

    if (!(await canCompleteRecruitmentAction(env, currentUser.id, actionData))) {
      return data({ error: "Recruitment completion is not allowed" }, { status: 400 });
    }

    const result = await addRecruitedStudentToResult(env, currentUser.id, {
      recruitmentGroupUid: actionData.recruitmentGroupUid,
      contentUid: actionData.contentUid ?? null,
      studentUid: actionData.studentUid,
      tier: actionData.tier ?? 3,
      pickup: actionData.pickup ?? true,
    });
    return data({ success: true, result });
  }

  if (actionData.action === "uncompleteStudent") {
    if (!actionData.studentUid) {
      return data({ error: "studentUid is required" }, { status: 400 });
    }

    const result = await removeRecruitedStudentFromResult(
      env,
      currentUser.id,
      actionData.recruitmentGroupUid,
      actionData.studentUid,
    );
    return data({ success: true, result });
  }

  if (actionData.action === "complete") {
    const result = await setRecruitmentResultCompletion(env, currentUser.id, actionData.recruitmentGroupUid, true, {
      contentUid: actionData.contentUid ?? null,
      recruitedStudents: getStudentsFromAction(actionData),
      exchangedStudents: actionData.exchangedStudents,
      trial: actionData.trial ?? undefined,
      rawResult: actionData.rawResult ?? undefined,
      comment: actionData.comment ?? undefined,
      subjectStudentUid: actionData.studentUid ?? null,
    });
    return data({ success: true, result });
  }

  const result = await upsertRecruitmentResult(env, currentUser.id, {
    recruitmentGroupUid: actionData.recruitmentGroupUid,
    contentUid: actionData.contentUid ?? null,
    completedAt: actionData.completed === false ? null : undefined,
    recruitedStudents: getStudentsFromAction(actionData),
    exchangedStudents: actionData.exchangedStudents,
    trial: actionData.trial ?? undefined,
    rawResult: actionData.rawResult ?? undefined,
    comment: actionData.comment ?? undefined,
  });
  return data({ success: true, result });
};
