import { ArchiveBoxIcon, CheckCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, redirect, useActionData, useLoaderData, useRevalidator, useRouteError } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import {
  parseStudentStateDraftValue,
  type StudentStateDraftCurrentValue,
  type StudentStateDraftTargetValue,
  type StudentStateDraftValue,
  serializeStudentStateDraftValue,
  setStudentStateDraftFieldPresence,
  studentStateCurrentFields,
  studentStateTargetFields,
} from "~/domain/student-state";
import {
  isStaleStudentStateRequestError,
  STUDENT_STATE_STALE_MESSAGE,
  StudentStateMergeConflictError,
} from "~/domain/student-state-errors";
import { createAnalyticsEventsCookie } from "~/lib/analytics-redirect.server";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import { cn } from "~/lib/utils";
import { getStudentGearData } from "~/models/growth-resource";
import { getItemCatalogResourceMap } from "~/models/item-catalog";
import { getRecruitedStudents, getRecruitedStudentTiers } from "~/models/recruited-student";
import { getRelationshipLevels, getStudentStateWriteMode } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import { getStudentGrowths } from "~/models/student-growth";
import {
  applySyncDraft,
  discardSyncDraft,
  getSyncDraft,
  normalizeSyncDraftEntryValue,
  type SyncDraft,
  SyncDraftAlreadyProcessedError,
  type SyncDraftEntry,
  type SyncDraftEntryUpdateInput,
  SyncDraftNotFoundError,
  SyncDraftSelectionError,
  type SyncDraftStudentStateMetadata,
  type SyncDraftType,
} from "~/models/sync-draft";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
import { ConnectStateMessage } from "./connect._components/ConnectStateMessage";
import { ConnectScreenLayout } from "./connect._components/connect-navigation";
import { draftStatusLabel, formatDraftTimestamp, syncDraftTypeLabel } from "./connect._components/sync-draft-labels";
import type { SyncDraftDisplayMetadata, SyncDraftReviewActionData } from "./connect.import._components/review-types";
import StudentStateDraftReview, {
  type StudentStateCurrentValues,
  type StudentStateProposedValues,
} from "./connect.import._components/StudentStateDraftReview";
import SyncDraftReview from "./connect.import._components/SyncDraftReview";

type ActionData = SyncDraftReviewActionData;

export const meta: MetaFunction = () => [{ title: "가져온 데이터 검토 | 몰루로그" }];

const DRAFT_NOT_FOUND_MESSAGE = "가져온 데이터를 찾을 수 없어요";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const draftUid = params.draftUid;
  if (!draftUid) {
    throw routeError(404, "sync_draft.not_found", DRAFT_NOT_FOUND_MESSAGE);
  }

  const draft = await getSyncDraft(env, currentUser.id, draftUid);
  if (!draft) {
    throw routeError(404, "sync_draft.not_found", DRAFT_NOT_FOUND_MESSAGE);
  }

  // An applied or deleted draft only shows its state, so it needs none of the review's data.
  if (draft.status !== "pending") {
    return {
      draft,
      metadataByKey: {} as Record<string, SyncDraftDisplayMetadata>,
      currentValues: {} as Record<string, number> | StudentStateCurrentValues,
      proposedStudentStateValues: undefined as StudentStateProposedValues | undefined,
      writeMode: "legacy" as "legacy" | "nullable",
    };
  }

  const entryKeys = draft.entries.map((entry) => entry.entryKey);
  const [metadataByKey, currentValues, writeMode] = await Promise.all([
    loadDraftMetadata(env, draft),
    loadCurrentValues(env, currentUser.id, draft.type, entryKeys),
    draft.type === "student_state" ? getStudentStateWriteMode(env) : Promise.resolve("legacy" as const),
  ]);
  const proposedStudentStateValues =
    draft.type === "student_state" ? parseStudentStateDraftValues(draft.entries) : undefined;

  return { draft, metadataByKey, currentValues, proposedStudentStateValues, writeMode };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "connect.import.draft" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<ActionData>({ code: "unauthorized" }, { status: 401 });
  }

  const draftUid = params.draftUid;
  if (!draftUid) {
    return data<ActionData>({ code: "not_found" }, { status: 404 });
  }

  const formData = await request.formData();
  const rawIntent = formData.get("intent");
  const intent = rawIntent === "apply" || rawIntent === "discard" ? rawIntent : undefined;

  try {
    if (intent === "apply") {
      const draft = await getSyncDraft(env, currentUser.id, draftUid);
      if (!draft) {
        return data<ActionData>({ intent, code: "not_found" }, { status: 404 });
      }
      if (draft.status !== "pending") {
        return data<ActionData>({ intent, code: "already_processed" }, { status: 409 });
      }
      // The form submits the students (or items) the user kept selected. Only they are applied; the others are
      // discarded together with the rest of the draft.
      const selectedEntryKeys = parseSelectedEntryKeys(formData);
      const selection = new Set(selectedEntryKeys);
      const parsedForm =
        draft.type === "student_state"
          ? parseStudentStateDraftFormData(draft, formData, selection)
          : parseDraftEntryFormData(draft, formData, selection);
      const { fieldErrors } = parsedForm;
      if (Object.keys(fieldErrors).length > 0) {
        return data<ActionData>({ intent, code: "invalid_input", fieldErrors }, { status: 400 });
      }

      const metadataByKey =
        draft.type === "student_state" ? toStudentStateApplyMetadata(await loadDraftMetadata(env, draft)) : undefined;
      await applySyncDraft(env, currentUser.id, draftUid, {
        entryUpdates: parsedForm.entries,
        selectedEntryKeys,
        mergeReviewedStudentState: draft.type === "student_state",
        studentStateMetadataByKey: metadataByKey,
        studentStateRequestMode: draft.type === "student_state" ? parseStudentStateRequestMode(formData) : null,
      });
      if (draft.type !== "student_state") return redirect("/connect/import");
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        createAnalyticsEventsCookie(request.url, [
          { eventName: "student_state_saved", parameters: { source: "connect_import", scope: "bulk" } },
        ]),
      );
      return redirect("/connect/import", { headers });
    }

    if (intent === "discard") {
      await discardSyncDraft(env, currentUser.id, draftUid);
      return redirect("/connect/import");
    }

    return data<ActionData>({ code: "unsupported" }, { status: 400 });
  } catch (error) {
    if (error instanceof SyncDraftNotFoundError) {
      return data<ActionData>({ intent, code: "not_found" }, { status: 404 });
    }
    if (error instanceof SyncDraftAlreadyProcessedError) {
      return data<ActionData>({ intent, code: "already_processed" }, { status: 409 });
    }
    if (error instanceof SyncDraftSelectionError) {
      return data<ActionData>({ intent, code: "invalid_selection", error: error.message }, { status: 400 });
    }
    if (isStaleStudentStateRequestError(error)) {
      return data<ActionData>({ intent, code: "conflict", error: STUDENT_STATE_STALE_MESSAGE }, { status: 409 });
    }
    if (error instanceof StudentStateMergeConflictError) {
      return data<ActionData>({ intent, code: "conflict", error: error.message }, { status: 409 });
    }
    // Anything else is an unexpected failure: it is logged, and the screen words it.
    logger.error("connect import draft action failed", error);
    return data<ActionData>(
      { intent, code: intent === "discard" ? "discard_failed" : "apply_failed" },
      { status: 500 },
    );
  }
};

