import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetSenseiByAuthIdentity = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAssertDiscordIdentityOwnership = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreatePendingSenseiRegistration = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("remix-auth", () => ({
  Authenticator: class Authenticator {},
  AuthorizationError: class AuthorizationError extends Error {},
  Strategy: class Strategy {},
}));
jest.mock("remix-auth-github", () => ({ GitHubStrategy: class GitHubStrategy {} }));
jest.mock("remix-auth-google", () => ({ GoogleStrategy: class GoogleStrategy {} }));
jest.mock("~/models/auth-identity", () => ({
  assertDiscordIdentityOwnership: (...args: unknown[]) => mockAssertDiscordIdentityOwnership(...args),
  getSenseiByAuthIdentity: (...args: unknown[]) => mockGetSenseiByAuthIdentity(...args),
}));
jest.mock("~/models/pending-sensei-registration", () => ({
  createPendingSenseiRegistration: (...args: unknown[]) => mockCreatePendingSenseiRegistration(...args),
}));

import { resolveProviderAuthentication } from "~/auth/authenticator.server";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const sensei = {
  id: 7,
  uid: "sensei-7",
  username: "teacher",
  friendCode: null,
  profileStudentId: null,
  bio: null,
  active: true,
  role: "guest" as const,
  profileVisibility: "public" as const,
};
const pending = { uid: "pending-1", provider: "discord" as const, providerUserId: "1234567890" };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSenseiByAuthIdentity.mockResolvedValue(null);
  mockAssertDiscordIdentityOwnership.mockResolvedValue(undefined);
  mockCreatePendingSenseiRegistration.mockResolvedValue(pending);
});

describe("Discord provider authentication resolution", () => {
  it("blocks a notification-only Discord owner instead of creating a login registration", async () => {
    const ownershipError = new Error("Discord ID already belongs to a notification connection");
    mockAssertDiscordIdentityOwnership.mockRejectedValueOnce(ownershipError);

    await expect(resolveProviderAuthentication(env, "discord", "1234567890")).rejects.toBe(ownershipError);
    expect(mockAssertDiscordIdentityOwnership).toHaveBeenCalledWith(env, undefined, "1234567890", { ctx: undefined });
    expect(mockCreatePendingSenseiRegistration).not.toHaveBeenCalled();
  });

  it("creates a pending registration only after an unowned Discord check", async () => {
    await expect(resolveProviderAuthentication(env, "discord", "1234567890")).resolves.toEqual({
      kind: "pending",
      registration: pending,
    });
    expect(mockAssertDiscordIdentityOwnership).toHaveBeenCalledWith(env, undefined, "1234567890", { ctx: undefined });
    expect(mockCreatePendingSenseiRegistration).toHaveBeenCalledWith(env, "discord", "1234567890", { ctx: undefined });
  });

  it("authenticates an existing Discord identity only after checking both ownership tables", async () => {
    mockGetSenseiByAuthIdentity.mockResolvedValueOnce(sensei);

    await expect(resolveProviderAuthentication(env, "discord", "1234567890")).resolves.toEqual({
      kind: "authenticated",
      sensei,
    });
    expect(mockAssertDiscordIdentityOwnership).toHaveBeenCalledWith(env, 7, "1234567890", { ctx: undefined });
    expect(mockCreatePendingSenseiRegistration).not.toHaveBeenCalled();
  });
});
