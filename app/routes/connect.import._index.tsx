import { ArrowPathIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { useV2Page } from "~/components/v2/layout/V2Page";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { serializeStudentStateDraftValue } from "~/domain/student-state";
import { parseStudentStateImport } from "~/domain/student-state-serialization";
import { getLogger } from "~/lib/observability.server";
import { cn } from "~/lib/utils";
import { getAllStudentsMap } from "~/models/student";
import {
  createSyncDraft,
  getSyncDraftEntryCounts,
  listPendingSyncDrafts,
  SyncDraftPersistenceError,
} from "~/models/sync-draft";
import { ConnectScreenLayout } from "./connect._components/connect-navigation";
import PendingSyncDraftList from "./connect._components/PendingSyncDraftList";

type ActionData = {
  error?: string;
  input?: string;
};

const MAX_IMPORT_STUDENT_ENTRIES = 5000;
const IMPORT_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GENERIC_IMPORT_ERROR = "데이터를 가져오지 못했어요. 잠시 후 다시 시도해주세요.";

const PLACEHOLDER_STACKED = "SchaleDB 또는 Justin163 플래너에서 내보낸 데이터를 이곳에 입력해주세요";
const PLACEHOLDER_WIDE = '{"characters":[{"id":10145,"star":3,"level":1,...}],"owned":{...}}';

export const meta: MetaFunction = () => [{ title: "데이터 가져오기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const drafts = await listPendingSyncDrafts(env, sensei.id);
  const entryCounts = await getSyncDraftEntryCounts(
    env,
    drafts.map((draft) => draft.uid),
  );
  const draftsWithEntryCounts = drafts.map((draft) => ({
    ...draft,
    entryCount: entryCounts[draft.uid] ?? 0,
  }));

  return { drafts: draftsWithEntryCounts };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "connect.import" });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const formData = await request.formData();
  const input = String(formData.get("payload") ?? "");
  const formError = (error: string) => data<ActionData>({ error, input }, { status: 400 });

  // Parsing and the import limits are pure user-input validation; every error
  // they produce is a user-facing message that names no ids.
  let parsed: ReturnType<typeof parseStudentStateImport>;
  try {
    parsed = parseStudentStateImport(input);
  } catch (error) {
    return formError(error instanceof Error ? error.message : GENERIC_IMPORT_ERROR);
  }
  if (parsed.entries.length > MAX_IMPORT_STUDENT_ENTRIES) {
    return formError(
      `한 번에 최대 ${MAX_IMPORT_STUDENT_ENTRIES.toLocaleString("ko-KR")}명의 학생 데이터만 가져올 수 있어요.`,
    );
  }

  // The student catalog lookup hits the cache/PostgreSQL layer, so its failures
  // are infrastructure failures and must not reach the user verbatim.
  let studentUids: Set<string>;
  try {
    studentUids = new Set(Object.keys(await getAllStudentsMap(env, true)));
  } catch (error) {
    logger.error("connect import student catalog lookup failed", error);
    return formError(GENERIC_IMPORT_ERROR);
  }

  const unknownStudentIds = parsed.entries.flatMap((entry) =>
    studentUids.has(entry.studentId) ? [] : [entry.studentId],
  );
  if (unknownStudentIds.length > 0) {
    return formError(
      `데이터를 가져오지 못했어요. 몰루로그에서 찾을 수 없는 학생 ${unknownStudentIds.length.toLocaleString("ko-KR")}명이 들어 있어요.`,
    );
  }

  const entries = parsed.entries.map((entry) => {
    const value = Number(entry.current?.tier ?? entry.target?.targetTier ?? 1);
    const valueJson = serializeStudentStateDraftValue(entry);
    return { entryKey: entry.studentId, value, valueJson };
  });

  // createSyncDraft reports validation failures as plain errors (safe to show)
  // and unexpected persistence failures as SyncDraftPersistenceError.
  let draftUid: string;
  try {
    draftUid = await createSyncDraft(env, sensei.id, {
      source: "web",
      type: "student_state",
      toolName: parsed.format === "schaledb" ? "SchaleDB 데이터 가져오기" : "Justin163 데이터 가져오기",
      expiresAt: new Date(Date.now() + IMPORT_DRAFT_TTL_MS).toISOString(),
      entries,
    });
  } catch (error) {
    if (error instanceof SyncDraftPersistenceError) {
      logger.error("connect import draft persistence failed", error.cause);
      return formError(GENERIC_IMPORT_ERROR);
    }
    return formError(error instanceof Error ? error.message : GENERIC_IMPORT_ERROR);
  }

  return redirect(`/connect/import/${draftUid}`);
};

export default function ConnectImportIndexPage() {
  const { drafts } = useLoaderData<typeof loader>();

  return (
    <ConnectScreenLayout
      current="import"
      title="데이터 가져오기"
      description="현재 SchaleDB와 Justin163 플래너를 지원해요"
    >
      <div className="flex flex-col gap-8">
        <ImportForm />
        <section aria-labelledby="pending-drafts-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="pending-drafts-heading" className="text-base font-semibold text-v2-fg">
              검토 대상 데이터 목록
            </h2>
            <p className="mt-1 text-sm text-v2-fg-secondary">가져온 데이터를 검토한 후 내 프로필에 반영할 수 있어요.</p>
          </div>
          <PendingSyncDraftList drafts={drafts} />
        </section>
      </div>
    </ConnectScreenLayout>
  );
}

function ImportForm() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { stacked } = useV2Page();
  const isImporting = navigation.state === "submitting";
  const errorId = "import-payload-error";

  return (
    <Form method="post" className="flex flex-col gap-3 rounded-lg bg-v2-surface p-v2-block-p">
      <textarea
        name="payload"
        aria-label="가져올 데이터"
        rows={6}
        defaultValue={actionData?.input}
        placeholder={stacked ? PLACEHOLDER_STACKED : PLACEHOLDER_WIDE}
        aria-invalid={actionData?.error ? true : undefined}
        aria-describedby={actionData?.error ? errorId : undefined}
        className={cn(
          "min-h-32 w-full resize-y rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 font-mono text-sm text-v2-fg placeholder:text-v2-fg-tertiary focus:border-v2-control-border-strong aria-invalid:border-v2-danger aria-invalid:ring-1 aria-invalid:ring-v2-danger",
          v2FocusRing,
        )}
      />
      {actionData?.error ? (
        <div id={errorId}>
          <StatusNotice tone="danger">{actionData.error}</StatusNotice>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isImporting}>
          {isImporting ? <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isImporting ? "처리 중…" : "가져오기"}
        </Button>
      </div>
    </Form>
  );
}
