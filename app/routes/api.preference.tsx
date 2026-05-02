import { type ActionFunctionArgs, redirect } from "react-router";
import type { SubmitFunction } from "react-router";
import { getPreference, serializePreference, type Preference } from "~/auth/preference.server";
import { normalizeTimeZone } from "~/lib/date-time";

export async function submitPreference(fn: SubmitFunction, preference: Preference) {
  fn(preference, { method: "post", action: "/api/preference", encType: "application/json" });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const currentPreference = await getPreference(env, request);
  const submittedPreference = await request.json<Preference>();
  const newPreference: Preference = {
    ...currentPreference,
    ...submittedPreference,
    timeZone: submittedPreference.timeZone === undefined
      ? currentPreference.timeZone
      : normalizeTimeZone(submittedPreference.timeZone),
  };

  return redirect(request.headers.get("Referer") ?? "/", {
    headers: {
      "Set-Cookie": await serializePreference(env, newPreference),
    },
  });
}
