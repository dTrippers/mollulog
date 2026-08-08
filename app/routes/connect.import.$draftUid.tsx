import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import {
  mergeStudentStateDraftValueForUpdate,
  parseStudentStateDraftValue,
  type StudentStateDraftCurrentValue,
  type StudentStateDraftTargetValue,
  studentStateCurrentFields,
  studentStateTargetFields,
} from "~/domain/student-state";
import { routeError } from "~/lib/http-errors";
import { getStudentGearData } from "~/models/growth-resource";
import { getItemCatalogResourceMap } from "~/models/item-catalog";
import { getRecruitedStudents, getRecruitedStudentTiers } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import { getStudentGrowths } from "~/models/student-growth";
import {
  applySyncDraft,
  discardSyncDraft,
  getSyncDraft,
  normalizeSyncDraftEntryValue,
  type SyncDraft,
  type SyncDraftEntry,
  type SyncDraftEntryUpdateInput,
  type SyncDraftType,
  updateSyncDraftEntries,
} from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import type { SyncDraftDisplayMetadata, SyncDraftReviewActionData } from "./connect.import._components/DraftReviewView";
import StudentStateDraftReview, {
  type StudentStateCurrentValues,
  type StudentStateProposedValues,
} from "./connect.import._components/StudentStateDraftReview";
import SyncDraftReview from "./connect.import._components/SyncDraftReview";

type ActionData = SyncDraftReviewActionData;

export const meta: MetaFunction = () => [{ title: "가져온 데이터 검토 | 몰루로그" }];

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
  const { env } = context.cloudflare;
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
    if (intent === "apply") {
      const draft = await getSyncDraft(env, currentUser.id, draftUid);
      if (!draft) {
        return data<ActionData>({ intent, error: "변경안을 찾을 수 없어요" }, { status: 404 });
      }
      if (draft.status !== "pending") {
        return data<ActionData>({ intent, error: "이미 처리된 변경안이에요" }, { status: 400 });
      }
      const parsedForm =
        draft.type === "student_state"
          ? parseStudentStateDraftFormData(draft, formData)
          : parseDraftEntryFormData(draft, formData);
      const { fieldErrors } = parsedForm;
      if (Object.keys(fieldErrors).length > 0) {
        return data<ActionData>({ intent, error: "입력값을 확인해주세요.", fieldErrors }, { status: 400 });
      }

      const entries =
        draft.type === "student_state"
          ? await mergeStudentStateDraftFormEntries(env, currentUser.id, draft, parsedForm.entries)
          : parsedForm.entries;

      await updateSyncDraftEntries(env, currentUser.id, draftUid, entries);

      await applySyncDraft(env, currentUser.id, draftUid);
      return redirect("/connect/import");
    }

    if (intent === "discard") {
      await discardSyncDraft(env, currentUser.id, draftUid);
      return redirect("/connect/import");
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

  const review =
    draft.type === "student_state" ? (
      <StudentStateDraftReview
        draft={draft}
        metadataByKey={metadataByKey}
        currentValues={currentValues as StudentStateCurrentValues}
        proposedValues={proposedStudentStateValues as StudentStateProposedValues}
        actionData={actionData}
      />
    ) : (
      <SyncDraftReview
        draft={draft}
        metadataByKey={metadataByKey}
        currentValues={currentValues as Record<string, number>}
        actionData={actionData}
      />
    );

  return (
    <Page
      title="가져온 데이터 검토"
      description="가져온 데이터를 확인하고 잘못된 값을 수정하여 반영할 수 있어요"
      backward={{ title: "데이터 가져오기", to: "/connect/import" }}
      contentWidth="full"
      layout="vertical"
    >
      {review}
    </Page>
  );
}