function parseSelectedEntryKeys(formData: FormData): string[] {
  return formData.getAll("selected").flatMap((value) => (typeof value === "string" ? [value] : []));
}

export default function ConnectDraftDetailPage() {
  const { draft, metadataByKey, currentValues, proposedStudentStateValues, writeMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const pinnedReviewMode = useRef<{ draftUid: string; mode: "legacy" | "nullable" } | null>(null);
  if (pinnedReviewMode.current?.draftUid !== draft.uid) {
    pinnedReviewMode.current = { draftUid: draft.uid, mode: writeMode };
  }
  const reviewMode = pinnedReviewMode.current.mode;

  const review =
    draft.status !== "pending" ? (
      <ProcessedDraftState draft={draft} />
    ) : draft.type === "student_state" ? (
      <StudentStateDraftReview
        draft={draft}
        metadataByKey={metadataByKey}
        currentValues={currentValues as StudentStateCurrentValues}
        proposedValues={proposedStudentStateValues as StudentStateProposedValues}
        writeMode={reviewMode}
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
    <ConnectScreenLayout
      current="import"
      title="가져온 데이터 검토"
      description="가져온 데이터를 확인하고 잘못된 값을 수정하여 반영할 수 있어요"
      back={{ title: "데이터 가져오기", to: "/connect/import" }}
      meta={<DraftMeta draft={draft} />}
    >
      {review}
    </ConnectScreenLayout>
  );
}

function DraftMeta({ draft }: { draft: SyncDraft }) {
  const source = draft.toolName ?? syncDraftTypeLabel(draft.type);
  const timestamp = formatDraftTimestamp(draft.createdAt);
  return (
    <>
      <span>{timestamp ? `${source} · ${timestamp}` : source}</span>
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-xs font-semibold",
          draft.status === "applied"
            ? "bg-v2-success-subtle text-v2-success"
            : draft.status === "pending"
              ? "bg-v2-accent-subtle text-v2-accent"
              : "bg-v2-inset text-v2-fg-secondary",
        )}
      >
        {draftStatusLabel(draft.status)}
      </span>
    </>
  );
}

