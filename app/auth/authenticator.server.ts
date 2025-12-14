import type { SessionStorage } from "react-router";
import { createCookieSessionStorage } from "react-router";
import { Authenticator, AuthorizationError } from "remix-auth";
import { GoogleStrategy } from "remix-auth-google";
import type { Sensei } from "~/models/sensei";
import { getOrCreateSenseiByGoogleId } from "~/models/sensei";
import { PasskeyStrategy } from "./passkey-strategy.server";
import { verifyPasskeyAuthentication } from "~/models/passkey";

let _sessionStorage: SessionStorage;
let _authenticator: Authenticator<Sensei>;

const googleClientId = "129736193789-sqgen372tfq53l483j1v9br36uo4iuua.apps.googleusercontent.com";

export function redirectTo(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  const redirectTo = cookieHeader?.split("; ").find((row) => row.startsWith("redirectTo="))?.split("=")[1];
  if (redirectTo) {
    const decodedURIComponent = decodeURIComponent(redirectTo);
    if (decodedURIComponent.startsWith("/unauthorized")) {
      return null;
    }
    return decodedURIComponent;
  }
  return null;
}

export function sessionStorage(env: Env): SessionStorage {
  if (_sessionStorage) {
    return _sessionStorage;
  }

  _sessionStorage = createCookieSessionStorage({
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
  return _sessionStorage;
}

export function getAuthenticator(env: Env): Authenticator<Sensei> {
  if (_authenticator) {
    return _authenticator;
  }

  const authenticator = new Authenticator<Sensei>(sessionStorage(env));
  authenticator.use(new GoogleStrategy({
    clientID: googleClientId,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${env.HOST}/auth/google/callback`,
  }, async ({ extraParams }) => {
    try {
      const googleUserId = await fetchGoogleUserId(extraParams.id_token);
      return await getOrCreateSenseiByGoogleId(env, googleUserId);
    } catch (e) {
      console.error("Login failed");
      console.error(e);
      throw e;
    }
  }), "google");

  authenticator.use(new PasskeyStrategy<Sensei>(async ({ authenticationResponse }) => {
    const sensei = await verifyPasskeyAuthentication(env, authenticationResponse);
    if (!sensei) {
      console.error("Passkey not matched");
      throw new AuthorizationError("Passkey not matched");
    }
    return sensei;
  }), "passkey");

  _authenticator = authenticator;
  return authenticator;
}

async function fetchGoogleUserId(idToken: string): Promise<string> {
  const url = "https://oauth2.googleapis.com/tokeninfo";
  const res = await fetch(`${url}?id_token=${idToken}`);
  const body = await res.json<{ aud: string, sub: string }>();
  if (body.aud !== googleClientId) {
    throw new AuthorizationError("ClientID not matched!");
  }
  return body.sub;
}
