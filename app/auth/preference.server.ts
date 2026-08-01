import { type Cookie, createCookie } from "react-router";
import { normalizeNavigationFavoriteIds } from "~/domain/navigation-favorites";

let _preferenceCookie: Cookie;

export type Preference = {
  darkMode?: boolean;
  timeZone?: string;
  favoriteNavigationIds?: string[];
};

const defaultPreference = {
  darkMode: true,
  timeZone: undefined,
  favoriteNavigationIds: [],
};

export async function getPreference(env: Env, request: Request): Promise<Preference> {
  const cookie = getPreferenceCookie(env);
  const parsed = await cookie.parse(request.headers.get("Cookie"));
  return normalizePreference(parsed);
}

export function serializePreference(env: Env, newPreference: Preference): Promise<string> {
  const cookie = getPreferenceCookie(env);
  return cookie.serialize(normalizePreference(newPreference));
}

function normalizePreference(value: unknown): Preference {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    darkMode: typeof parsed.darkMode === "boolean" ? parsed.darkMode : defaultPreference.darkMode,
    timeZone: typeof parsed.timeZone === "string" ? parsed.timeZone : defaultPreference.timeZone,
    favoriteNavigationIds: normalizeNavigationFavoriteIds(parsed.favoriteNavigationIds),
  };
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
    maxAge: 400 * 24 * 60 * 60,
  });
  return _preferenceCookie;
}
