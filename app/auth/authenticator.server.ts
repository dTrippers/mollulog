import type { SessionStorage } from "react-router";
import { createCookieSessionStorage, redirect } from "react-router";
import { Authenticator, AuthorizationError } from "remix-auth";
import { GitHubStrategy } from "remix-auth-github";
import { GoogleStrategy } from "remix-auth-google";
import { getLogger } from "~/lib/observability.server";
import { type AuthProvider, getSenseiByAuthIdentity, linkAuthIdentity } from "~/models/auth-identity";
import { verifyPasskeyAuthentication } from "~/models/passkey";
import { createPendingSenseiRegistration } from "~/models/pending-sensei-registration";
import type { Sensei } from "~/models/sensei";
import { getSenseiById } from "~/models/sensei";
import { PasskeyStrategy } from "./passkey-strategy.server";

const googleClientId = "129736193789-sqgen372tfq53l483j1v9br36uo4iuua.apps.googleusercontent.com";
export const pendingSenseiRegistrationSessionKey = "pendingSenseiRegistrationUid";
export const authenticatorSessionKey = "user";
export const sessionValidationSessionKey = "auth:sessionValidation";
export const sessionValidationCookieName = "__session_validation";

export function redirectTo(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  const redirectTo = cookieHeader
    ?.split("; ")
    .find((row) => row.startsWith("redirectTo="))
    ?.split("=")[1];
  if (redirectTo) {
    const decodedURIComponent = decodeURIComponent(redirectTo);
    if (decodedURIComponent.startsWith("/unauthorized")) {
      return null;
    }
    return decodedURIComponent;
  }
  return null;
}

export function sessionStorage(env: Pick<Env, "SESSION_SECRET">): SessionStorage {
  return createCookieSessionStorage({
    cookie: {
      name: "__session",
      path: "/",
      httpOnly: true,
      secure: true,
      secrets: [env.SESSION_SECRET],
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    },
  });
}

export function sessionValidationStorage(env: Pick<Env, "SESSION_SECRET">): SessionStorage {
  return createCookieSessionStorage({
    cookie: {
      name: sessionValidationCookieName,
      path: "/",
      httpOnly: true,
      secure: true,
      secrets: [env.SESSION_SECRET],
      sameSite: "lax",
      maxAge: 15 * 60,
    },
  });
}

export function getAuthenticator(env: Env, ctx?: ExecutionContext): Authenticator<Sensei> {
  const logger = getLogger(env, ctx, { scope: "authenticator" });
  const authenticator = new Authenticator<Sensei>(sessionStorage(env), {
    sessionKey: authenticatorSessionKey,
  });
  authenticator.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.HOST}/auth/google/callback`,
        prompt: "select_account",
      },
      async ({ extraParams, request }) => {
        try {
          const googleUserId = await fetchGoogleUserId(extraParams.id_token);
          return await authenticateProvider(env, request, "google", googleUserId, ctx);
        } catch (e) {
          if (e instanceof Response) {
            throw e;
          }
          logger.error("Google login failed", e);
          throw e;
        }
      },
    ),
    "google",
  );

  authenticator.use(
    new GitHubStrategy(
      {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectURI: `${env.HOST}/auth/github/callback`,
        scopes: ["read:user"],
      },
      async ({ profile, request }) => {
        try {
          return await authenticateProvider(env, request, "github", profile.id, ctx);
        } catch (e) {
          if (e instanceof Response) {
            throw e;
          }
          logger.error("GitHub login failed", e);
          throw e;
        }
      },
    ),
    "github",
  );

  authenticator.use(
    new PasskeyStrategy<Sensei>(async ({ authenticationResponse }) => {
      const sensei = await verifyPasskeyAuthentication(env, authenticationResponse, { ctx });
      if (!sensei) {
        logger.error("Passkey not matched");
        throw new AuthorizationError("Passkey not matched");
      }
      return sensei;
    }),
    "passkey",
  );

  return authenticator;
}

export function getLinkAuthenticator(env: Env, ctx?: ExecutionContext): Authenticator<Sensei> {
  const logger = getLogger(env, ctx, { scope: "link-authenticator" });
  const authenticator = new Authenticator<Sensei>(sessionStorage(env), {
    sessionKey: "auth:linkUser",
    sessionStrategyKey: "auth:linkStrategy",
    sessionErrorKey: "auth:linkError",
  });

  authenticator.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.HOST}/auth/google/link/callback`,
        prompt: "select_account",
      },
      async ({ extraParams, request }) => {
        try {
          const googleUserId = await fetchGoogleUserId(extraParams.id_token);
          return await linkProvider(env, request, "google", googleUserId, ctx);
        } catch (e) {
          if (e instanceof Response) {
            throw e;
          }
          logger.error("Google account link failed", e);
          throw e;
        }
      },
    ),
    "google-link",
  );

  authenticator.use(
    new GitHubStrategy(
      {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectURI: `${env.HOST}/auth/github/link/callback`,
        scopes: ["read:user"],
      },
      async ({ profile, request }) => {
        try {
          return await linkProvider(env, request, "github", profile.id, ctx);
        } catch (e) {
          if (e instanceof Response) {
            throw e;
          }
          logger.error("GitHub account link failed", e);
          throw e;
        }
      },
    ),
    "github-link",
  );

  return authenticator;
}

