import { describe, expect, it } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { loader } from "~/routes/letter.$shareToken";

function loaderArgs(shareToken: string): LoaderFunctionArgs {
  const url = new URL(`https://mollulog.net/letter/${shareToken}`);
  return {
    context: {} as LoaderFunctionArgs["context"],
    params: { shareToken },
    pattern: "/letter/:shareToken",
    request: new Request(url),
    url,
  };
}

describe("letter share redirect", () => {
  it("redirects a share token to the campaign referral URL", () => {
    const shareToken = "a".repeat(32);
    const response = loader(loaderArgs(shareToken));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/security-campaign?ref=${shareToken}`);
  });

  it("drops an invalid share token", () => {
    const response = loader(loaderArgs("invalid"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/security-campaign");
  });
});
