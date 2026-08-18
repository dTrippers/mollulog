import { type Cookie, createCookie } from "react-router";
import {
  DEFAULT_MOBILE_NAVIGATION_IDS,
  type MobileNavigationPair,
  normalizeMobileNavigationIds,
} from "~/domain/mobile-navigation";
import { normalizeNavigationFavoriteIds } from "~/domain/navigation-favorites";

let _preferenceCookie: Cookie;

export type Preference = {
  darkMode?: boolean;
  timeZone?: string;
  favoriteNavigationIds?: string[];
  mobileNavigationIds?: MobileNavigationPair;
};

const defaultPreference = {
  darkMode: true,
  timeZone: undefined,
  favoriteNavigationIds: [],
  mobileNavigationIds: DEFAULT_MOBILE_NAVIGATION_IDS,
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
    mobileNavigationIds: normalizeMobileNavigationIds(parsed.mobileNavigationIds),
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
