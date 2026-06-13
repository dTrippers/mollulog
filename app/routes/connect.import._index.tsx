import { ArrowPathIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, Textarea, Title } from "~/components/primitives";
import { parseStudentStateImport } from "~/models/student-state-import";

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

  return null;
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return data<ActionData>({ error: "로그인이 필요해요" }, { status: 401 });
  }

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
          toolName: parsed.format === "schaledb" ? "SchaleDB 가져오기" : "Justin163 가져오기",
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

    return redirect(`/connect/drafts/${body.draftUid}`);
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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isImporting = navigation.state === "submitting";

  return (
    <div className="space-y-6 pb-12">
      <Title
        text="데이터 가져오기"
        description="외부 사이트에서 데이터를 가져오거나 내보낼 수 있어요"
      />

      <Form method="post" className="space-y-4">
        <Textarea
          name="payload"
          label="학생 데이터"
          rows={14}
          defaultValue={actionData?.input}
          placeholder="SchaleDB 또는 Justin163 플래너의 데이터를 붙여넣어주세요"
          error={actionData?.error}
          className="font-mono text-xs leading-5"
        />

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={isImporting}>
            {isImporting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
            {isImporting ? "가져오는 중..." : "가져오기"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
