import { type Cookie, createCookie } from "react-router";

let _preferenceCookie: Cookie;

export type Preference = {
  darkMode?: boolean;
};

const defaultPreference = {
  darkMode: false,
};

export async function getPreference(env: Env, request: Request): Promise<Preference> {
  const cookie = getPreferenceCookie(env);
  const parsed = await cookie.parse(request.headers.get("Cookie"));
  if (parsed) {
    return {
      ...defaultPreference,
      ...parsed as Preference
    };
  }
  return defaultPreference;
}

export function serializePreference(env: Env, newPreference: Preference): Promise<string> {
  const cookie = getPreferenceCookie(env);
  return cookie.serialize(newPreference);
}

function getPreferenceCookie(env: Env) {
  if (_preferenceCookie) {
    return _preferenceCookie;
  }

  _preferenceCookie = createCookie("preference", {
    path: "/",
    httpOnly: true,
    secure: true,
    secrets: [env.SESSION_SECRET],
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
  });
  return _preferenceCookie;
}
