import { describe, expect, it } from "@jest/globals";
import {
  bytesToHex,
  defaultConnectApiKeyScopes,
  generateConnectApiKey,
  normalizeConnectApiKeyName,
  sha256Hex,
  toConnectApiKeyModel,
  toConnectApiKeyPrefix,
  toConnectApiKeyScopes,
} from "~/models/connect-api-key";

describe("connect-api-key", () => {
  it("derives the stable lookup prefix from the plaintext key", () => {
    expect(toConnectApiKeyPrefix("mlc_abcdefgh1234567890ABCDEFGHijkl")).toBe("mlc_abcdefgh");
  });

  it("hashes the full plaintext key as sha-256 hex", async () => {
    await expect(sha256Hex("mlc_abcdefgh1234567890ABCDEFGHijkl")).resolves.toBe(
      "b55e54170ce7a14362e4b02e64a9a83b43db62bd2498313fde2de605196036e6",
    );
  });

  it("generates a plaintext key, prefix, and hash without changing the random part", async () => {
    const generated = await generateConnectApiKey("abcdefgh1234567890ABCDEFGHijkl");

    expect(generated).toEqual({
      plaintext: "mlc_abcdefgh1234567890ABCDEFGHijkl",
      keyPrefix: "mlc_abcdefgh",
      keyHash: "b55e54170ce7a14362e4b02e64a9a83b43db62bd2498313fde2de605196036e6",
    });
  });

  it("normalizes and validates API key labels", () => {
    expect(normalizeConnectApiKeyName("  OCR 도구  ")).toBe("OCR 도구");
    expect(() => normalizeConnectApiKeyName("   ")).toThrow("API 키 이름을 입력해주세요.");
    expect(() => normalizeConnectApiKeyName("가".repeat(81))).toThrow("API 키 이름은 80자 이하로 입력해주세요.");
  });

  it("round-trips known scopes and ignores unsupported scopes", () => {
    expect(toConnectApiKeyScopes(JSON.stringify([...defaultConnectApiKeyScopes, "admin:write"]))).toEqual([
      "catalog:read",
      "draft:write",
    ]);
    expect(toConnectApiKeyScopes("not json")).toEqual([]);
  });

  it("does not expose keyHash from the database model converter", () => {
    const model = toConnectApiKeyModel({
      id: 1,
      uid: "key-a",
      userId: 10,
      name: "OCR 도구",
      keyPrefix: "mlc_abcdefgh",
      keyHash: "secret-hash",
      scopes: JSON.stringify(defaultConnectApiKeyScopes),
      createdAt: "2026-06-09 00:00:00",
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });

    expect(model).toEqual({
      uid: "key-a",
      userId: 10,
      name: "OCR 도구",
      keyPrefix: "mlc_abcdefgh",
      scopes: ["catalog:read", "draft:write"],
      createdAt: "2026-06-09 00:00:00",
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
    expect("keyHash" in model).toBe(false);
  });

  it("encodes bytes as lower-case hex", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]).buffer)).toBe("000f10ff");
  });
});