export async function getActiveSensei(
  env: Env,
  request: Request,
  ctx?: ExecutionContext,
  options: { successRedirect?: string; failureRedirect?: string; headers?: HeadersInit } = {},
): Promise<Sensei | null> {
  const sensei = await getAuthenticator(env, ctx).isAuthenticated(request);
  if (sensei?.active) {
    if (options.successRedirect) {
      throw redirect(options.successRedirect, { headers: options.headers });
    }
    return sensei;
  }

  if (options.failureRedirect) {
    throw redirect(options.failureRedirect, { headers: options.headers });
  }

  return null;
}

export async function getPendingSenseiRegistrationUid(env: Env, request: Request): Promise<string | null> {
  const session = await sessionStorage(env).getSession(request.headers.get("Cookie"));
  return session.get(pendingSenseiRegistrationSessionKey) ?? null;
}

async function authenticateProvider(
  env: Env,
  request: Request,
  provider: AuthProvider,
  providerUserId: string,
  ctx?: ExecutionContext,
): Promise<Sensei> {
  const options = { ctx };
  const sensei = await getSenseiByAuthIdentity(env, provider, providerUserId, options);
  if (sensei) {
    return sensei;
  }

  const pendingRegistration = await createPendingSenseiRegistration(env, provider, providerUserId, options);
  const authenticator = getAuthenticator(env, ctx);
  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.unset(authenticator.sessionKey);
  session.set(pendingSenseiRegistrationSessionKey, pendingRegistration.uid);
  throw redirect("/register", {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

async function linkProvider(
  env: Env,
  request: Request,
  provider: AuthProvider,
  providerUserId: string,
  ctx?: ExecutionContext,
): Promise<Sensei> {
  const authenticator = getAuthenticator(env, ctx);
  const storage = sessionStorage(env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const sessionSensei = session.get(authenticator.sessionKey) as Sensei | undefined;
  if (!sessionSensei?.active) {
    throw redirect("/edit?auth_error=signin_required");
  }

  const sensei = await getSenseiById(env, sessionSensei.id, { ctx });
  if (!sensei?.active) {
    throw redirect("/edit?auth_error=signin_required");
  }

  const result = await linkAuthIdentity(env, sensei.id, provider, providerUserId, { ctx });
  if (!result.ok) {
    throw redirect("/edit?auth_error=identity_in_use");
  }

  throw redirect("/edit?auth=linked");
}

async function fetchGoogleUserId(idToken: string): Promise<string> {
  const url = "https://oauth2.googleapis.com/tokeninfo";
  const res = await fetch(`${url}?id_token=${idToken}`);
  const body = await res.json<{ aud: string; sub: string }>();
  if (body.aud !== googleClientId) {
    throw new AuthorizationError("ClientID not matched!");
  }
  return body.sub;
}
