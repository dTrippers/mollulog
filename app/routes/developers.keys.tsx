import { ChevronDownIcon, KeyIcon } from "@heroicons/react/24/outline";
import { useEffect, useId, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";
import { PageMain } from "~/components/v2/layout/PageMain";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { Button } from "~/components/v2/primitives/Button";
import { Checkbox } from "~/components/v2/primitives/Checkbox";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { type ApiFieldError, ApiInputError } from "~/domain/mollulog-api";
import { getDeveloperScopeLabels } from "~/domain/mollulog-api-spec";
import {
  createPersonalApiKey,
  getPersonalApiKeys,
  type PersonalApiKey,
  revokePersonalApiKey,
} from "~/models/mollulog-api";
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
    console.error("[developers/keys] failed to load personal API keys", sanitizeErrorForLogging(error));
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
          scopes: [
            ...(form.get("profileScope") === "true" ? (["profile"] as const) : []),
            ...(form.get("readScope") === "true" ? (["students:read"] as const) : []),
            ...(form.get("writeScope") === "true" ? (["students:write"] as const) : []),
          ],
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
      console.error("[developers/keys] failed to issue personal API key", sanitizeErrorForLogging(error));
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
      console.error("[developers/keys] failed to revoke personal API key", sanitizeErrorForLogging(error));
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

export default function DevelopersKeys() {
  const { keys, loadError, loadedAt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isRevealVisible, setIsRevealVisible] = useState(true);
  const [issueResponseDismissed, setIssueResponseDismissed] = useState(false);
  const [name, setName] = useState("");
  const [profileScope, setProfileScope] = useState(false);
  const [readScope, setReadScope] = useState(true);
  const [writeScope, setWriteScope] = useState(false);
  const [confirmingUid, setConfirmingUid] = useState<string | null>(null);
  const [now, setNow] = useState(loadedAt);
  const trackedActionData = useRef(actionData);
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData === trackedActionData.current) return;
    trackedActionData.current = actionData;
    if (actionData?.ok && actionData.intent === "issue") trackGoogleAnalyticsEvent("api_key_issued");
    if (actionData?.ok && actionData.intent === "revoke") trackGoogleAnalyticsEvent("api_key_revoked");
  }, [actionData]);

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
      setProfileScope(false);
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
    setProfileScope(false);
    setReadScope(true);
    setWriteScope(false);
    setIssueResponseDismissed(true);
    setIsIssueOpen(false);
  }

  return (
    <PageMain>
      <div className="@container space-y-v2-block-gap">
        <header className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">API 키</h2>
          <Button
            variant="primary"
            className="disabled:bg-v2-inset"
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
          <section aria-labelledby="api-key-issue-title" className="rounded-lg bg-v2-surface p-v2-block-p">
            <h3 id="api-key-issue-title" className="text-base font-semibold">
              새 API 키 발급
            </h3>
            <Form
              method="post"
              className="mt-v2-group-gap space-y-v2-group-gap"
              onSubmit={() => setIssueResponseDismissed(false)}
            >
              <input type="hidden" name="intent" value="issue" />
              <div>
                <label htmlFor="api-key-name" className="block text-sm font-medium">
                  이름
                </label>
                <input
                  id="api-key-name"
                  name="name"
                  type="text"
                  maxLength={80}
                  required
                  value={name}
                  placeholder="API 키 구분을 위한 이름"
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "api-key-name-error" : undefined}
                  onChange={(event) => setName(event.currentTarget.value)}
                  className="mt-2 min-h-v2-input-min w-full max-w-md rounded-md border border-v2-control-border bg-v2-surface px-3 text-sm text-v2-fg placeholder:text-v2-fg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                />
                {nameError ? (
                  <p id="api-key-name-error" className="mt-1 text-sm font-medium text-v2-danger">
                    {nameError}
                  </p>
                ) : null}
              </div>
              <fieldset
                className="space-y-2"
                aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                aria-invalid={scopeError ? true : undefined}
              >
                <legend className="text-sm font-semibold">권한</legend>
                <table className="w-full max-w-md border-separate border-spacing-y-1 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-v2-fg-tertiary">
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
                    <tr>
                      <th className="rounded-l-md bg-v2-inset py-2.5 pl-3 text-left font-medium" scope="row">
                        프로필
                        <span className="block text-xs font-normal text-v2-fg-secondary">닉네임 · 프로필 학생</span>
                      </th>
                      <td className="bg-v2-inset py-2.5 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            id="api-key-profile-scope"
                            name="profileScope"
                            value="true"
                            checked={profileScope}
                            onCheckedChange={setProfileScope}
                            aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                            aria-invalid={scopeError ? true : undefined}
                          >
                            <span className="sr-only">프로필 보기</span>
                          </Checkbox>
                        </div>
                      </td>
                      <td className="rounded-r-md bg-v2-inset py-2.5 text-center text-v2-fg-tertiary" aria-label="쓰기 권한 없음">
                        –
                      </td>
                    </tr>
                    <tr>
                      <th className="rounded-l-md bg-v2-inset py-2.5 pl-3 text-left font-medium" scope="row">
                        학생
                        <span className="block text-xs font-normal text-v2-fg-secondary">
                          학생 모집 여부, 성장도, 인연 랭크 등
                        </span>
                      </th>
                      <td className="bg-v2-inset py-2.5 text-center">
                        {writeScope ? <input type="hidden" name="readScope" value="true" /> : null}
                        <div className="flex justify-center">
                          <Checkbox
                            id="api-key-read-scope"
                            name="readScope"
                            value="true"
                            checked={readScope}
                            disabled={writeScope}
                            onCheckedChange={setReadScope}
                            aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                            aria-invalid={scopeError ? true : undefined}
                          >
                            <span className="sr-only">학생 읽기</span>
                          </Checkbox>
                        </div>
                      </td>
                      <td className="rounded-r-md bg-v2-inset py-2.5 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            id="api-key-write-scope"
                            name="writeScope"
                            value="true"
                            checked={writeScope}
                            onCheckedChange={(checked) => {
                              setWriteScope(checked);
                              if (checked) setReadScope(true);
                            }}
                            aria-describedby={scopeError ? "api-key-scopes-error" : undefined}
                            aria-invalid={scopeError ? true : undefined}
                          >
                            <span className="sr-only">학생 쓰기</span>
                          </Checkbox>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {scopeError ? (
                  <p id="api-key-scopes-error" className="text-sm font-medium text-v2-danger">
                    {scopeError}
                  </p>
                ) : null}
              </fieldset>
              <p className="text-sm text-v2-fg-secondary">
                발급일로부터 <strong className="font-semibold text-v2-fg">1년</strong> 동안 사용할 수 있어요.
              </p>
              {issueError && !hasFieldErrors ? (
                <StatusNotice tone="danger">
                  <span className="font-semibold">키를 발급하지 못했어요.</span> {issueError.message}
                </StatusNotice>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="text" onClick={resetIssueForm} disabled={isSubmitting}>
                  취소
                </Button>
                <Button type="submit" variant="primary" className="min-w-24" disabled={isSubmitting}>
                  {isSubmitting ? "발급 중..." : "발급"}
                </Button>
              </div>
            </Form>
          </section>
        ) : reveal ? (
          <section aria-labelledby="api-key-reveal-title" className="rounded-lg bg-v2-surface p-v2-block-p">
            <h3 id="api-key-reveal-title" className="text-base font-semibold">
              API 키를 발급했어요
            </h3>
            <div className="mt-v2-group-gap space-y-v2-group-gap">
              <StatusNotice tone="warning">
                <span className="block font-semibold">키는 지금만 확인할 수 있어요.</span>
                <span className="block">이 화면을 벗어나면 다시 확인할 수 없어요. 안전한 곳에 복사해 두세요.</span>
              </StatusNotice>
              <RevealedTokenField key={reveal.token} token={reveal.token} />
              <footer className="flex flex-wrap items-center justify-end gap-4">
                <Link
                  to="/developers/docs"
                  className="text-sm font-medium text-v2-link underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                  {...getV2LinkTransitionProps("crossfade")}
                >
                  API 문서 보기
                </Link>
                <Button type="button" variant="secondary" onClick={() => setIsRevealVisible(false)}>
                  확인했어요
                </Button>
              </footer>
            </div>
          </section>
        ) : null}

        {actionData?.ok && actionData.intent === "revoke" ? (
          <StatusNotice tone="success">
            <span className="font-semibold">API 키를 삭제했어요.</span>{" "}
            {actionData.keyName
              ? `“${actionData.keyName}” 키는 더 이상 사용할 수 없어요.`
              : "선택한 키는 더 이상 사용할 수 없어요."}
          </StatusNotice>
        ) : null}

        {actionData && !actionData.ok && actionData.intent === "revoke" ? (
          <StatusNotice tone="danger">
            <span className="font-semibold">API 키를 삭제하지 못했어요.</span> {actionData.message}
          </StatusNotice>
        ) : null}

        {loadError ? (
          <section className="space-y-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
            <StatusNotice tone="danger">
              <span className="font-semibold">API 키 목록을 불러오지 못했어요.</span>
              <span className="block">다시 시도하거나 잠시 후 이 화면을 새로고침해주세요.</span>
            </StatusNotice>
            <Button
              type="button"
              variant="secondary"
              disabled={revalidator.state !== "idle"}
              onClick={() => revalidator.revalidate()}
            >
              {revalidator.state === "idle" ? "다시 불러오기" : "불러오는 중..."}
            </Button>
          </section>
        ) : (
          <>
            {activeKeys.length === 0 ? (
              <section className="flex flex-col items-center gap-3 rounded-lg bg-v2-surface px-v2-block-p py-8 text-center">
                <KeyIcon className="size-8 text-v2-fg-tertiary" aria-hidden="true" />
                <h3 className="font-semibold">사용할 수 있는 API 키가 없어요</h3>
                <p className="max-w-prose text-sm text-v2-fg-secondary">필요한 권한을 선택해 새 키를 발급해주세요.</p>
              </section>
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
              <details className="group rounded-lg bg-v2-surface">
                <summary className="flex min-h-v2-row-min cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-v2-block-p py-v2-row-y font-semibold hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus">
                  <span>만료·삭제된 키 {inactiveKeys.length}개</span>
                  <ChevronDownIcon
                    className="size-4 shrink-0 text-v2-fg-tertiary motion-safe:transition-transform motion-safe:duration-v2-base motion-safe:ease-v2-standard group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <ul className="space-y-4 px-v2-block-p pb-v2-block-p" aria-label="만료되거나 삭제된 API 키">
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
              </details>
            ) : null}
          </>
        )}
      </div>
    </PageMain>
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
  const triggerId = useId();
  const confirmationRef = useRef<HTMLFieldSetElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) confirmationRef.current?.focus();
    else if (wasConfirming.current) document.getElementById(triggerId)?.focus();
    wasConfirming.current = confirming;
  }, [confirming, triggerId]);

  const isActive = keyRecord.revokedAt === null && new Date(keyRecord.expiresAt).getTime() > now;
  const scopeLabels = getDeveloperScopeLabels(keyRecord.scopes);
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
      <article className="space-y-5 rounded-lg bg-v2-surface p-v2-block-p">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-v2-media-gap">
            <KeyIcon
              className={
                isActive ? "mt-0.5 size-5 shrink-0 text-v2-fg-secondary" : "mt-0.5 size-5 shrink-0 text-v2-fg-tertiary"
              }
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-2">
              <h3 className={isActive ? "break-words font-semibold" : "break-words font-semibold text-v2-fg-tertiary"}>
                {keyRecord.name}
              </h3>
              <ul className="flex flex-wrap gap-1.5" aria-label="API 권한">
                {scopeLabels.map((label) => (
                  <li key={label} className="rounded-md bg-v2-inset px-2.5 py-1 text-xs font-medium">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <span
            className={
              isActive
                ? "shrink-0 rounded-full bg-v2-success-subtle px-2.5 py-1 text-xs font-medium text-v2-success"
                : "shrink-0 rounded-full bg-v2-inset px-2.5 py-1 text-xs font-medium text-v2-fg-secondary"
            }
          >
            {status}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm @xl:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-xs text-v2-fg-tertiary">발급일</dt>
            <dd className="tabular-nums">{formatDate(keyRecord.createdAt)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-v2-fg-tertiary">{keyRecord.revokedAt ? "삭제일" : "만료일"}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-1 tabular-nums">
              <span>{formatDate(keyRecord.revokedAt ?? keyRecord.expiresAt)}</span>
              {isActive ? (
                <span className="text-xs text-v2-fg-secondary">
                  ({formatKeyExpiryRemaining(keyRecord.expiresAt, now)})
                </span>
              ) : null}
            </dd>
          </div>
          <div className="col-span-2 space-y-1 @xl:col-span-1">
            <dt className="text-xs text-v2-fg-tertiary">마지막 사용</dt>
            <dd className="tabular-nums">
              {keyRecord.lastUsedAt ? `${formatDate(keyRecord.lastUsedAt)} ${lastUsedTime}` : "아직 사용하지 않음"}
            </dd>
          </div>
        </dl>
        <footer className="flex flex-wrap items-center justify-end gap-4">
          <Link
            to="/data-history?filter=api"
            className="whitespace-nowrap text-sm font-medium text-v2-link underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
            {...getV2LinkTransitionProps("crossfade")}
          >
            데이터 변경 이력
          </Link>
          {isActive ? (
            <Button
              id={triggerId}
              type="button"
              variant="danger"
              disabled={isSubmitting || confirming}
              onClick={onConfirm}
            >
              <span className="sr-only">{keyRecord.name} API 키 </span>
              삭제
            </Button>
          ) : null}
        </footer>
        {confirming ? (
          <fieldset ref={confirmationRef} tabIndex={-1} className="space-y-4 rounded-md bg-v2-inset p-4">
            <legend className="sr-only">{`${keyRecord.name} API 키 삭제 확인`}</legend>
            <p className="break-keep text-sm">삭제하면 이 키로 연결한 도구에서 더 이상 API를 사용할 수 없어요.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="text" onClick={onCancel} disabled={isSubmitting}>
                취소
              </Button>
              <Form method="post">
                <input type="hidden" name="intent" value="revoke" />
                <input type="hidden" name="keyUid" value={keyRecord.uid} />
                <input type="hidden" name="keyName" value={keyRecord.name} />
                <Button type="submit" variant="danger" disabled={isSubmitting}>
                  <span className="sr-only">{keyRecord.name} API 키 </span>
                  {isSubmitting ? "삭제 중..." : "삭제 확인"}
                </Button>
              </Form>
            </div>
          </fieldset>
        ) : null}
      </article>
    </li>
  );
}

function RevealedTokenField({ token }: { token: string }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="revealed-api-key" className="mb-2 block text-sm font-medium">
            API 키
          </label>
          <input
            id="revealed-api-key"
            type="text"
            value={token}
            readOnly
            autoComplete="off"
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-v2-input-min w-full rounded-md border border-v2-control-border bg-v2-surface px-3 font-mono text-xs text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
          />
        </div>
        <CopyTextButton
          value={token}
          label="복사하기"
          variant="text"
          buttonVariant="secondary"
          accessibleContext="API 키"
          onStatusChange={setCopyStatus}
        />
      </div>
      <CopyStatusMessage status={copyStatus} />
    </div>
  );
}

function formatDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")}`;
}