// An applied, deleted or expired draft is read-only: the state replaces the review, and nothing can be applied again.
function ProcessedDraftState({ draft }: { draft: SyncDraft }) {
  const isStudentData = draft.type !== "item_inventory";
  const content =
    draft.status === "applied"
      ? {
          Icon: CheckCircleIcon,
          title: "반영됨",
          description: [
            "이미 프로필에 반영한 데이터라 다시 반영할 수 없어요.",
            isStudentData ? "지금 값은 모집한 학생에서 확인할 수 있어요." : null,
          ],
        }
      : draft.status === "discarded"
        ? {
            Icon: TrashIcon,
            title: "삭제됨",
            description: ["이미 삭제한 데이터라 반영할 수 없어요.", "반영하려면 데이터를 새로 가져와주세요."],
          }
        : {
            Icon: ArchiveBoxIcon,
            title: "만료됨",
            description: ["기간이 지난 데이터라 반영할 수 없어요.", "반영하려면 데이터를 새로 가져와주세요."],
          };
  return (
    <div className="rounded-lg bg-v2-surface">
      <ConnectStateMessage
        Icon={content.Icon}
        title={content.title}
        description={content.description.filter(Boolean).join("\n")}
      />
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const normalized = normalizeRouteError(error);

  return (
    <ConnectScreenLayout
      current="import"
      title="가져온 데이터 검토"
      back={{ title: "데이터 가져오기", to: "/connect/import" }}
    >
      {isServerRouteError(normalized) ? (
        <LoadFailureState title="가져온 데이터를 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />
      ) : (
        <div className="rounded-lg bg-v2-surface">
          <ConnectStateMessage
            Icon={ArchiveBoxIcon}
            title={DRAFT_NOT_FOUND_MESSAGE}
            description="주소가 잘못되었거나 다른 계정의 데이터일 수 있어요."
            action={
              <Link to="/connect/import" className={v2ButtonClassName({ variant: "secondary" })}>
                데이터 가져오기로 돌아가기
              </Link>
            }
          />
        </div>
      )}
    </ConnectScreenLayout>
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

function parseDraftEntryFormData(draft: SyncDraft, formData: FormData, selection?: ReadonlySet<string>) {
  const entries: SyncDraftEntryUpdateInput[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const entry of draft.entries) {
    if (selection && !selection.has(entry.entryKey)) continue;
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

/**
 * Reads the review form's values. With a selection, only those entries are read: the others are not applied, so
 * their values are neither parsed nor validated.
 */
export function parseStudentStateDraftFormData(draft: SyncDraft, formData: FormData, selection?: ReadonlySet<string>) {
  const entries: SyncDraftEntryUpdateInput[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const entry of draft.entries) {
    if (selection && !selection.has(entry.entryKey)) continue;
    try {
      const currentSection = parseStudentStateSection(
        formData,
        `studentState:${entry.uid}:hasCurrent`,
        `studentState:${entry.uid}:current:providedFields`,
        studentStateCurrentDraftFields,
        `studentState:${entry.uid}:current`,
      );
      const targetSection = parseStudentStateSection(
        formData,
        `studentState:${entry.uid}:hasTarget`,
        `studentState:${entry.uid}:target:providedFields`,
        studentStateTargetDraftFields,
        `studentState:${entry.uid}:target`,
      );
      const current = currentSection.enabled
        ? Object.fromEntries(
            studentStateCurrentDraftFields.map((field) => [
              field,
              parseStudentStateFormValue(formData, `studentState:${entry.uid}:current:${field}`),
            ]),
          )
        : null;
      const target = targetSection.enabled
        ? Object.fromEntries(
            studentStateTargetDraftFields.map((field) => [
              field,
              parseStudentStateFormValue(formData, `studentState:${entry.uid}:target:${field}`),
            ]),
          )
        : null;
      const draftValue = setStudentStateDraftFieldPresence({ current, target } as StudentStateDraftValue, {
        current: current ? currentSection.providedFields : [],
        target: target ? targetSection.providedFields : [],
      });
      const valueJson = serializeStudentStateDraftValue(draftValue);
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

/** A review form without the field was rendered before nullable semantics existed. */
export function parseStudentStateRequestMode(formData: FormData): "legacy" | "nullable" {
  return formData.get("stateFormat") === "nullable" ? "nullable" : "legacy";
}

function parseStudentStateSection(
  formData: FormData,
  enabledName: string,
  providedFieldsName: string,
  fields: readonly string[],
  valuePrefix: string,
): { enabled: boolean; providedFields: string[] } {
  if (formData.get(enabledName) !== "1") return { enabled: false, providedFields: [] };
  if (!formData.has(providedFieldsName)) {
    return {
      enabled: true,
      providedFields: fields.filter((field) => parseStudentStateFormValue(formData, `${valuePrefix}:${field}`) != null),
    };
  }
  const encodedFields = formData.get(providedFieldsName);
  return {
    enabled: true,
    providedFields:
      typeof encodedFields === "string" ? encodedFields.split(",").filter((field) => fields.includes(field)) : [],
  };
}

function toStudentStateApplyMetadata(
  metadataByKey: Record<string, SyncDraftDisplayMetadata>,
): Record<string, SyncDraftStudentStateMetadata> {
  return Object.fromEntries(
    Object.entries(metadataByKey).map(([studentUid, metadata]) => [
      studentUid,
      { initialTier: metadata.initialTier ?? 1, hasGear: metadata.hasGear ?? true },
    ]),
  );
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
