import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { routeError } from "~/lib/http-errors";
import { getRecruitedStudents, getRecruitedStudentTiers } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import { getStudentGrowths } from "~/models/student-growth";
import { parseStudentStateDraftValue } from "~/models/student-state-draft-value";
import {
  type SyncDraft,
  type SyncDraftEntry,
  type SyncDraftType,
  applySyncDraft,
  discardSyncDraft,
  getSyncDraft,
  normalizeSyncDraftEntryValue,
  updateSyncDraftEntries,
} from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import { getItemCatalogResourceMap } from "~/repositories/item-catalog";
import SyncDraftReview, {
  type SyncDraftDisplayMetadata,
  type SyncDraftReviewActionData,
} from "./connect.drafts._components/SyncDraftReview";
import StudentStateDraftReview, {
  type StudentStateCurrentValues,
  type StudentStateProposedValues,
} from "./connect.drafts._components/StudentStateDraftReview";

type ActionData = SyncDraftReviewActionData;

export const meta: MetaFunction = () => [{ title: "연동 변경안 확인 | 몰루로그" }];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const draftUid = params.draftUid;
  if (!draftUid) {
    throw routeError(404, "sync_draft.not_found", "변경안을 찾을 수 없어요");
  }

  const draft = await getSyncDraft(env, currentUser.id, draftUid);
  if (!draft) {
    throw routeError(404, "sync_draft.not_found", "변경안을 찾을 수 없어요");
  }

  const entryKeys = draft.entries.map((entry) => entry.entryKey);
  const [metadataByKey, currentValues] = await Promise.all([
    loadDraftMetadata(env, draft),
    loadCurrentValues(env, currentUser.id, draft.type, entryKeys),
  ]);
  const proposedStudentStateValues =
    draft.type === "student_state" ? parseStudentStateDraftValues(draft.entries) : undefined;

  return { draft, metadataByKey, currentValues, proposedStudentStateValues };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const draftUid = params.draftUid;
  if (!draftUid) {
    return data<ActionData>({ error: "변경안을 찾을 수 없어요" }, { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "save" || intent === "apply") {
      const draft = await getSyncDraft(env, currentUser.id, draftUid);
      if (!draft) {
        return data<ActionData>({ intent, error: "변경안을 찾을 수 없어요" }, { status: 404 });
      }
      if (draft.status !== "pending") {
        return data<ActionData>({ intent, error: "이미 처리된 변경안이에요" }, { status: 400 });
      }
      if (draft.type === "student_state" && intent === "save") {
        return data<ActionData>({ intent, error: "학생 상태 변경안은 수정할 수 없어요" }, { status: 400 });
      }

      if (draft.type !== "student_state") {
        const { entries, fieldErrors } = parseDraftEntryFormData(draft, formData);
        if (Object.keys(fieldErrors).length > 0) {
          return data<ActionData>({ intent, error: "입력값을 확인해주세요.", fieldErrors }, { status: 400 });
        }

        await updateSyncDraftEntries(env, currentUser.id, draftUid, entries);
      }

      if (intent === "apply") {
        await applySyncDraft(env, currentUser.id, draftUid);
        return redirect("/connect/drafts");
      }

      return data<ActionData>({ intent, success: "수정값을 저장했어요." });
    }

    if (intent === "discard") {
      await discardSyncDraft(env, currentUser.id, draftUid);
      return redirect("/connect/drafts");
    }

    return data<ActionData>({ error: "지원하지 않는 요청이에요" }, { status: 400 });
  } catch (error) {
    return data<ActionData>(
      {
        intent: typeof intent === "string" ? toActionIntent(intent) : undefined,
        error: error instanceof Error ? error.message : "변경안을 처리하지 못했어요",
      },
      { status: 400 },
    );
  }
};

export default function ConnectDraftDetailPage() {
  const { draft, metadataByKey, currentValues, proposedStudentStateValues } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (draft.type === "student_state") {
    return (
      <StudentStateDraftReview
        draft={draft}
        metadataByKey={metadataByKey}
        currentValues={currentValues as StudentStateCurrentValues}
        proposedValues={proposedStudentStateValues as StudentStateProposedValues}
        actionData={actionData}
      />
    );
  }

  return (
    <SyncDraftReview
      draft={draft}
      metadataByKey={metadataByKey}
      currentValues={currentValues as Record<string, number>}
      actionData={actionData}
    />
  );
}

async function loadDraftMetadata(env: Env, draft: SyncDraft): Promise<Record<string, SyncDraftDisplayMetadata>> {
  if (draft.type === "student_tier" || draft.type === "student_state") {
    const studentsByUid = await getAllStudentsMap(env);
    return Object.fromEntries(
      draft.entries.map((entry) => [
        entry.entryKey,
        {
          label: studentsByUid[entry.entryKey]?.name ?? `알 수 없는 학생 (${entry.entryKey})`,
          studentUid: entry.entryKey,
        },
      ]),
    );
  }

  const resourcesByUid = await getItemCatalogResourceMap(env);
  return Object.fromEntries(
    draft.entries.map((entry) => [
      entry.entryKey,
      {
        label: resourcesByUid[entry.entryKey]?.name ?? `알 수 없는 아이템 (${entry.entryKey})`,
        item: resourcesByUid[entry.entryKey],
      },
    ]),
  );
}

