import dayjs from "dayjs";
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ButtonForm, FormGroup, InputForm } from "~/components/features/forms";
import { Button } from "~/components/primitives";
import { createConnectApiKey, listConnectApiKeys, revokeConnectApiKey } from "~/models/connect-api-key";

type ActionData =
  | {
      intent: "create";
      createdApiKey: {
        uid: string;
        name: string;
        keyPrefix: string;
        plaintext: string;
      };
      error?: never;
    }
  | {
      intent: "revoke";
      success: true;
      error?: never;
    }
  | {
      intent?: "create" | "revoke";
      error: string;
    };

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  return { apiKeys: await listConnectApiKeys(env, sensei.id) };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    try {
      const createdApiKey = await createConnectApiKey(env, sensei.id, String(formData.get("name") ?? ""));
      return data<ActionData>({
        intent,
        createdApiKey: {
          uid: createdApiKey.uid,
          name: createdApiKey.name,
          keyPrefix: createdApiKey.keyPrefix,
          plaintext: createdApiKey.plaintext,
        },
      });
    } catch (error) {
      return data<ActionData>(
        { intent, error: error instanceof Error ? error.message : "API 키 생성에 실패했어요." },
        { status: 400 },
      );
    }
  }

  if (intent === "revoke") {
    const uid = formData.get("uid");
    if (typeof uid !== "string" || uid.length === 0) {
      return data<ActionData>({ intent, error: "삭제할 API 키를 찾을 수 없어요." }, { status: 400 });
    }

    await revokeConnectApiKey(env, sensei.id, uid);
    return data<ActionData>({ intent, success: true });
  }

  return data<ActionData>({ error: "잘못된 요청이에요. 다시 시도해주세요." }, { status: 400 });
};

function formatRelativePastTime(value: string | null): string {
  if (!value) {
    return "아직 사용 안 함";
  }

  const at = dayjs(value);
  if (!at.isValid()) {
    return "-";
  }

  const now = dayjs();
  const minutes = now.diff(at, "minute");
  if (minutes < 1) {
    return "방금";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = now.diff(at, "hour");
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = now.diff(at, "day");
  if (days < 30) {
    return `${days}일 전`;
  }

  const months = now.diff(at, "month");
  if (months < 12) {
    return `${months}개월 전`;
  }

  return `${now.diff(at, "year")}년 전`;
}

export default function EditConnectIndex() {
  const { apiKeys } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get("intent");
  const isCreating = navigation.state === "submitting" && submittingIntent === "create";
  const revokingUid =
    navigation.state === "submitting" && submittingIntent === "revoke" ? navigation.formData?.get("uid") : null;

  return (
    <div className="space-y-6">
      {actionData?.intent === "create" && "createdApiKey" in actionData ? (
        <section className="space-y-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-950 dark:text-emerald-100">
          <div className="space-y-1">
            <h2 className="font-semibold">새 API 키가 생성됐어요</h2>
            <p className="text-sm">
              전체 키는 지금 한 번만 표시돼요. 사용할 도구에 복사한 뒤 안전한 곳에 보관해주세요.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-emerald-500/20 bg-background p-4 text-foreground md:flex-row md:items-center">
            <code className="min-w-0 flex-1 break-all font-mono text-sm">{actionData.createdApiKey.plaintext}</code>
            <Button
              type="button"
              size="sm"
              variant="tint-blue"
              text="복사"
              onClick={() => navigator.clipboard.writeText(actionData.createdApiKey.plaintext)}
            />
          </div>
        </section>
      ) : null}

      <Form method="post">
        <input type="hidden" name="intent" value="create" />
        <FormGroup>
          <InputForm
            label="새 API 키 이름"
            name="name"
            placeholder="예) OCR 도구"
            description="이름은 나중에 어떤 도구에서 사용하는 키인지 구분하기 위해서만 사용돼요."
            error={actionData?.intent === "create" && "error" in actionData ? actionData.error : undefined}
          />
          <ButtonForm type="submit" label={isCreating ? "생성 중..." : "API 키 생성"} color="blue" />
        </FormGroup>
      </Form>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">등록된 API 키</h2>
          <p className="text-sm text-muted-foreground">삭제된 키는 다시 사용할 수 없어요.</p>
        </div>

        {apiKeys.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            등록된 API 키가 없어요.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {apiKeys.map((apiKey) => (
              <div key={apiKey.uid} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="space-y-1">
                    <p className="font-medium">{apiKey.name}</p>
                    <p className="font-mono text-sm text-muted-foreground">{apiKey.keyPrefix}...</p>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>생성</dt>
                      <dd>{formatRelativePastTime(apiKey.createdAt)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>마지막 사용</dt>
                      <dd>{formatRelativePastTime(apiKey.lastUsedAt)}</dd>
                    </div>
                  </dl>
                </div>
                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (!confirm("이 API 키를 삭제할까요? 연결된 도구는 더 이상 몰루로그에 접근할 수 없어요.")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="revoke" />
                  <input type="hidden" name="uid" value={apiKey.uid} />
                  <Button
                    type="submit"
                    variant="tint-red"
                    size="sm"
                    text={revokingUid === apiKey.uid ? "삭제 중..." : "삭제"}
                    disabled={revokingUid === apiKey.uid}
                  />
                </Form>
              </div>
            ))}
          </div>
        )}

        {actionData?.intent === "revoke" && "error" in actionData ? (
          <p className="text-sm text-destructive">{actionData.error}</p>
        ) : null}
      </section>
    </div>
  );
}
