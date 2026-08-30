import { describe, expect, it } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { loader, meta } from "~/routes/letter.$shareToken";

function loaderArgs(shareToken: string, userAgent?: string): LoaderFunctionArgs {
  const url = new URL(`https://mollulog.net/letter/${shareToken}`);
  return {
    context: {} as LoaderFunctionArgs["context"],
    params: { shareToken },
    pattern: "/letter/:shareToken",
    request: new Request(url, userAgent ? { headers: { "user-agent": userAgent } } : undefined),
    url,
  };
}

function expectRedirect(response: ReturnType<typeof loader>): asserts response is Response {
  expect(response).toBeInstanceOf(Response);
  if (!(response instanceof Response)) throw new Error("Expected a redirect response");
}

describe("letter share redirect", () => {
  it("redirects a share token to the campaign referral URL", () => {
    const shareToken = "a".repeat(32);
    const response = loader(loaderArgs(shareToken));

    expectRedirect(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/security-campaign?ref=${shareToken}`);
  });

  it("drops an invalid share token", () => {
    const response = loader(loaderArgs("invalid"));

    expectRedirect(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/security-campaign");
  });

  it("serves share preview metadata to social crawlers without redirecting", () => {
    const shareToken = "a".repeat(32);

    expect(loader(loaderArgs(shareToken, "Twitterbot/1.0"))).toBeNull();
    expect(meta({} as Parameters<typeof meta>[0])).toEqual(
      expect.arrayContaining([
        { property: "og:title", content: "이 편지는 트리니티에서 시작되어..." },
        {
          property: "og:description",
          content: "선생님께 도착한 링크가 있어요.",
        },
        { name: "robots", content: "noindex,nofollow" },
      ]),
    );
  });
});
