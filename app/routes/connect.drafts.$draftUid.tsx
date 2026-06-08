import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { routeError } from "~/lib/http-errors";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudentsMap } from "~/models/student";
import {
  type SyncDraft,
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

  return { draft, metadataByKey, currentValues };
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

      const { entries, fieldErrors } = parseDraftEntryFormData(draft, formData);
      if (Object.keys(fieldErrors).length > 0) {
        return data<ActionData>({ intent, error: "입력값을 확인해주세요.", fieldErrors }, { status: 400 });
      }

      await updateSyncDraftEntries(env, currentUser.id, draftUid, entries);

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
  const { draft, metadataByKey, currentValues } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <SyncDraftReview
      draft={draft}
      metadataByKey={metadataByKey}
      currentValues={currentValues}
      actionData={actionData}
    />
  );
}

async function loadDraftMetadata(env: Env, draft: SyncDraft): Promise<Record<string, SyncDraftDisplayMetadata>> {
  if (draft.type === "student_tier") {
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
): Promise<Record<string, number>> {
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

function toActionIntent(intent: string): ActionData["intent"] {
  if (intent === "save" || intent === "apply" || intent === "discard") {
    return intent;
  }

  return undefined;
}
