import {
  CheckIcon,
  ExclamationCircleIcon,
  UserCircleIcon,
  UsersIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import SenseiAvatar from "~/components/features/profile/SenseiAvatar";
import { Button } from "~/components/v2/primitives/Button";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  API_SCOPES,
  API_SCOPE_REGISTRY,
  apiScopesInclude,
  normalizeApiScopes,
  type ApiScope,
} from "~/domain/mollulog-api-spec";
import { getSenseiById, type Sensei } from "~/models/sensei";
import {
  getActiveOAuthGrant,
  getOAuthApplicationForClient,
  issueOAuthAuthorizationCode,
  OAuthInvalidGrantError,
  validateOAuthRedirectUri,
} from "~/models/mollulog-oauth";

const oauthHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
};

const csrfTokenSessionKey = "oauth:authorize:csrf";
const requestFingerprintSessionKey = "oauth:authorize:fingerprint";
const requestScopesSessionKey = "oauth:authorize:scopes";
const csrfUserIdSessionKey = "oauth:authorize:userId";

type OAuthParameters = {
  responseType: string | null;
  clientId: string | null;
  redirectUri: string | null;
  scope: string | null;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  duplicateFields: string[];
};

type OAuthApplicationInfo = {
  id: number;
  uid: string;
  name: string;
  scopes: ApiScope[];
  ownerUsername: string;
};

type ConsentScreenData = {
  kind: "consent" | "signed_out";
  application: OAuthApplicationInfo;
  redirectHost: string;
  redirectUri: string;
  parameters: OAuthParameters;
  scopes: ApiScope[];
  grantedScopes: ApiScope[];
  username: string | null;
  profileStudentId: string | null;
  csrfToken?: string;
};

type AuthorizeScreenData =
  | ConsentScreenData
  | { kind: "invalid"; reason: string }
  | { kind: "inactive"; username: string | null; profileStudentId: string | null };

export const meta: MetaFunction = () => [{ title: "몰루로그 계정으로 로그인" }];

export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  for (const [name, value] of Object.entries(oauthHeaders)) responseHeaders.set(name, value);
  return responseHeaders;
};

function readField(source: URLSearchParams | FormData, name: string): { value: string | null; duplicate: boolean } {
  const values = source.getAll(name);
  const first = values[0];
  return {
    value: typeof first === "string" ? first : null,
    duplicate: values.length > 1 || (values.length === 1 && typeof first !== "string"),
  };
}

function readOAuthParameters(source: URLSearchParams | FormData): OAuthParameters {
  const fields = [
    ["response_type", "responseType"],
    ["client_id", "clientId"],
    ["redirect_uri", "redirectUri"],
    ["scope", "scope"],
    ["state", "state"],
    ["code_challenge", "codeChallenge"],
    ["code_challenge_method", "codeChallengeMethod"],
  ] as const;
  const values = Object.fromEntries(fields.map(([name, key]) => [key, readField(source, name)])) as Record<
    (typeof fields)[number][1],
    { value: string | null; duplicate: boolean }
  >;

  return {
    responseType: values.responseType.value,
    clientId: values.clientId.value,
    redirectUri: values.redirectUri.value,
    scope: values.scope.value,
    state: values.state.value,
    codeChallenge: values.codeChallenge.value,
    codeChallengeMethod: values.codeChallengeMethod.value,
    duplicateFields: fields.filter(([name]) => readField(source, name).duplicate).map(([name]) => name),
  };
}

