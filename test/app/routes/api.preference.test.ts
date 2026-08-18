import { describe, expect, it } from "@jest/globals";
import { MAX_NAVIGATION_FAVORITE_IDS } from "~/domain/navigation-favorites";
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

  it("uses feed and students as the default mobile navigation pair", async () => {
    const preference = await getPreference(env, new Request("https://mollulog.net"));

    expect(preference.mobileNavigationIds).toEqual(["feed", "students"]);
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

  it("merges favorite-only updates without dropping existing preferences", async () => {
    const cookie = await serializePreference(env, {
      darkMode: false,
      timeZone: "Asia/Seoul",
      favoriteNavigationIds: ["profile"],
    });
    const response = await callAction(
      { favoriteNavigationIds: [" contact ", "profile", "contact", "missing"] },
      cookie,
    );
    const setCookie = response.headers.get("Set-Cookie");

    const preference = await getPreference(
      env,
      new Request("https://mollulog.net", {
        headers: setCookie ? { Cookie: setCookie } : {},
      }),
    );

    expect(preference.darkMode).toBe(false);
    expect(preference.timeZone).toBe("Asia/Seoul");
    expect(preference.favoriteNavigationIds).toEqual(["contact", "profile", "missing"]);
  });

  it("merges mobile navigation updates without dropping desktop favorites", async () => {
    const cookie = await serializePreference(env, {
      darkMode: false,
      favoriteNavigationIds: ["events"],
      mobileNavigationIds: ["feed", "students"],
    });
    const response = await callAction({ mobileNavigationIds: ["events", "raids"] }, cookie);
    const setCookie = response.headers.get("Set-Cookie");

    const preference = await getPreference(
      env,
      new Request("https://mollulog.net", {
        headers: setCookie ? { Cookie: setCookie } : {},
      }),
    );

    expect(preference.darkMode).toBe(false);
    expect(preference.favoriteNavigationIds).toEqual(["events"]);
    expect(preference.mobileNavigationIds).toEqual(["events", "raids"]);
  });

  it("restores the default mobile pair for invalid submissions", async () => {
    for (const mobileNavigationIds of [["events", "events"], "events", ["events"]]) {
      const response = await callAction({ mobileNavigationIds });
      const setCookie = response.headers.get("Set-Cookie");

      const preference = await getPreference(
        env,
        new Request("https://mollulog.net", {
          headers: setCookie ? { Cookie: setCookie } : {},
        }),
      );

      expect(preference.mobileNavigationIds).toEqual(["feed", "students"]);
    }
  });

  it("uses a 400-day max age for every serialized preference cookie", async () => {
    const cookie = await serializePreference(env, { darkMode: false });

    expect(cookie).toContain("Max-Age=34560000");
  });

  it("keeps a maximum normalized favorites preference below the cookie size limit", async () => {
    const favoriteNavigationIds = Array.from(
      { length: MAX_NAVIGATION_FAVORITE_IDS },
      (_, index) => `id-${String(index).padStart(2, "0")}-${"x".repeat(56)}`,
    );
    const cookie = await serializePreference(env, { favoriteNavigationIds });

    expect(cookie.length).toBeLessThan(4096);
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
