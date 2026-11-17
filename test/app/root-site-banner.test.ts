import { describe, expect, it, jest } from "@jest/globals";
import { serializePreference } from "~/auth/preference.server";
import type { SiteBanner } from "~/domain/site-banner";
import { loader } from "~/root";

jest.mock("../../app/tailwind.css?url", () => "tailwind.css", { virtual: true });

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: jest.fn(async () => null),
}));

jest.mock("~/views/navigation", () => ({
  getNavigationBarContents: jest.fn(async () => ({})),
}));

const banner: SiteBanner = {
  uid: "banner-1",
  message: "공지사항을 확인해 주세요.",
  link: "/news",
  colorPreset: "blue",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  screens: ["desktop_navigation", "mobile_header"],
};

jest.mock("~/views/site-banner", () => ({
  getSiteBanner: jest.fn(async () => banner),
}));

const env = { SESSION_SECRET: "test-secret" } as Env;
const span = { setAttribute: () => undefined };
const ctx = {
  tracing: { enterSpan: (_name: string, run: (activeSpan: typeof span) => unknown) => run(span) },
} as unknown as ExecutionContext;

async function loadSiteBanner(cookie?: string) {
  const data = await loader({
    request: new Request("https://mollulog.net/news", { headers: cookie ? { Cookie: cookie } : {} }),
    context: { cloudflare: { env, ctx } },
    params: {},
  } as never);
  return data.siteBanner;
}

describe("root loader site banner", () => {
  it("returns the active banner when it has not been dismissed", async () => {
    expect(await loadSiteBanner()).toEqual(banner);
  });

  it("drops a banner whose uid is in the preference cookie", async () => {
    const cookie = await serializePreference(env, { dismissedSiteBannerUids: ["banner-1"] });

    expect(await loadSiteBanner(cookie)).toBeNull();
  });

  it("keeps the banner when only other banners were dismissed", async () => {
    const cookie = await serializePreference(env, { dismissedSiteBannerUids: ["banner-0"] });

    expect(await loadSiteBanner(cookie)).toEqual(banner);
  });
});
