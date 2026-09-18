import { ArrowPathIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, SubTitle, Textarea } from "~/components/primitives";
import { parseStudentStateImport } from "~/domain/student-state-serialization";
import { getAllStudentsMap } from "~/models/student";
import {
  SyncDraftPersistenceError,
  createSyncDraft,
  getSyncDraftEntryCounts,
  listPendingSyncDrafts,
} from "~/models/sync-draft";
import { getLogger } from "~/lib/observability.server";
import ConnectDataPage from "./connect._components/ConnectDataPage";
import PendingSyncDraftList from "./connect._components/PendingSyncDraftList";

type ActionData = {
  error?: string;
  input?: string;
  importedCount?: number;
};

const MAX_IMPORT_STUDENT_ENTRIES = 5000;
const IMPORT_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GENERIC_IMPORT_ERROR = "데이터를 가져오지 못했어요.";

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
  // they produce is a user-facing message.
  let parsed: ReturnType<typeof parseStudentStateImport>;
  try {
    parsed = parseStudentStateImport(input);
  } catch (error) {
    return formError(error instanceof Error ? error.message : GENERIC_IMPORT_ERROR);
  }
  if (parsed.entries.length > MAX_IMPORT_STUDENT_ENTRIES) {
    return formError(
      `한 번에 최대 ${MAX_IMPORT_STUDENT_ENTRIES.toLocaleString()}명의 학생 데이터만 가져올 수 있어요.`,
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
    return formError(`다음 학생을 현재 학생 목록에서 찾을 수 없어요: ${unknownStudentIds.join(", ")}`);
  }

  const entries = parsed.entries.map((entry) => {
    const value = Number(entry.current?.tier ?? entry.target?.targetTier ?? 1);
    const valueJson = JSON.stringify({ current: entry.current, target: entry.target });
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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isImporting = navigation.state === "submitting";

  return (
    <ConnectDataPage currentScreen="import" pendingDraftCount={drafts.length}>
      <div className="space-y-8 pb-12">
        <section>
          <SubTitle text="데이터 가져오기" description="현재 SchaleDB와 Justin163 플래너를 지원해요" />
          <Form method="post" className="space-y-4">
            <Textarea
              name="payload"
              rows={14}
              defaultValue={actionData?.input}
              placeholder="SchaleDB 또는 Justin163 플래너에서 내보낸 데이터를 이곳에 입력해주세요"
              error={actionData?.error}
            />

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={isImporting}>
                {isImporting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
                {isImporting ? "처리중..." : "가져오기"}
              </Button>
            </div>
          </Form>
        </section>

        <section>
          <SubTitle
            text="검토 대상 데이터 목록"
            description="가져온 데이터를 검토한 후 내 프로필에 반영할 수 있어요."
          />
          <PendingSyncDraftList drafts={drafts} />
        </section>
      </div>
    </ConnectDataPage>
  );
}