async function loadCurrentValues(
  env: Env,
  userId: number,
  type: SyncDraftType,
  entryKeys: string[],
): Promise<Record<string, number> | StudentStateCurrentValues> {
  if (type === "student_state") {
    const [recruitedStudents, relationshipLevels, studentGrowths] = await Promise.all([
      getRecruitedStudents(env, userId),
      getRelationshipLevels(env, userId),
      getStudentGrowths(env, userId),
    ]);
    const recruitedStudentsByUid = Object.fromEntries(
      recruitedStudents.map((student) => [student.studentUid, student]),
    );
    const relationshipsByStudentId = Object.fromEntries(
      relationshipLevels.map((relationship) => [relationship.studentId, relationship]),
    );
    const studentGrowthsByUid = Object.fromEntries(
      studentGrowths.map((growth) => [growth.studentUid, growth]),
    );

    return Object.fromEntries(
      entryKeys.map((entryKey) => {
        const recruitedStudent = recruitedStudentsByUid[entryKey];
        const relationshipLevel = relationshipsByStudentId[entryKey];
        const studentGrowth = studentGrowthsByUid[entryKey];
        return [
          entryKey,
          {
            current: {
              level: recruitedStudent?.level ?? null,
              tier: recruitedStudent?.tier ?? null,
              weaponLevel: recruitedStudent?.weaponLevel ?? null,
              skillEx: recruitedStudent?.skillEx ?? null,
              skillNormal: recruitedStudent?.skillNormal ?? null,
              skillEnhanced: recruitedStudent?.skillEnhanced ?? null,
              skillSub: recruitedStudent?.skillSub ?? null,
              equip1: recruitedStudent?.equip1 ?? null,
              equip2: recruitedStudent?.equip2 ?? null,
              equip3: recruitedStudent?.equip3 ?? null,
              equipSpecial: recruitedStudent?.equipSpecial ?? null,
              abilityHp: recruitedStudent?.abilityHp ?? null,
              abilityAtk: recruitedStudent?.abilityAtk ?? null,
              abilityHeal: recruitedStudent?.abilityHeal ?? null,
              bond: relationshipLevel?.currentLevel ?? null,
            },
            target: {
              targetLevel: studentGrowth?.targetLevel ?? null,
              targetTier: studentGrowth?.targetTier ?? null,
              targetSkillEx: studentGrowth?.targetSkillEx ?? null,
              targetSkillNormal: studentGrowth?.targetSkillNormal ?? null,
              targetSkillEnhanced: studentGrowth?.targetSkillEnhanced ?? null,
              targetSkillSub: studentGrowth?.targetSkillSub ?? null,
              targetEquip1: studentGrowth?.targetEquip1 ?? null,
              targetEquip2: studentGrowth?.targetEquip2 ?? null,
              targetEquip3: studentGrowth?.targetEquip3 ?? null,
              targetEquipSpecial: studentGrowth?.targetEquipSpecial ?? null,
            },
          },
        ];
      }),
    );
  }

  if (type === "student_tier") {
    const tiersByStudentUid = await getRecruitedStudentTiers(env, userId);
    return Object.fromEntries(entryKeys.map((entryKey) => [entryKey, tiersByStudentUid[entryKey] ?? 0]));
  }

  return getUserResourceInventoryMapByItemUids(env, userId, entryKeys);
}

function parseDraftEntryFormData(draft: SyncDraft, formData: FormData) {
  const entries: { entryKey: string; value: number }[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const entry of draft.entries) {
    const rawValue = formData.get(`value:${entry.entryKey}`);
    try {
      entries.push({
        entryKey: entry.entryKey,
        value: normalizeSyncDraftEntryValue(draft.type, rawValue),
      });
    } catch (error) {
      fieldErrors[entry.entryKey] = error instanceof Error ? error.message : "입력값을 확인해주세요";
    }
  }

  return { entries, fieldErrors };
}

function parseStudentStateDraftValues(entries: SyncDraftEntry[]): StudentStateProposedValues {
  return Object.fromEntries(
    entries.map((entry) => {
      try {
        return [entry.uid, { value: parseStudentStateDraftValue(entry), error: null }];
      } catch (error) {
        return [
          entry.uid,
          {
            value: null,
            error: error instanceof Error ? error.message : "학생 상태 변경안 데이터를 읽을 수 없어요",
          },
        ];
      }
    }),
  );
}

function toActionIntent(intent: string): ActionData["intent"] {
  if (intent === "save" || intent === "apply" || intent === "discard") {
    return intent;
  }

  return undefined;
}
