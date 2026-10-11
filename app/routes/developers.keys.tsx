import { ExclamationTriangleIcon, KeyIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, Callout, Checkbox, EmptyView, Input, Section, SectionCard, SubTitle } from "~/components/primitives";
import { type ApiFieldError, ApiInputError } from "~/domain/mollulog-api";
import {
  createPersonalApiKey,
  getPersonalApiKeys,
  type PersonalApiKey,
  revokePersonalApiKey,
} from "~/models/mollulog-api";
import {
  type CopyStatus,
  CopyStatusMessage,
  CopyTextButton,
  DeveloperPage,
  formatDate,
} from "./developers._components/DeveloperPage";
import { formatKeyExpiryRemaining } from "./developers._components/api-key-expiry";

export const meta: MetaFunction = () => [{ title: "API 키 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

type PersonalApiKeyView = Omit<PersonalApiKey, "createdAt" | "expiresAt" | "lastUsedAt" | "revokedAt"> & {
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized", { headers: privateHeaders });

  try {
    const keys = await getPersonalApiKeys(env, sensei.id, { ctx });
    return data(
      {
        keys: keys.map(toPersonalApiKeyView),
        loadError: false,
        loadedAt: Date.now(),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("[developers/keys] failed to load personal API keys", error);
    return data(
      { keys: [] as PersonalApiKeyView[], loadError: true, loadedAt: Date.now() },
      { headers: privateHeaders },
    );
  }
}

type KeyActionData =
  | {
      ok: true;
      intent: "issue";
      token: string;
    }
  | { ok: true; intent: "revoke"; keyName: string }
  | { ok: false; intent: "issue" | "revoke"; message: string; fields?: ApiFieldError[] };

export async function action({ context, request }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized", { headers: privateHeaders });

  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "issue") {
    const name = form.get("name");
    if (typeof name !== "string") {
      return data<KeyActionData>(
        { ok: false, intent, message: "키 이름을 입력해주세요." },
        { status: 400, headers: privateHeaders },
      );
    }

    try {
      const issued = await createPersonalApiKey(
        env,
        sensei.id,
        {
          name,
          readScope: form.get("readScope") === "true",
          writeScope: form.get("writeScope") === "true",
        },
        { ctx },
      );
      return data<KeyActionData>(
        {
          ok: true,
          intent,
          token: issued.token,
        },
        { status: 201, headers: privateHeaders },
      );
    } catch (error) {
      if (error instanceof ApiInputError) {
        return data<KeyActionData>(
          { ok: false, intent, message: error.message, fields: error.fields },
          { status: 400, headers: privateHeaders },
        );
      }
      console.error("[developers/keys] failed to issue personal API key", error);
      return data<KeyActionData>(
        { ok: false, intent, message: "API 키를 발급하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 500, headers: privateHeaders },
      );
    }
  }

  if (intent === "revoke") {
    const uid = form.get("keyUid");
    if (typeof uid !== "string" || uid.length === 0) {
      return data<KeyActionData>(
        { ok: false, intent, message: "삭제할 API 키를 찾지 못했어요." },
        { status: 400, headers: privateHeaders },
      );
    }
    const keyName = form.get("keyName");
    try {
      const revoked = await revokePersonalApiKey(env, sensei.id, uid, { ctx });
      if (!revoked) {
        return data<KeyActionData>(
          { ok: false, intent, message: "삭제할 수 있는 API 키를 찾지 못했어요." },
          { status: 404, headers: privateHeaders },
        );
      }
      return data<KeyActionData>(
        { ok: true, intent, keyName: typeof keyName === "string" ? keyName : "" },
        { headers: privateHeaders },
      );
    } catch (error) {
      console.error("[developers/keys] failed to revoke personal API key", error);
      return data<KeyActionData>(
        { ok: false, intent, message: "API 키를 삭제하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 500, headers: privateHeaders },
      );
    }
  }

  return data<KeyActionData>(
    { ok: false, intent: "issue", message: "요청을 확인할 수 없어요." },
    { status: 400, headers: privateHeaders },
  );
}

function toPersonalApiKeyView(key: PersonalApiKey): PersonalApiKeyView {
  return {
    ...key,
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

function getKeyScopes(readScope: boolean, writeScope: boolean) {
  const scopes = [readScope ? "읽기" : null, writeScope ? "쓰기" : null].filter(Boolean).join("/");
  return scopes ? `학생 ${scopes}` : "권한 없음";
}

export default function DevelopersKeys() {
  const { keys, loadError, loadedAt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isRevealVisible, setIsRevealVisible] = useState(true);
  const [issueResponseDismissed, setIssueResponseDismissed] = useState(false);
  const [name, setName] = useState("");
  const [readScope, setReadScope] = useState(true);
  const [writeScope, setWriteScope] = useState(false);
  const [confirmingUid, setConfirmingUid] = useState<string | null>(null);
  const [now, setNow] = useState(loadedAt);
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    setNow(loadedAt);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [loadedAt]);

  useEffect(() => {
    if (actionData?.ok && actionData.intent === "issue") {
      setIsRevealVisible(true);
      setIsIssueOpen(false);
      setIssueResponseDismissed(false);
      setName("");
      setReadScope(true);
      setWriteScope(false);
    } else if (actionData && actionData.intent === "issue") {
      setIssueResponseDismissed(false);
      setIsIssueOpen(true);
    }
  }, [actionData]);

  const activeKeys = keys.filter((key) => key.revokedAt === null && new Date(key.expiresAt).getTime() > now);
  const inactiveKeys = keys.filter((key) => !activeKeys.includes(key));
  const reveal = actionData?.ok && actionData.intent === "issue" && isRevealVisible ? actionData : null;
  const issueError =
    actionData && !actionData.ok && actionData.intent === "issue" && !issueResponseDismissed ? actionData : null;
  const nameError = issueError?.fields?.find((field) => field.field === "name")?.message;
  const scopeError = issueError?.fields?.find((field) => field.field === "scopes")?.message;
  const hasFieldErrors = Boolean(issueError?.fields?.length);

  function resetIssueForm() {
    setName("");
    setReadScope(true);
    setWriteScope(false);
    setIssueResponseDismissed(true);
    setIsIssueOpen(false);
  }

  return (
    <DeveloperPage>
      <div className="@container space-y-6">
        <header className="flex items-start justify-between gap-3">
          <SubTitle text="API 키" />
          <Button
            variant="primary"
            size="sm"
            disabled={isSubmitting || isIssueOpen || Boolean(reveal)}
            onClick={() => {
              setIsRevealVisible(false);
              setIssueResponseDismissed(true);
              setIsIssueOpen(true);
            }}
          >
            새 API 키 발급
          </Button>
        </header>

        {isIssueOpen ? (
          <SectionCard title="새 API 키 발급" className="p-5 md:p-6">
            <Form method="post" className="space-y-5" onSubmit={() => setIssueResponseDismissed(false)}>
              <input type="hidden" name="intent" value="issue" />
              <Input
                id="api-key-name"
                name="name"
                label="이름"
                error={nameError}
                className="max-w-md"
                placeholder="API 키 구분을 위한 이름"
                maxLength={80}
                required
                value={name}
                onChange={setName}
                autoComplete="off"
              />
              <fieldset
                className="space-y-2"
                aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                aria-invalid={scopeError ? true : undefined}
              >
                <legend className="text-sm font-semibold">권한</legend>
                <table className="w-full max-w-md text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      <th className="pb-2" scope="col">
                        데이터
                      </th>
                      <th className="w-[4.5rem] pb-2 text-center" scope="col">
                        읽기
                      </th>
                      <th className="w-[4.5rem] pb-2 text-center" scope="col">
                        쓰기
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-muted">
                      <th className="rounded-l-md py-2.5 pl-3 text-left font-medium" scope="row">
                        학생
                        <span className="block text-xs font-normal text-muted-foreground">
                          학생 모집 여부, 성장도, 인연 랭크 등
                        </span>
                      </th>
                      <td className="py-2.5 text-center">
                        {writeScope ? <input type="hidden" name="readScope" value="true" /> : null}
                        <Checkbox
                          name="readScope"
                          value="true"
                          checked={readScope}
                          disabled={writeScope}
                          className="justify-center gap-0"
                          onChange={setReadScope}
                          label={<span className="sr-only">학생 읽기</span>}
                          aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                        />
                      </td>
                      <td className="rounded-r-md py-2.5 text-center">
                        <Checkbox
                          name="writeScope"
                          value="true"
                          checked={writeScope}
                          className="justify-center gap-0"
                          onChange={(checked) => {
                            setWriteScope(checked);
                            if (checked) setReadScope(true);
                          }}
                          label={<span className="sr-only">학생 쓰기</span>}
                          aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
                {scopeError ? (
                  <p id="api-key-scopes-error" className="text-sm font-medium text-destructive">
                    {scopeError}
                  </p>
                ) : null}
              </fieldset>
              <p className="text-sm text-muted-foreground">
                <span>
                  발급일로부터 <strong className="font-semibold text-foreground">1년</strong> 동안 사용할 수 있어요.
                </span>
              </p>
              {issueError && !hasFieldErrors ? (
                <Callout tone="destructive" title="키를 발급하지 못했어요">
                  {issueError.message}
                </Callout>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="default" size="sm" onClick={resetIssueForm} disabled={isSubmitting}>
                  취소
                </Button>
                <Button type="submit" variant="primary" size="sm" className="min-w-24" disabled={isSubmitting}>
                  {isSubmitting ? "발급 중..." : "발급"}
                </Button>
              </div>
            </Form>
          </SectionCard>
        ) : reveal ? (
          <SectionCard title="API 키를 발급했어요" className="p-5 md:p-6">
            <div className="space-y-5">
              <Callout
                tone="warning"
                Icon={ExclamationTriangleIcon}
                title="키는 지금만 확인할 수 있어요."
                description="이 화면을 벗어나면 다시 확인할 수 없어요. 안전한 곳에 복사해 두세요."
              />
              <RevealedTokenField key={reveal.token} token={reveal.token} />
              <footer className="flex items-center justify-end gap-4">
                <Link to="/developers/docs" className="text-sm font-medium text-primary hover:underline">
                  API 문서 보기
                </Link>
                <Button type="button" variant="default" size="sm" onClick={() => setIsRevealVisible(false)}>
                  확인했어요
                </Button>
              </footer>
            </div>
          </SectionCard>
        ) : null}

        {actionData?.ok && actionData.intent === "revoke" ? (
          <Callout tone="success" title="API 키를 삭제했어요">
            {actionData.keyName
              ? `“${actionData.keyName}” 키는 더 이상 사용할 수 없어요.`
              : "선택한 키는 더 이상 사용할 수 없어요."}
          </Callout>
        ) : null}

        {actionData && !actionData.ok && actionData.intent === "revoke" ? (
          <Callout tone="destructive" title="API 키를 삭제하지 못했어요">
            {actionData.message}
          </Callout>
        ) : null}

        {loadError ? (
          <SectionCard>
            <div className="space-y-4">
              <Callout tone="destructive" title="API 키 목록을 불러오지 못했어요">
                다시 시도하거나 잠시 후 이 화면을 새로고침해주세요.
              </Callout>
              <Button
                type="button"
                variant="secondary"
                disabled={revalidator.state !== "idle"}
                onClick={() => revalidator.revalidate()}
              >
                {revalidator.state === "idle" ? "다시 불러오기" : "불러오는 중..."}
              </Button>
            </div>
          </SectionCard>
        ) : (
          <>
            {activeKeys.length === 0 ? (
              <SectionCard>
                <EmptyView
                  Icon={KeyIcon}
                  text="사용할 수 있는 API 키가 없어요"
                  description="필요한 권한을 선택해 새 키를 발급해주세요."
                  className="my-8"
                />
              </SectionCard>
            ) : (
              <ul className="space-y-4" aria-label="사용 가능한 API 키">
                {activeKeys.map((key) => (
                  <KeyRow
                    key={key.uid}
                    keyRecord={key}
                    now={now}
                    confirming={confirmingUid === key.uid}
                    isSubmitting={isSubmitting}
                    onConfirm={() => setConfirmingUid(key.uid)}
                    onCancel={() => setConfirmingUid(null)}
                  />
                ))}
              </ul>
            )}

            {inactiveKeys.length > 0 ? (
              <Section title={`만료·삭제된 키 ${inactiveKeys.length}개`} collapsible defaultExpanded={false}>
                <ul className="space-y-4">
                  {inactiveKeys.map((key) => (
                    <KeyRow
                      key={key.uid}
                      keyRecord={key}
                      now={now}
                      confirming={false}
                      isSubmitting={isSubmitting}
                      onConfirm={() => {}}
                      onCancel={() => {}}
                    />
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        )}
      </div>
    </DeveloperPage>
  );
}

function KeyRow({
  keyRecord,
  now,
  confirming,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  keyRecord: PersonalApiKeyView;
  now: number;
  confirming: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isActive = keyRecord.revokedAt === null && new Date(keyRecord.expiresAt).getTime() > now;
  const scopeText = getKeyScopes(keyRecord.readScope, keyRecord.writeScope);
  const status = keyRecord.revokedAt ? "삭제됨" : isActive ? "사용 가능" : "만료";
  const lastUsedTime = keyRecord.lastUsedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "Asia/Seoul",
      }).format(new Date(keyRecord.lastUsedAt))
    : null;

  return (
    <li>
      <SectionCard className="space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <KeyIcon
              className={`mt-0.5 size-5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-2">
              <h3 className={`break-words text-base font-semibold ${isActive ? "" : "text-muted-foreground"}`}>
                {keyRecord.name}
              </h3>
              <span className="inline-flex rounded-md bg-muted px-2.5 py-1 text-xs font-medium">{scopeText}</span>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
            }`}
          >
            {status}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm @xl:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">발급일</dt>
            <dd className="tabular-nums">{formatDate(keyRecord.createdAt)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{keyRecord.revokedAt ? "삭제일" : "만료일"}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-1 tabular-nums">
              <span>{formatDate(keyRecord.revokedAt ?? keyRecord.expiresAt)}</span>
              {isActive ? (
                <span className="text-xs text-muted-foreground">
                  ({formatKeyExpiryRemaining(keyRecord.expiresAt, now)})
                </span>
              ) : null}
            </dd>
          </div>
          <div className="col-span-2 space-y-1 @xl:col-span-1">
            <dt className="text-xs text-muted-foreground">마지막 사용</dt>
            <dd className="tabular-nums">
              {keyRecord.lastUsedAt ? `${formatDate(keyRecord.lastUsedAt)} ${lastUsedTime}` : "아직 사용하지 않음"}
            </dd>
          </div>
        </dl>
        <footer className="flex flex-wrap items-center justify-end gap-4">
          <Link to="/developers/history" className="whitespace-nowrap text-sm font-medium text-primary hover:underline">
            변경 기록
          </Link>
          {isActive ? (
            <Button
              type="button"
              size="sm"
              variant="danger-subtle"
              disabled={isSubmitting || confirming}
              onClick={onConfirm}
            >
              <span className="sr-only">{keyRecord.name} API 키 </span>
              삭제
            </Button>
          ) : null}
        </footer>
        {confirming ? (
          <div className="space-y-4 rounded-md bg-destructive/10 p-4">
            <p className="break-keep text-sm">삭제하면 이 키로 연결한 도구에서 더 이상 API를 사용할 수 없어요.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="default" onClick={onCancel} disabled={isSubmitting}>
                취소
              </Button>
              <Form method="post">
                <input type="hidden" name="intent" value="revoke" />
                <input type="hidden" name="keyUid" value={keyRecord.uid} />
                <input type="hidden" name="keyName" value={keyRecord.name} />
                <Button type="submit" size="sm" variant="danger" disabled={isSubmitting}>
                  <span className="sr-only">{keyRecord.name} API 키 </span>
                  {isSubmitting ? "삭제 중..." : "삭제 확인"}
                </Button>
              </Form>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </li>
  );
}

function RevealedTokenField({ token }: { token: string }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="API 키"
          value={token}
          readOnly
          autoComplete="off"
          containerClassName="min-w-[14rem] flex-1"
          className="max-w-none font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <CopyTextButton
          value={token}
          label="복사하기"
          variant="text"
          buttonVariant="primary"
          accessibleContext="API 키"
          onStatusChange={setCopyStatus}
        />
      </div>
      <CopyStatusMessage status={copyStatus} />
    </div>
  );
}
