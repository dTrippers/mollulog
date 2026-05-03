import { describe, expect, it } from "@jest/globals";
import { getPreference, serializePreference } from "../../../app/auth/preference.server";
import { action } from "../../../app/routes/api.preference";

const env = { SESSION_SECRET: "test-secret" } as Env;

async function callAction(body: Record<string, unknown>, cookie?: string) {
  return action({
    request: new Request("https://mollulog.net/api/preference", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    context: { cloudflare: { env } },
    params: {},
  } as never);
}

describe("api.preference", () => {
  it("uses dark mode by default when no preference cookie exists", async () => {
    const preference = await getPreference(env, new Request("https://mollulog.net"));

    expect(preference.darkMode).toBe(true);
  });

  it("keeps an explicit light mode preference", async () => {
    const cookie = await serializePreference(env, { darkMode: false });
    const preference = await getPreference(
      env,
      new Request("https://mollulog.net", {
        headers: { Cookie: cookie },
      }),
    );

    expect(preference.darkMode).toBe(false);
  });

  it("merges timezone updates without dropping dark mode", async () => {
    const cookie = await serializePreference(env, { darkMode: true });
    const response = await callAction({ timeZone: "America/New_York" }, cookie);
    const setCookie = response.headers.get("Set-Cookie");

    const preference = await getPreference(
      env,
      new Request("https://mollulog.net", {
        headers: setCookie ? { Cookie: setCookie } : {},
      }),
    );

    expect(preference.darkMode).toBe(true);
    expect(preference.timeZone).toBe("America/New_York");
  });

  it("falls back to UTC for invalid timezone submissions", async () => {
    const response = await callAction({ timeZone: "Not/AZone" });
    const setCookie = response.headers.get("Set-Cookie");

    const preference = await getPreference(
      env,
      new Request("https://mollulog.net", {
        headers: setCookie ? { Cookie: setCookie } : {},
      }),
    );

    expect(preference.timeZone).toBe("UTC");
  });
});
