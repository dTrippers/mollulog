import { ArrowPathIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  isStudentStateMaintenanceResult,
  StudentStateMaintenanceToast,
} from "~/components/features/student-state/StudentStateMaintenanceToast";
import { Button, SubTitle, Textarea } from "~/components/primitives";
import { parseStudentStateImport } from "~/domain/student-state-serialization";
import { studentStateMaintenanceActionResult } from "~/lib/student-state-cutover.server";
import { getSyncDraftEntryCounts, listPendingSyncDrafts } from "~/models/sync-draft";
import ConnectDataPage from "./connect._components/ConnectDataPage";
import PendingSyncDraftList from "./connect._components/PendingSyncDraftList";

type ActionData = {
  error?: string;
  input?: string;
  importedCount?: number;
};

type ConnectDraftCreateResponse = {
  draftUid?: unknown;
  error?: {
    message?: unknown;
  };
};

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
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const maintenance = await studentStateMaintenanceActionResult(env, { ctx, operation: "connect.import.index.action" });
  if (maintenance) return maintenance;

  const formData = await request.formData();
  const input = String(formData.get("payload") ?? "");

  try {
    const apiUrl = env.CONNECT_API_URL ?? "http://localhost:8787";
    const internalToken = env.CONNECT_INTERNAL_TOKEN;
    if (!internalToken) {
      throw new Error("데이터 가져오기 설정이 아직 완료되지 않았어요.");
    }

    const parsed = parseStudentStateImport(input);
    const response = await fetch(new URL("/api/v1/drafts", apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Connect-Internal-Token": internalToken,
        "X-Connect-User-Id": String(sensei.id),
      },
      body: JSON.stringify({
        type: "student_state",
        source: {
          toolName: parsed.format === "schaledb" ? "SchaleDB 데이터 가져오기" : "Justin163 데이터 가져오기",
        },
        entries: parsed.entries,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json().catch(() => ({}))) as ConnectDraftCreateResponse;

    if (!response.ok) {
      throw new Error(typeof body.error?.message === "string" ? body.error.message : "변경안 생성에 실패했어요.");
    }

    if (typeof body.draftUid !== "string" || body.draftUid.length === 0) {
      throw new Error("변경안 응답을 확인할 수 없어요.");
    }

    return redirect(`/connect/import/${body.draftUid}`);
  } catch (error) {
    const isTimeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return data<ActionData>(
      {
        error: isTimeout
          ? "연동 서버 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요."
          : error instanceof Error
            ? error.message
            : "데이터를 가져오지 못했어요.",
        input,
      },
      { status: 400 },
    );
  }
};

export default function ConnectImportIndexPage() {
  const { drafts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const formActionData = isStudentStateMaintenanceResult(actionData) ? undefined : actionData;
  const navigation = useNavigation();
  const isImporting = navigation.state === "submitting";

  return (
    <ConnectDataPage currentScreen="import" pendingDraftCount={drafts.length}>
      <StudentStateMaintenanceToast trigger={actionData} />
      <div className="space-y-8 pb-12">
        <section>
          <SubTitle text="데이터 가져오기" description="현재 SchaleDB와 Justin163 플래너를 지원해요" />
          <Form method="post" className="space-y-4">
            <Textarea
              name="payload"
              rows={14}
              defaultValue={formActionData?.input}
              placeholder="SchaleDB 또는 Justin163 플래너에서 내보낸 데이터를 이곳에 입력해주세요"
              error={formActionData?.error}
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