function fingerprintParameters(parameters: OAuthParameters, userId: number, scopes: readonly ApiScope[]): Promise<string> {
  const value = JSON.stringify({
    responseType: parameters.responseType,
    clientId: parameters.clientId,
    redirectUri: parameters.redirectUri,
    scope: parameters.scope,
    state: parameters.state,
    codeChallenge: parameters.codeChallenge,
    codeChallengeMethod: parameters.codeChallengeMethod,
    userId,
    scopes: normalizeApiScopes(scopes),
  });
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((hash) =>
    [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function errorRedirect(redirectUri: string, error: string, state: string | null): string {
  const callback = new URL(redirectUri);
  callback.searchParams.set("error", error);
  if (state !== null) callback.searchParams.set("state", state);
  return callback.toString();
}

function codeRedirect(redirectUri: string, code: string, state: string | null): string {
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state !== null) callback.searchParams.set("state", state);
  return callback.toString();
}

async function resolveAuthorizationRequest(
  env: Env,
  parameters: OAuthParameters,
  ctx?: ExecutionContext,
): Promise<
  | { kind: "invalid"; reason: string }
  | { kind: "redirect_error"; redirectTo: string }
  | {
      kind: "valid";
      application: OAuthApplicationInfo;
      redirectUri: string;
      redirectHost: string;
      scopes: ApiScope[];
    }
> {
  if (!parameters.clientId || parameters.duplicateFields.includes("client_id")) {
    return { kind: "invalid", reason: "애플리케이션 정보를 확인할 수 없어요." };
  }

  const client = await getOAuthApplicationForClient(env, parameters.clientId, { ctx });
  if (!client) return { kind: "invalid", reason: "애플리케이션 정보를 확인할 수 없어요." };

  const application: OAuthApplicationInfo = {
    id: client.application.id,
    uid: client.application.uid,
    name: client.application.name,
    scopes: normalizeApiScopes(client.application.scopes),
    ownerUsername: client.ownerUsername,
  };

  const redirectUri = parameters.redirectUri;
  if (
    !redirectUri ||
    parameters.duplicateFields.includes("redirect_uri") ||
    !applicationRedirectUriIsRegistered(client.application.redirectUris, redirectUri)
  ) {
    return { kind: "invalid", reason: "앱에 등록되지 않은 이동 주소예요." };
  }

  if (parameters.duplicateFields.length > 0) {
    return {
      kind: "redirect_error",
      redirectTo: errorRedirect(redirectUri, "invalid_request", parameters.state),
    };
  }

  if (parameters.responseType !== "code") {
    return {
      kind: "redirect_error",
      redirectTo: errorRedirect(redirectUri, "unsupported_response_type", parameters.state),
    };
  }

  if (parameters.scope !== null) {
    const requested = parameters.scope.trim() === "" ? [] : parameters.scope.trim().split(/\s+/);
    if (requested.some((scope) => !API_SCOPES.includes(scope as ApiScope))) {
      return { kind: "redirect_error", redirectTo: errorRedirect(redirectUri, "invalid_scope", parameters.state) };
    }
    const normalized = normalizeApiScopes(requested as ApiScope[]);
    if (normalized.join(" ") !== application.scopes.join(" ")) {
      return { kind: "redirect_error", redirectTo: errorRedirect(redirectUri, "invalid_scope", parameters.state) };
    }
  }

  const challengePresent = parameters.codeChallenge !== null;
  const methodPresent = parameters.codeChallengeMethod !== null;
  if (
    (challengePresent &&
      (parameters.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(parameters.codeChallenge ?? ""))) ||
    (!challengePresent && methodPresent)
  ) {
    return { kind: "redirect_error", redirectTo: errorRedirect(redirectUri, "invalid_request", parameters.state) };
  }

  return {
    kind: "valid",
    application,
    redirectUri,
    redirectHost: new URL(redirectUri).host,
    scopes: application.scopes,
  };
}

function applicationRedirectUriIsRegistered(registeredUris: readonly string[], redirectUri: string): boolean {
  return validateOAuthRedirectUri(redirectUri) && registeredUris.includes(redirectUri);
}

async function getCurrentSensei(
  env: Env,
  request: Request,
  ctx?: ExecutionContext,
): Promise<{ sessionUserId: number | null; sensei: Sensei | null }> {
  const sessionSensei = await getAuthenticator(env, ctx).isAuthenticated(request);
  if (!sessionSensei) return { sessionUserId: null, sensei: null };
  const sensei = await getSenseiById(env, sessionSensei.id, { ctx });
  return { sessionUserId: sessionSensei.id, sensei };
}

function invalidRequest(reason: string) {
  return data<AuthorizeScreenData>({ kind: "invalid", reason }, { status: 400, headers: oauthHeaders });
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const parameters = readOAuthParameters(new URL(request.url).searchParams);
  const authorization = await resolveAuthorizationRequest(env, parameters, ctx);
  if (authorization.kind === "invalid") return data<AuthorizeScreenData>(authorization, { headers: oauthHeaders });
  if (authorization.kind === "redirect_error") return redirect(authorization.redirectTo, { headers: oauthHeaders });

  const { sessionUserId, sensei } = await getCurrentSensei(env, request, ctx);
  if (!sessionUserId) {
    return data<AuthorizeScreenData>(
      {
        kind: "signed_out",
        application: authorization.application,
        redirectHost: authorization.redirectHost,
        redirectUri: authorization.redirectUri,
        parameters,
        scopes: authorization.scopes,
        grantedScopes: [],
        username: null,
        profileStudentId: null,
      },
      { headers: oauthHeaders },
    );
  }
  if (!sensei?.active) {
    return data<AuthorizeScreenData>(
      {
        kind: "inactive",
        username: sensei?.username ?? null,
        profileStudentId: sensei?.profileStudentId ?? null,
      },
      { headers: oauthHeaders },
    );
  }

  const grant = await getActiveOAuthGrant(env, authorization.application.id, sensei.id, { ctx });
  let consentAuthorization = authorization;
  let grantedScopes = grant?.scopes ?? [];
  if (grant && apiScopesInclude(grantedScopes, authorization.scopes)) {
    try {
      const code = await issueOAuthAuthorizationCode(
        env,
        {
          applicationId: authorization.application.id,
          applicationUid: authorization.application.uid,
          applicationName: authorization.application.name,
          userId: sensei.id,
          redirectUri: authorization.redirectUri,
          scopes: authorization.scopes,
          codeChallenge: parameters.codeChallenge,
          expectedGrantId: grant.id,
        },
        { ctx },
      );
      return redirect(codeRedirect(authorization.redirectUri, code, parameters.state), { headers: oauthHeaders });
    } catch (error) {
      if (!(error instanceof OAuthInvalidGrantError)) throw error;
      const current = await getSenseiById(env, sensei.id, { ctx });
      if (!current?.active) {
        return data<AuthorizeScreenData>(
          { kind: "inactive", username: current?.username ?? null, profileStudentId: current?.profileStudentId ?? null },
          { headers: oauthHeaders },
        );
      }
      const currentAuthorization = await resolveAuthorizationRequest(env, parameters, ctx);
      if (currentAuthorization.kind === "invalid") {
        return data<AuthorizeScreenData>(currentAuthorization, { headers: oauthHeaders });
      }
      if (currentAuthorization.kind === "redirect_error") {
        return redirect(currentAuthorization.redirectTo, { headers: oauthHeaders });
      }
      consentAuthorization = currentAuthorization;
      grantedScopes = [];
    }
  }

  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const csrfToken = randomToken();
  session.set(csrfTokenSessionKey, csrfToken);
  session.set(requestFingerprintSessionKey, await fingerprintParameters(parameters, sensei.id, consentAuthorization.scopes));
  session.set(requestScopesSessionKey, consentAuthorization.scopes);
  session.set(csrfUserIdSessionKey, sensei.id);
  const responseHeaders = new Headers(oauthHeaders);
  responseHeaders.set("Set-Cookie", await storage.commitSession(session));

  return data<AuthorizeScreenData>(
    {
      kind: "consent",
      application: consentAuthorization.application,
      redirectHost: consentAuthorization.redirectHost,
      redirectUri: consentAuthorization.redirectUri,
      parameters,
      scopes: consentAuthorization.scopes,
      grantedScopes,
      username: sensei.username,
      profileStudentId: sensei.profileStudentId,
      csrfToken,
    },
    { headers: responseHeaders },
  );
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidRequest("요청을 확인할 수 없어요.");
  }

  const parameters = readOAuthParameters(form);
  const csrfField = readField(form, "csrf");
  const decisionField = readField(form, "decision");

  if (decisionField.value === "deny" && !decisionField.duplicate) {
    if (parameters.duplicateFields.length > 0) return invalidRequest("요청을 확인할 수 없어요.");
    const authorization = await resolveAuthorizationRequest(env, parameters, ctx);
    if (authorization.kind === "invalid") {
      return data<AuthorizeScreenData>(authorization, { status: 400, headers: oauthHeaders });
    }
    if (authorization.kind === "redirect_error") {
      return redirect(authorization.redirectTo, { headers: oauthHeaders });
    }
    return redirect(errorRedirect(authorization.redirectUri, "access_denied", parameters.state), {
      headers: oauthHeaders,
    });
  }

  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie")).catch(() => null);
  if (!session) {
    return invalidRequest("요청을 확인할 수 없어요.");
  }

  const { sessionUserId, sensei } = await getCurrentSensei(env, request, ctx);
  const expectedCsrf = session.get(csrfTokenSessionKey) as string | undefined;
  const expectedFingerprint = session.get(requestFingerprintSessionKey) as string | undefined;
  const expectedScopes = session.get(requestScopesSessionKey) as ApiScope[] | undefined;
  const expectedUserId = session.get(csrfUserIdSessionKey) as number | undefined;
  if (
    !csrfField.value ||
    csrfField.duplicate ||
    csrfField.value !== expectedCsrf ||
    !expectedFingerprint ||
    !Array.isArray(expectedScopes) ||
    expectedScopes.some((scope) => !API_SCOPES.includes(scope)) ||
    parameters.duplicateFields.length > 0 ||
    !sessionUserId ||
    sessionUserId !== expectedUserId ||
    expectedFingerprint !== (await fingerprintParameters(parameters, sessionUserId, expectedScopes))
  ) {
    return invalidRequest("요청을 확인할 수 없어요.");
  }

  const authorization = await resolveAuthorizationRequest(env, parameters, ctx);
  if (authorization.kind === "invalid") return data<AuthorizeScreenData>(authorization, { status: 400, headers: oauthHeaders });
  if (authorization.kind === "redirect_error") return redirect(authorization.redirectTo, { headers: oauthHeaders });
  if (normalizeApiScopes(authorization.scopes).join(" ") !== normalizeApiScopes(expectedScopes).join(" ")) {
    return invalidRequest("요청한 권한이 변경됐어요. 다시 확인해주세요.");
  }
  if (!sensei?.active) {
    return data<AuthorizeScreenData>(
      { kind: "inactive", username: sensei?.username ?? null, profileStudentId: sensei?.profileStudentId ?? null },
      { headers: oauthHeaders },
    );
  }
  if (decisionField.duplicate || decisionField.value !== "allow") {
    return invalidRequest("요청을 확인할 수 없어요.");
  }

  try {
    const code = await issueOAuthAuthorizationCode(
      env,
      {
        applicationId: authorization.application.id,
        applicationUid: authorization.application.uid,
        applicationName: authorization.application.name,
        userId: sensei.id,
        redirectUri: authorization.redirectUri,
        scopes: authorization.scopes,
        codeChallenge: parameters.codeChallenge,
      },
      { ctx },
    );
    session.unset(csrfTokenSessionKey);
    session.unset(requestFingerprintSessionKey);
    session.unset(requestScopesSessionKey);
    session.unset(csrfUserIdSessionKey);
    const responseHeaders = new Headers(oauthHeaders);
    responseHeaders.set("Set-Cookie", await storage.commitSession(session));
    return redirect(codeRedirect(authorization.redirectUri, code, parameters.state), { headers: responseHeaders });
  } catch (error) {
    if (!(error instanceof OAuthInvalidGrantError)) throw error;
    const current = await getSenseiById(env, sensei.id, { ctx });
    if (!current?.active) {
      return data<AuthorizeScreenData>(
        { kind: "inactive", username: current?.username ?? null, profileStudentId: current?.profileStudentId ?? null },
        { headers: oauthHeaders },
      );
    }
    return data<AuthorizeScreenData>(
      { kind: "invalid", reason: "앱 정보를 확인할 수 없어요." },
      { status: 400, headers: oauthHeaders },
    );
  }
}

export default function OAuthAuthorize() {
  const loaderData = useLoaderData<typeof loader>() as AuthorizeScreenData;
  const actionData = useActionData<typeof action>() as AuthorizeScreenData | undefined;
  const screen = actionData ?? loaderData;

  if (screen.kind === "invalid") return <InvalidRequestScreen reason={screen.reason} />;
  if (screen.kind === "inactive") return <InactiveAccountScreen username={screen.username} profileStudentId={screen.profileStudentId} />;
  if (screen.kind === "signed_out") return <ConsentScreen data={screen} />;
  return <ConsentScreen data={screen} />;
}

function ConsentScreen({ data: screen }: { data: ConsentScreenData }) {
  const { showSignIn } = useSignIn();
  const signedIn = screen.kind === "consent";
  const granted = new Set(screen.grantedScopes);

  return (
    <main className="min-h-dvh bg-v2-canvas px-4 pb-8 pt-8 text-v2-fg md:pt-[12vh]">
      <div className="mx-auto w-full max-w-md">
        <ConsentTopBar username={screen.username} profileStudentId={screen.profileStudentId} />
        <section className="mt-4 rounded-lg bg-v2-surface p-4 md:p-5">
          <h2 className="break-words text-lg font-semibold">{screen.application.name}</h2>
          <dl className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-v2-fg-tertiary">개발자</dt>
            <dd className="min-w-0 break-words">{screen.application.ownerUsername}</dd>
            <dt className="text-v2-fg-tertiary">이동할 사이트</dt>
            <dd className="min-w-0 break-all">{screen.redirectHost}</dd>
          </dl>

          <ul aria-label="요청 권한" className="mt-4 space-y-3 rounded-lg bg-v2-inset p-3.5">
            {screen.scopes.map((scope) => {
              const wasGranted = granted.has(scope);
              const definition = API_SCOPE_REGISTRY[scope];
              return (
                <li key={scope} className="flex min-w-0 items-start gap-3">
                  <ScopeIcon scope={scope} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${wasGranted ? "text-v2-fg-secondary" : "text-v2-fg"}`}>
                      {definition.userLabel}
                    </p>
                    <p className={`mt-0.5 text-xs ${wasGranted ? "text-v2-fg-secondary" : "text-v2-fg-tertiary"}`}>
                      {definition.description}
                    </p>
                  </div>
                  {wasGranted ? (
                    <>
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-v2-success" aria-hidden="true" />
                      <span className="sr-only">이미 허용됨</span>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <Form method="post" action="/oauth/authorize" className="mt-4 flex items-center gap-2 md:justify-end">
            <AuthorizationFields parameters={screen.parameters} csrfToken={screen.csrfToken} />
            <Button type="submit" name="decision" value="deny" variant="secondary" className="shrink-0">
              취소
            </Button>
            {signedIn ? (
              <Button type="submit" name="decision" value="allow" variant="primary" className="min-w-0 flex-1 md:flex-none">
                허용하고 연결
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                className="min-w-0 flex-1 md:flex-none"
                onClick={showSignIn}
              >
                로그인하고 계속
              </Button>
            )}
          </Form>
        </section>
      </div>
    </main>
  );
}

function AuthorizationFields({ parameters, csrfToken }: { parameters: OAuthParameters; csrfToken?: string }) {
  return (
    <>
      {csrfToken !== undefined ? <input type="hidden" name="csrf" value={csrfToken} /> : null}
      <input type="hidden" name="response_type" value={parameters.responseType ?? ""} />
      <input type="hidden" name="client_id" value={parameters.clientId ?? ""} />
      <input type="hidden" name="redirect_uri" value={parameters.redirectUri ?? ""} />
      {parameters.scope !== null ? <input type="hidden" name="scope" value={parameters.scope} /> : null}
      {parameters.state !== null ? <input type="hidden" name="state" value={parameters.state} /> : null}
      {parameters.codeChallenge !== null ? (
        <input type="hidden" name="code_challenge" value={parameters.codeChallenge} />
      ) : null}
      {parameters.codeChallengeMethod !== null ? (
        <input type="hidden" name="code_challenge_method" value={parameters.codeChallengeMethod} />
      ) : null}
    </>
  );
}

function ConsentTopBar({ username, profileStudentId }: { username: string | null; profileStudentId: string | null }) {
  return (
    <header className="flex min-h-8 items-center justify-between gap-3">
      <h1 aria-label="몰루로그 계정으로 로그인" className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span className="flex min-w-0 items-center gap-2" aria-hidden="true">
          <img src="/mollulog-full-light.png" alt="" className="h-5 w-auto dark:hidden" />
          <img src="/mollulog-full-dark.png" alt="" className="hidden h-5 w-auto dark:block" />
          <span className="whitespace-nowrap text-v2-fg-secondary">계정으로 로그인</span>
        </span>
      </h1>
      {username ? (
        <div className="flex shrink-0 items-center gap-2 text-sm text-v2-fg-secondary">
          <ProfileAvatar profileStudentId={profileStudentId} />
          <span className="max-w-28 truncate">{username}</span>
        </div>
      ) : null}
    </header>
  );
}

function ProfileAvatar({ profileStudentId }: { profileStudentId: string | null }) {
  return <SenseiAvatar profileStudentId={profileStudentId} imageSize={6} />;
}

function ScopeIcon({ scope }: { scope: ApiScope }) {
  return scope === "profile" ? (
    <UserCircleIcon className="mt-0.5 size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
  ) : (
    <UsersIcon className="mt-0.5 size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
  );
}

function InvalidRequestScreen({ reason }: { reason: string }) {
  return (
    <main className="min-h-dvh bg-v2-canvas px-4 pb-8 pt-8 text-v2-fg md:pt-[12vh]">
      <div className="mx-auto w-full max-w-md">
        <ConsentTopBar username={null} profileStudentId={null} />
        <section className="mt-6 rounded-lg bg-v2-surface p-4 md:p-5">
          <div className="flex items-start gap-2">
            <XCircleIcon className="mt-0.5 size-5 shrink-0 text-v2-danger" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold">연결할 수 없는 요청이에요</h2>
              <p className="mt-1 text-sm text-v2-fg-secondary">{reason}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Link to="/" className={consentButtonClassName("secondary")}>
              몰루로그 홈
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function InactiveAccountScreen({ username, profileStudentId }: { username: string | null; profileStudentId: string | null }) {
  return (
    <main className="min-h-dvh bg-v2-canvas px-4 pb-8 pt-8 text-v2-fg md:pt-[12vh]">
      <div className="mx-auto w-full max-w-md">
        <ConsentTopBar username={username} profileStudentId={profileStudentId} />
        <section className="mt-6 rounded-lg bg-v2-surface p-4 md:p-5">
          <div className="flex items-start gap-2">
            <ExclamationCircleIcon className="mt-0.5 size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
            <h2 className="text-base font-semibold">이 계정으로는 연결할 수 없어요</h2>
          </div>
          <div className="mt-4 flex justify-end">
            <Link to="/" className={consentButtonClassName("secondary")}>
              돌아가기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function consentButtonClassName(variant: "primary" | "secondary") {
  return `inline-flex min-h-8 items-center justify-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus ${
    variant === "primary" ? "bg-v2-fg text-v2-canvas" : "bg-v2-inset text-v2-fg hover:bg-v2-filled-hover"
  }`;
}
