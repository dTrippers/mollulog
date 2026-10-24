import { describe, expect, it } from "@jest/globals";
import {
  createOAuthApplication,
  OAuthApplicationInputError,
  updateOwnedOAuthApplication,
  validateOAuthRedirectUri,
} from "~/models/mollulog-oauth";

describe("OAuth redirect URI validation", () => {
  it.each([
    "https://example.com/callback",
    "https://localhost/callback",
    "http://localhost:3000/callback",
    "http://127.0.0.1:3000/callback?next=%2Fhome",
  ])("accepts secure or loopback URI %s", (uri) => {
    expect(validateOAuthRedirectUri(uri)).toBe(true);
  });

  it.each([
    "http://example.com/callback",
    "http://127.0.0.2/callback",
    "https://example.com/callback#fragment",
    "https://user:pass@example.com/callback",
    "javascript:alert(1)",
    " https://example.com/callback",
  ])("rejects an unsafe or invalid URI %s", (uri) => {
    expect(validateOAuthRedirectUri(uri)).toBe(false);
  });

  it("rejects more than five registered redirect URIs before accessing the database", async () => {
    await expect(
      createOAuthApplication({} as Env, 5, {
        name: "Tool",
        redirectUris: Array.from({ length: 6 }, (_, index) => `https://tool.example/callback/${index}`),
        scopes: ["profile"],
      }),
    ).rejects.toBeInstanceOf(OAuthApplicationInputError);
  });

  it.each(["create", "update"] as const)("requires at least one scope when applications are %s", async (operation) => {
    const input = { name: "Tool", redirectUris: ["https://tool.example/callback"], scopes: [] };
    const result =
      operation === "create"
        ? createOAuthApplication({} as Env, 5, input)
        : updateOwnedOAuthApplication({} as Env, 5, "app-uid", input);

    await expect(result).rejects.toMatchObject({
      field: "scopes",
      message: "권한을 하나 이상 선택해주세요",
    });
  });
});