async function loadDraftMetadata(env: Env, draft: SyncDraft): Promise<Record<string, SyncDraftDisplayMetadata>> {
  if (draft.type === "student_tier" || draft.type === "student_state") {
    const studentsByUid = await getAllStudentsMap(env);
    const gearDataByUid =
      draft.type === "student_state"
        ? await getStudentGearData(
            env,
            draft.entries.map((entry) => entry.entryKey),
          )
        : new Map<string, null>();
    return Object.fromEntries(
      draft.entries.flatMap((entry) => {
        const student = studentsByUid[entry.entryKey];
        if (!student) {
          return [];
        }

        return [
          [
            entry.entryKey,
            {
              label: student.name,
              studentUid: entry.entryKey,
              equipments: student.equipments,
              hasGear: gearDataByUid.get(entry.entryKey) != null,
              initialTier: student.initialTier,
            },
          ],
        ];
      }),
    );
  }

  const resourcesByUid = await getItemCatalogResourceMap(env);
  return Object.fromEntries(
    draft.entries.flatMap((entry) => {
      const resource = resourcesByUid[entry.entryKey];
      if (!resource) {
        return [];
      }

      return [
        [
          entry.entryKey,
          {
            label: resource.name,
            item: resource,
          },
        ],
      ];
    }),
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
    const studentGrowthsByUid = Object.fromEntries(studentGrowths.map((growth) => [growth.studentUid, growth]));

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
              targetBond: relationshipLevel?.targetLevel ?? null,
              targetLevel: studentGrowth?.targetLevel ?? null,
              targetTier: studentGrowth?.targetTier ?? null,
              targetWeaponLevel: studentGrowth?.targetWeaponLevel ?? null,
              targetSkillEx: studentGrowth?.targetSkillEx ?? null,
              targetSkillNormal: studentGrowth?.targetSkillNormal ?? null,
              targetSkillEnhanced: studentGrowth?.targetSkillEnhanced ?? null,
              targetSkillSub: studentGrowth?.targetSkillSub ?? null,
              targetEquip1: studentGrowth?.targetEquip1 ?? null,
              targetEquip2: studentGrowth?.targetEquip2 ?? null,
              targetEquip3: studentGrowth?.targetEquip3 ?? null,
              targetEquipSpecial: studentGrowth?.targetEquipSpecial ?? null,
              targetAbilityHp: studentGrowth?.targetAbilityHp ?? null,
              targetAbilityAtk: studentGrowth?.targetAbilityAtk ?? null,
              targetAbilityHeal: studentGrowth?.targetAbilityHeal ?? null,
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
  const entries: SyncDraftEntryUpdateInput[] = [];
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

const studentStateCurrentDraftFields = [
  ...studentStateCurrentFields.map((field) => field.key),
] as const satisfies readonly (keyof StudentStateDraftCurrentValue)[];

const studentStateTargetDraftFields = [
  ...studentStateTargetFields.map((field) => field.key),
] as const satisfies readonly (keyof StudentStateDraftTargetValue)[];

function parseStudentStateDraftFormData(draft: SyncDraft, formData: FormData) {
  const entries: SyncDraftEntryUpdateInput[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const entry of draft.entries) {
    try {
      const current = parseStudentStateSectionFlag(formData, `studentState:${entry.uid}:hasCurrent`)
        ? Object.fromEntries(
            studentStateCurrentDraftFields.map((field) => [
              field,
              parseStudentStateFormValue(formData, `studentState:${entry.uid}:current:${field}`),
            ]),
          )
        : null;
      const target = parseStudentStateSectionFlag(formData, `studentState:${entry.uid}:hasTarget`)
        ? Object.fromEntries(
            studentStateTargetDraftFields.map((field) => [
              field,
              parseStudentStateFormValue(formData, `studentState:${entry.uid}:target:${field}`),
            ]),
          )
        : null;
      const valueJson = JSON.stringify({ current, target });
      const value = Number(current?.tier ?? target?.targetTier ?? 1);

      parseStudentStateDraftValue({ value, valueJson });
      entries.push({ entryKey: entry.entryKey, value, valueJson });
    } catch (error) {
      fieldErrors[entry.entryKey] = error instanceof Error ? error.message : "입력값을 확인해주세요";
    }
  }

  return { entries, fieldErrors };
}

function parseStudentStateFormValue(formData: FormData, name: string): number | null {
  const rawValue = formData.get(name);
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return null;
  }

  return Number(rawValue);
}

function parseStudentStateSectionFlag(formData: FormData, name: string): boolean {
  return formData.get(name) === "1";
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

async function mergeStudentStateDraftFormEntries(
  env: Env,
  userId: number,
  draft: SyncDraft,
  entries: SyncDraftEntryUpdateInput[],
): Promise<SyncDraftEntryUpdateInput[]> {
  const [metadataByKey, currentValues] = await Promise.all([
    loadDraftMetadata(env, draft),
    loadCurrentValues(
      env,
      userId,
      draft.type,
      draft.entries.map((entry) => entry.entryKey),
    ),
  ]);
  const currentStateValues = currentValues as StudentStateCurrentValues;

  return entries.map((entry) => {
    const draftValue = parseStudentStateDraftValue({
      value: Number(entry.value),
      valueJson: entry.valueJson ?? null,
    });
    const metadata = metadataByKey[entry.entryKey];
    const mergedValue = mergeStudentStateDraftValueForUpdate(
      draftValue,
      currentStateValues[entry.entryKey] ?? emptyStudentStateValue(),
      {
        initialTier: metadata?.initialTier ?? 1,
        hasGear: metadata?.hasGear ?? true,
      },
    );

    return {
      entryKey: entry.entryKey,
      value: mergedValue.current?.tier ?? mergedValue.target?.targetTier ?? 1,
      valueJson: JSON.stringify(mergedValue),
    };
  });
}

function emptyStudentStateValue(): StudentStateCurrentValues[string] {
  return {
    current: {
      level: null,
      tier: null,
      weaponLevel: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
      bond: null,
    },
    target: {
      targetBond: null,
      targetLevel: null,
      targetTier: null,
      targetWeaponLevel: null,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: null,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
      targetAbilityHp: null,
      targetAbilityAtk: null,
      targetAbilityHeal: null,
    },
  };
}

function toActionIntent(intent: string): ActionData["intent"] {
  if (intent === "apply" || intent === "discard") {
    return intent;
  }

  return undefined;
}
