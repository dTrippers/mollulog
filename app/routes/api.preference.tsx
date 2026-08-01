import type { ActionFunctionArgs, SubmitFunction } from "react-router";
import { redirect } from "react-router";
import { getPreference, type Preference, serializePreference } from "~/auth/preference.server";
import { normalizeNavigationFavoriteIds } from "~/domain/navigation-favorites";
import { normalizeTimeZone } from "~/lib/date-time";

export async function submitPreference(fn: SubmitFunction, preference: Preference) {
  fn(preference, { method: "post", action: "/api/preference", encType: "application/json" });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const currentPreference = await getPreference(env, request);

  let submittedPreference: Record<string, unknown>;
  try {
    const parsed = await request.json<unknown>();
    submittedPreference = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const submittedFavoriteIds = submittedPreference.favoriteNavigationIds;
  const newPreference: Preference = {
    ...currentPreference,
    darkMode:
      typeof submittedPreference.darkMode === "boolean" ? submittedPreference.darkMode : currentPreference.darkMode,
    favoriteNavigationIds: Array.isArray(submittedFavoriteIds)
      ? normalizeNavigationFavoriteIds(submittedFavoriteIds)
      : currentPreference.favoriteNavigationIds,
    timeZone:
      submittedPreference.timeZone === undefined
        ? currentPreference.timeZone
        : normalizeTimeZone(
            typeof submittedPreference.timeZone === "string" ? submittedPreference.timeZone : undefined,
          ),
  };

  try {
    return redirect(request.headers.get("Referer") ?? "/", {
      headers: {
        "Set-Cookie": await serializePreference(env, newPreference),
      },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
