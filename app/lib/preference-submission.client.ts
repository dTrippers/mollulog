import type { Preference } from "~/auth/preference.server";

let preferenceSubmissionQueue: Promise<unknown> = Promise.resolve();

export function submitPreference(preference: Preference): Promise<Response> {
  const submission = preferenceSubmissionQueue.then(() =>
    fetch("/api/preference", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preference),
    }).then((response) => {
      if (!response.ok) throw new Error("Preference update failed");
      return response;
    }),
  );
  preferenceSubmissionQueue = submission.catch(() => undefined);
  return submission;
}
