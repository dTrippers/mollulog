import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { PlusIcon, Squares2X2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, useActionData, useLoaderData, useNavigate, useNavigation } from "react-router";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";
import { PageMain } from "~/components/v2/layout/PageMain";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { Button } from "~/components/v2/primitives/Button";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { getDeveloperScopeSummary, type ApiScope } from "~/domain/mollulog-api-spec";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { createOAuthApplication, getOAuthApplications, OAuthApplicationInputError } from "~/models/mollulog-oauth";
import { ApplicationPermissionMatrix } from "./developers._components/ApplicationPermissionMatrix";
import { requireOAuthAppManager } from "./developers._components/requireOAuthAppManager";

export const meta: MetaFunction = () => [{ title: "새 애플리케이션 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const access = await requireOAuthAppManager(env, request, ctx);
  if (access instanceof Response) return access;

  try {
    const applications = await getOAuthApplications(env, access, { ctx });
    return data(
      { applications: applications.map(({ uid, name, scopes }) => ({ uid, name, scopes })), loadError: false },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("[developers/applications/new] failed to load OAuth applications", sanitizeErrorForLogging(error));
    return data({ applications: [], loadError: true }, { headers: privateHeaders });
  }
}

type CreateActionData =
  | { ok: true; uid: string; name: string; clientId: string; clientSecret: string; scopes: ApiScope[] }
  | { ok: false; field?: "name" | "redirectUris" | "scopes"; index?: number; message: string };

export async function action({ context, request }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const access = await requireOAuthAppManager(env, request, ctx);
  if (access instanceof Response) return access;

  const form = await request.formData();
  const name = form.get("name");
  const redirectUris = form.getAll("redirectUris");
  const scopes = form.getAll("scope");
  if (typeof name !== "string" || redirectUris.some((value) => typeof value !== "string") || scopes.some((value) => typeof value !== "string")) {
    return data<CreateActionData>({ ok: false, message: "요청 내용을 확인해주세요." }, { status: 400, headers: privateHeaders });
  }

  try {
    const result = await createOAuthApplication(
      env,
      access,
      { name, redirectUris: redirectUris as string[], scopes: scopes as string[] },
      { ctx },
    );
    return data<CreateActionData>(
      {
        ok: true,
        uid: result.application.uid,
        name: result.application.name,
        clientId: result.application.clientId,
        clientSecret: result.clientSecret,
        scopes: result.application.scopes,
      },
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof OAuthApplicationInputError) {
      return data<CreateActionData>(
        { ok: false, field: error.field, index: error.index, message: error.message },
        { status: 400, headers: privateHeaders },
      );
    }
    console.error("[developers/applications/new] failed to create OAuth application", sanitizeErrorForLogging(error));
    return data<CreateActionData>(
      { ok: false, message: "애플리케이션을 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500, headers: privateHeaders },
    );
  }
}

export default function NewDeveloperApplication() {
  const { applications, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [name, setName] = useState("");
  const [redirectUris, setRedirectUris] = useState(() => [{ id: crypto.randomUUID(), value: "" }]);
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const result = actionData?.ok ? actionData : null;
  const error = actionData && !actionData.ok ? actionData : null;

  if (result) {
    const createdApplication = { uid: result.uid, name: result.name, scopes: result.scopes };
    const displayedApplications = applications.some((application) => application.uid === result.uid)
      ? applications
      : [createdApplication, ...applications];

    return (
      <PageMain>
        <div className="@container space-y-v2-block-gap">
          <header className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">애플리케이션</h2>
            <Button type="button" variant="primary" disabled className="disabled:bg-v2-inset">
              새 애플리케이션
            </Button>
          </header>
          <section className="space-y-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p" aria-labelledby="application-created-title">
            <h3 id="application-created-title" className="text-base font-semibold">
              애플리케이션을 만들었어요
            </h3>
            <StatusNotice tone="warning">
              <span className="font-semibold">Client Secret은 지금만 확인할 수 있어요.</span>
            </StatusNotice>
            <RevealedField label="Client ID" value={result.clientId} />
            <RevealedField label="Client Secret" value={result.clientSecret} />
            <footer className="flex flex-wrap items-center justify-end gap-4">
              <Link
                to="/developers/docs#oauth"
                className="text-sm font-medium text-v2-link underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                {...getV2LinkTransitionProps("crossfade")}
              >
                OAuth 문서
              </Link>
              <Button type="button" variant="secondary" onClick={() => navigate(`/developers/applications/${result.uid}`)}>
                확인했어요
              </Button>
            </footer>
          </section>
          {loadError ? (
            <p role="alert" className="text-sm text-v2-danger">
              애플리케이션 목록을 불러오지 못했어요.
            </p>
          ) : null}
          <nav aria-label="내 애플리케이션">
            <ul className="overflow-hidden rounded-lg bg-v2-surface">
              {displayedApplications.map((application) => (
                <li key={application.uid}>
                  <Link
                    to={`/developers/applications/${application.uid}`}
                    className="flex min-h-v2-row-min min-w-0 items-center gap-3 px-4 py-3 text-v2-fg transition-colors hover:bg-v2-filled-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                    {...getV2LinkTransitionProps("crossfade")}
                  >
                    <Squares2X2Icon aria-hidden="true" className="size-4 shrink-0 text-v2-fg-tertiary" />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="min-w-0 flex-[1_1_auto] break-words">{application.name}</span>
                      <span className="ml-auto max-w-full shrink-0 break-words text-right text-sm text-v2-fg-tertiary">
                        {getDeveloperScopeSummary(application.scopes)}
                      </span>
                    </span>
                    <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-v2-fg-tertiary" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <section className="space-y-v2-block-gap rounded-lg bg-v2-surface p-v2-block-p" aria-labelledby="new-application-title">
        <h2 id="new-application-title" className="text-lg font-semibold">
          새 애플리케이션
        </h2>
        <Form method="post" className="space-y-v2-block-gap">
          <div>
            <label htmlFor="application-name" className="block text-sm font-medium">
              이름
            </label>
            <input
              id="application-name"
              name="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              aria-invalid={error?.field === "name" ? true : undefined}
              aria-describedby={error?.field === "name" ? "application-name-error" : undefined}
              className="mt-2 min-h-v2-input-min w-full max-w-md rounded-md border border-v2-control-border bg-v2-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
            />
            {error?.field === "name" ? <p id="application-name-error" className="mt-1 text-sm text-v2-danger">{error.message}</p> : null}
          </div>

          <fieldset className="space-y-2" aria-describedby={error?.field === "redirectUris" && error.index === undefined ? "application-redirect-error" : undefined}>
            <legend className="flex w-full items-center justify-between gap-3 text-sm font-semibold">
              <span>Redirect URI</span>
              <span className="text-xs font-normal text-v2-fg-tertiary">{redirectUris.length}/5</span>
            </legend>
            <ul className="space-y-2">
              {redirectUris.map(({ id, value }, index) => {
                const uriError = error?.field === "redirectUris" && error.index === index ? error.message : undefined;
                return (
                  <li key={id} className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`application-redirect-uri-${index}`} className="sr-only">
                        Redirect URI {index + 1}
                      </label>
                      <input
                        id={`application-redirect-uri-${index}`}
                        name="redirectUris"
                        type="url"
                        required
                        value={value}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setRedirectUris((current) => current.map((row) => row.id === id ? { ...row, value } : row));
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
                      onClick={() => setRedirectUris((current) => current.filter((row) => row.id !== id))}
                    />
                  </li>
                );
              })}
            </ul>
            {error?.field === "redirectUris" && error.index === undefined ? (
              <p id="application-redirect-error" className="text-sm text-v2-danger">{error.message}</p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="link"
                disabled={redirectUris.length >= 5 || isSubmitting}
                onClick={() => setRedirectUris((current) => [...current, { id: crypto.randomUUID(), value: "" }])}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                주소 추가
              </Button>
            </div>
          </fieldset>

          <ApplicationPermissionMatrix scopes={scopes} onChange={setScopes} error={error?.field === "scopes" ? error.message : undefined} />
          {error && !error.field ? <StatusNotice tone="danger">{error.message}</StatusNotice> : null}
          <footer className="flex flex-wrap justify-end gap-2">
            <Link
              to="/developers/applications"
              className="inline-flex min-h-8 items-center rounded-md px-3 text-sm font-medium text-v2-fg-secondary hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
              {...getV2LinkTransitionProps("reverse")}
            >
              취소
            </Link>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "만드는 중..." : "만들기"}
            </Button>
          </footer>
        </Form>
      </section>
    </PageMain>
  );
}

function RevealedField({ label, value }: { label: string; value: string }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor={`revealed-${label.replaceAll(" ", "-").toLowerCase()}`} className="mb-2 block text-sm font-medium">
            {label}
          </label>
          <input
            id={`revealed-${label.replaceAll(" ", "-").toLowerCase()}`}
            type="text"
            value={value}
            readOnly
            autoComplete="off"
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-v2-input-min w-full rounded-md border border-v2-control-border bg-v2-surface px-3 font-mono text-xs text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
          />
        </div>
        <CopyTextButton
          value={value}
          label="복사하기"
          variant="text"
          buttonVariant="secondary"
          accessibleContext={label}
          onStatusChange={setCopyStatus}
        />
      </div>
      <CopyStatusMessage status={copyStatus} />
    </div>
  );
}
