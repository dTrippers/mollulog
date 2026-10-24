import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { Button } from "~/components/v2/primitives/Button";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { normalizeApiScopes, type ApiScope } from "~/domain/mollulog-api-spec";
import { formatInstant } from "~/lib/date-time";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import {
  deleteOwnedOAuthApplication,
  getOwnedOAuthApplication,
  OAuthApplicationInputError,
  regenerateOAuthClientSecret,
  updateOwnedOAuthApplication,
  type OAuthApplication,
} from "~/models/mollulog-oauth";
import { ApplicationPermissionMatrix } from "./developers._components/ApplicationPermissionMatrix";
import { requireOAuthAppManager } from "./developers._components/requireOAuthAppManager";

export const meta: MetaFunction = () => [{ title: "애플리케이션 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

type ApplicationView = Pick<OAuthApplication, "uid" | "name" | "clientId" | "redirectUris" | "scopes"> & {
  updatedAt: string;
  clientSecretIssuedAt: string;
};

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const access = await requireOAuthAppManager(env, request, ctx);
  if (access instanceof Response) return access;
  if (!params.uid) return redirect("/developers/applications", { headers: privateHeaders });

  try {
    const application = await getOwnedOAuthApplication(env, access, params.uid, { ctx });
    if (!application) return redirect("/developers/applications", { headers: privateHeaders });
    return data({ application: toApplicationView(application) }, { headers: privateHeaders });
  } catch (error) {
    console.error("[developers/applications/detail] failed to load OAuth application", sanitizeErrorForLogging(error));
    return redirect("/developers/applications", { headers: privateHeaders });
  }
}

type ApplicationActionData =
  | { ok: true; intent: "update" }
  | { ok: true; intent: "rotate"; clientSecret: string; issuedAt: string }
  | { ok: false; intent: "update" | "rotate" | "delete"; field?: "name" | "redirectUris" | "scopes"; index?: number; message: string };

export async function action({ context, request, params }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const access = await requireOAuthAppManager(env, request, ctx);
  if (access instanceof Response) return access;
  const uid = params.uid;
  if (!uid) return redirect("/developers/applications", { headers: privateHeaders });

  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "update") {
    const name = form.get("name");
    const redirectUris = form.getAll("redirectUris");
    const scopes = form.getAll("scope");
    if (
      typeof name !== "string" ||
      redirectUris.some((value) => typeof value !== "string") ||
      scopes.some((value) => typeof value !== "string")
    ) {
      return data<ApplicationActionData>(
        { ok: false, intent, message: "요청 내용을 확인해주세요." },
        { status: 400, headers: privateHeaders },
      );
    }
    try {
      const application = await updateOwnedOAuthApplication(
        env,
        access,
        uid,
        { name, redirectUris: redirectUris as string[], scopes: scopes as string[] },
        { ctx },
      );
      if (!application) return redirect("/developers/applications", { headers: privateHeaders });
      return data<ApplicationActionData>({ ok: true, intent }, { headers: privateHeaders });
    } catch (error) {
      if (error instanceof OAuthApplicationInputError) {
        return data<ApplicationActionData>(
          { ok: false, intent, field: error.field, index: error.index, message: error.message },
          { status: 400, headers: privateHeaders },
        );
      }
      console.error("[developers/applications/detail] failed to update OAuth application", sanitizeErrorForLogging(error));
      return data<ApplicationActionData>(
        { ok: false, intent, message: "변경사항을 저장하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 500, headers: privateHeaders },
      );
    }
  }

  if (intent === "rotate") {
    try {
      const result = await regenerateOAuthClientSecret(env, access, uid, { ctx });
      if (!result) return redirect("/developers/applications", { headers: privateHeaders });
      return data<ApplicationActionData>(
        { ok: true, intent, clientSecret: result.clientSecret, issuedAt: result.issuedAt.toISOString() },
        { headers: privateHeaders },
      );
    } catch (error) {
      console.error("[developers/applications/detail] failed to regenerate OAuth client secret", sanitizeErrorForLogging(error));
      return data<ApplicationActionData>(
        { ok: false, intent, message: "Client Secret을 재발급하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 500, headers: privateHeaders },
      );
    }
  }

  if (intent === "delete") {
    try {
      await deleteOwnedOAuthApplication(env, access, uid, { ctx });
      return redirect("/developers/applications", { headers: privateHeaders });
    } catch (error) {
      console.error("[developers/applications/detail] failed to delete OAuth application", sanitizeErrorForLogging(error));
      return data<ApplicationActionData>(
        { ok: false, intent, message: "애플리케이션을 삭제하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 500, headers: privateHeaders },
      );
    }
  }

  return data<ApplicationActionData>(
    { ok: false, intent: "update", message: "요청을 확인할 수 없어요." },
    { status: 400, headers: privateHeaders },
  );
}

function toApplicationView(application: OAuthApplication): ApplicationView {
  return {
    uid: application.uid,
    name: application.name,
    clientId: application.clientId,
    redirectUris: application.redirectUris,
    scopes: application.scopes,
    updatedAt: application.updatedAt.toISOString(),
    clientSecretIssuedAt: application.clientSecretIssuedAt.toISOString(),
  };
}

function createRedirectUriRows(redirectUris: string[]) {
  return redirectUris.map((value) => ({ id: crypto.randomUUID(), value }));
}

export default function DeveloperApplicationDetail() {
  const { application } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [name, setName] = useState(application.name);
  const [redirectUris, setRedirectUris] = useState(() => createRedirectUriRows(application.redirectUris));
  const [scopes, setScopes] = useState<ApiScope[]>(application.scopes);
  const [showRotatedSecret, setShowRotatedSecret] = useState(true);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rotateConfirmRef = useRef<HTMLFieldSetElement>(null);
  const deleteConfirmRef = useRef<HTMLFieldSetElement>(null);
  const displayTimeZone = useDisplayTimeZone();

  useEffect(() => {
    setName(application.name);
    setRedirectUris(createRedirectUriRows(application.redirectUris));
    setScopes(application.scopes);
  }, [application]);

  useEffect(() => {
    if (actionData?.ok && actionData.intent === "rotate") {
      setShowRotatedSecret(true);
      setConfirmRotate(false);
    }
    if (actionData?.ok && actionData.intent === "update") setShowRotatedSecret(false);
  }, [actionData]);

  useEffect(() => {
    if (confirmRotate) rotateConfirmRef.current?.focus();
  }, [confirmRotate]);
  useEffect(() => {
    if (confirmDelete) deleteConfirmRef.current?.focus();
  }, [confirmDelete]);

  const baseline = JSON.stringify({ name: application.name, redirectUris: application.redirectUris, scopes: normalizeApiScopes(application.scopes) });
  const current = JSON.stringify({ name, redirectUris: redirectUris.map(({ value }) => value), scopes: normalizeApiScopes(scopes) });
  const isDirty = baseline !== current;
  const updateError = actionData && !actionData.ok && actionData.intent === "update" ? actionData : null;
  const rotateError = actionData && !actionData.ok && actionData.intent === "rotate" ? actionData.message : null;
  const deleteError = actionData && !actionData.ok && actionData.intent === "delete" ? actionData.message : null;
  const rotatedSecret = actionData?.ok && actionData.intent === "rotate" && showRotatedSecret ? actionData : null;

  function cancelRotate() {
    setConfirmRotate(false);
    document.getElementById("application-rotate-trigger")?.focus();
  }
  function cancelDelete() {
    setConfirmDelete(false);
    document.getElementById("application-delete-trigger")?.focus();
  }

  return (
    <PageMain>
      <PageHeader
        title={<span className="text-lg font-semibold leading-6 md:text-lg">{application.name}</span>}
        back={{ title: "애플리케이션", to: "/developers/applications" }}
      />
      <div className="space-y-v2-block-gap">
        <section className="space-y-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p" aria-labelledby="application-credentials-title">
          <h2 id="application-credentials-title" className="text-base font-semibold">
            인증 정보
          </h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-sm text-v2-fg-secondary sm:pt-1.5">Client ID</dt>
            <dd className="flex min-w-0 items-start justify-between gap-3">
              <code className="min-w-0 break-all pt-1 font-mono text-sm">{application.clientId}</code>
              <CopyTextButton value={application.clientId} variant="icon" accessibleContext="Client ID" onStatusChange={() => {}} />
            </dd>
            <dt id="application-secret-label" className="text-sm text-v2-fg-secondary sm:pt-1.5">Client Secret</dt>
            <dd className="min-w-0">
              {rotatedSecret ? (
                <div className="space-y-2">
                  <StatusNotice tone="warning" className="items-center">
                    <span className="font-semibold">지금만 확인할 수 있어요.</span>
                  </StatusNotice>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
                    <input
                      id="rotated-client-secret"
                      type="text"
                      value={rotatedSecret.clientSecret}
                      readOnly
                      autoComplete="off"
                      aria-labelledby="application-secret-label"
                      onFocus={(event) => event.currentTarget.select()}
                      className="min-h-v2-input-min w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-3 font-mono text-xs text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus sm:flex-1"
                    />
                    <CopyTextButton
                      value={rotatedSecret.clientSecret}
                      accessibleContext="Client Secret"
                      buttonVariant="secondary"
                      className="shrink-0"
                      onStatusChange={() => {}}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="secondary" onClick={() => setShowRotatedSecret(false)}>
                      확인했어요
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-v2-fg-secondary tabular-nums">{formatInstant(application.clientSecretIssuedAt, { timeZone: displayTimeZone })} 발급</span>
                    <Button
                      id="application-rotate-trigger"
                      type="button"
                      disabled={isSubmitting || confirmRotate || confirmDelete}
                      onClick={() => setConfirmRotate(true)}
                    >
                      재발급
                    </Button>
                  </div>
                  {confirmRotate ? (
                    <fieldset ref={rotateConfirmRef} tabIndex={-1} className="mt-v2-group-gap space-y-4 rounded-md bg-v2-inset p-4">
                      <legend className="sr-only">Client Secret 재발급 확인</legend>
                      <p className="break-keep text-sm">새 Client Secret을 발급하면 이전 secret은 바로 사용할 수 없어요.</p>
                      {rotateError ? <StatusNotice tone="danger">{rotateError}</StatusNotice> : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="text" disabled={isSubmitting} onClick={cancelRotate}>
                          취소
                        </Button>
                        <Form method="post">
                          <input type="hidden" name="intent" value="rotate" />
                          <Button type="submit" variant="primary" disabled={isSubmitting}>
                            {isSubmitting ? "재발급 중..." : "재발급"}
                          </Button>
                        </Form>
                      </div>
                    </fieldset>
                  ) : null}
                </>
              )}
            </dd>
          </dl>
        </section>

        <section className="space-y-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p" aria-labelledby="application-settings-title">
          <h2 id="application-settings-title" className="text-base font-semibold">설정</h2>
          <Form method="post" className="space-y-v2-block-gap">
            <input type="hidden" name="intent" value="update" />
            <div>
              <label htmlFor="application-name" className="block text-sm font-medium">이름</label>
              <input
                id="application-name"
                name="name"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={updateError?.field === "name" ? true : undefined}
                aria-describedby={updateError?.field === "name" ? "application-name-error" : undefined}
                className="mt-2 min-h-v2-input-min w-full max-w-md rounded-md border border-v2-control-border bg-v2-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
              />
              {updateError?.field === "name" ? <p id="application-name-error" className="mt-1 text-sm text-v2-danger">{updateError.message}</p> : null}
            </div>
            <fieldset className="space-y-2" aria-describedby={updateError?.field === "redirectUris" && updateError.index === undefined ? "application-redirect-error" : undefined}>
              <legend className="flex w-full items-center justify-between gap-3 text-sm font-semibold">
                <span>Redirect URI</span>
                <span className="text-xs font-normal text-v2-fg-tertiary">{redirectUris.length}/5</span>
              </legend>
              <ul className="space-y-2">
                {redirectUris.map(({ id, value }, index) => {
                  const uriError = updateError?.field === "redirectUris" && updateError.index === index ? updateError.message : undefined;
                  return (
                    <li key={id} className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`application-redirect-uri-${index}`} className="sr-only">Redirect URI {index + 1}</label>
                        <input
                          id={`application-redirect-uri-${index}`}
                          name="redirectUris"
                          type="url"
                          required
                          value={value}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setRedirectUris((currentUris) => currentUris.map((row) => row.id === id ? { ...row, value } : row));
                          }}
                          aria-invalid={uriError ? true : undefined}
                          aria-describedby={uriError ? `application-redirect-error-${index}` : undefined}
                          className="min-h-v2-input-min w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                        />
                        {uriError ? <p id={`application-redirect-error-${index}`} className="mt-1 text-sm text-v2-danger">{uriError}</p> : null}
                      </div>
                      <IconButton
                        icon={XMarkIcon}
                        label={`Redirect URI ${index + 1} 삭제`}
                        disabled={redirectUris.length <= 1 || isSubmitting}
                        onClick={() => setRedirectUris((currentUris) => currentUris.filter((row) => row.id !== id))}
                      />
                    </li>
                  );
                })}
              </ul>
              {updateError?.field === "redirectUris" && updateError.index === undefined ? <p id="application-redirect-error" className="text-sm text-v2-danger">{updateError.message}</p> : null}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="link"
                  disabled={redirectUris.length >= 5 || isSubmitting}
                  onClick={() => setRedirectUris((currentUris) => [...currentUris, { id: crypto.randomUUID(), value: "" }])}
                >
                  <PlusIcon className="size-4" aria-hidden="true" />
                  주소 추가
                </Button>
              </div>
            </fieldset>
            <ApplicationPermissionMatrix scopes={scopes} onChange={setScopes} error={updateError?.field === "scopes" ? updateError.message : undefined} />
            {updateError && !updateError.field ? <StatusNotice tone="danger">{updateError.message}</StatusNotice> : null}
            {actionData?.ok && actionData.intent === "update" ? <StatusNotice tone="success">변경사항을 저장했어요.</StatusNotice> : null}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={!isDirty || isSubmitting}>
                저장
              </Button>
            </div>
          </Form>
        </section>

        <section className="space-y-v2-group-gap" aria-label="애플리케이션 삭제">
          <Button
            id="application-delete-trigger"
            type="button"
            variant="danger"
            disabled={isSubmitting || confirmDelete || confirmRotate}
            onClick={() => setConfirmDelete(true)}
          >
            애플리케이션 삭제
          </Button>
          {confirmDelete ? (
            <fieldset ref={deleteConfirmRef} tabIndex={-1} className="space-y-4 rounded-md bg-v2-inset p-4">
              <legend className="sr-only">애플리케이션 삭제 확인</legend>
              <p className="break-keep text-sm">삭제하면 연결된 모든 사용자의 연결이 해제돼요.</p>
              {deleteError ? <StatusNotice tone="danger">{deleteError}</StatusNotice> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="text" disabled={isSubmitting} onClick={cancelDelete}>
                  취소
                </Button>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <Button type="submit" variant="danger" disabled={isSubmitting}>
                    {isSubmitting ? "삭제 중..." : "삭제"}
                  </Button>
                </Form>
              </div>
            </fieldset>
          ) : null}
        </section>
      </div>
    </PageMain>
  );
}

