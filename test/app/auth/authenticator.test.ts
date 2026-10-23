import { describe, expect, it, jest } from "@jest/globals";

jest.mock("remix-auth-github", () => ({ GitHubStrategy: class GitHubStrategy {} }));
jest.mock("remix-auth-google", () => ({ GoogleStrategy: class GoogleStrategy {} }));

import { redirectTo } from "~/auth/authenticator.server";

describe("redirectTo", () => {
  it("returns a same-site path from the redirect cookie", () => {
    const request = new Request("https://mollulog.net/oauth/authorize", {
      headers: { Cookie: "redirectTo=%2Foauth%2Fauthorize%3Fclient_id%3Dapp" },
    });

    expect(redirectTo(request)).toBe("/oauth/authorize?client_id=app");
  });

  it.each(["https%3A%2F%2Fevil.example%2F", "%2F%2Fevil.example%2F", "%2F%5C%5Cevil.example%2F"])(
    "rejects a non-local redirect target",
    (encodedTarget) => {
      const request = new Request("https://mollulog.net/", {
        headers: { Cookie: `redirectTo=${encodedTarget}` },
      });

      expect(redirectTo(request)).toBeNull();
    },
  );
});
