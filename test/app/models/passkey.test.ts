import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWithIdentityDatabase = jest.fn();
const mockVerifyRegistrationResponse = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockVerifyAuthenticationResponse = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("@simplewebauthn/server", () => ({
  verifyRegistrationResponse: (...args: unknown[]) => mockVerifyRegistrationResponse(...args),
  verifyAuthenticationResponse: (...args: unknown[]) => mockVerifyAuthenticationResponse(...args),
}));
const mockIdentityDb = {
  transaction: jest.fn(),
  update: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
};

jest.mock("~/db/postgres/identity", () => ({
  withIdentityDatabase: (...args: unknown[]) => mockWithIdentityDatabase(...args),
  utcIsoString: (value: Date | string) => (value instanceof Date ? value.toISOString() : value),
}));

import type { Sensei } from "~/models/sensei";
import {
  advancePasskeyCounterAndGetSensei,
  createPasskeyAuthenticationOptions,
  createPasskeyCreationOptions,
  PASSKEY_CHALLENGE_TIMEOUT_MS,
  PASSKEY_CHALLENGE_TTL_SECONDS,
  verifyAndCreatePasskey,
  verifyPasskeyAuthentication,
} from "../../../app/models/passkey";

const sensei: Sensei = {
  id: 1,
  uid: "sensei-a",
  username: "sensei",
  friendCode: null,
  profileStudentId: null,
  bio: null,
  profileVisibility: "public",
  role: "guest",
  active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyRegistrationResponse.mockReset();
  mockVerifyAuthenticationResponse.mockReset();
  transactionUpdateSet = jest.fn(() => ({ where: jest.fn(async () => undefined) }));
  const tx = {
    update: jest.fn(() => ({
      set: transactionUpdateSet,
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({ limit: jest.fn(async () => [sensei]) })),
      })),
    })),
  };
  mockIdentityDb.transaction.mockImplementation(async (operation: unknown) =>
    (operation as (value: typeof tx) => unknown)(tx),
  );
  mockIdentityDb.update.mockImplementation(() => ({
    set: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
  }));
  mockIdentityDb.insert.mockImplementation(() => ({
    values: jest.fn(() => ({ returning: jest.fn(async () => [passkeyRow]) })),
  }));
  mockIdentityDb.select.mockImplementation(() => ({
    from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn(async () => [sensei]) })) })),
  }));
  mockWithIdentityDatabase.mockImplementation(async (_env, _name, operation: unknown) =>
    (operation as (db: typeof mockIdentityDb) => unknown)(mockIdentityDb),
  );
});

let transactionUpdateSet: jest.Mock;

const passkeyRow = {
  id: 3,
  uid: "passkey-3",
  userId: 1,
  memo: "Passkey #1",
  keyId: "key-1",
  publicKey: "AQI",
  rawRequest: "{}",
  counter: 4,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

function createEnv() {
  const kvSession = {
    get: jest.fn<(_key: string) => Promise<string | null>>(async () => null),
    put: jest.fn<(...args: unknown[]) => Promise<void>>(async (..._args: unknown[]) => undefined),
  };
  return {
    kvSession,
    env: {
      KV_SESSION: kvSession,
      HOST: "https://mollulog.net",
      HYPERDRIVE: { connectionString: "postgres://unused" },
    } as unknown as Env,
  };
}

describe("passkey", () => {
  it("keeps registration challenge TTL aligned with the WebAuthn timeout", async () => {
    const { env, kvSession } = createEnv();
    const options = await createPasskeyCreationOptions(env, sensei);
    expect(options.timeout).toBe(PASSKEY_CHALLENGE_TIMEOUT_MS);
    expect(kvSession.put).toHaveBeenCalledWith("passkey:creationOptions:1", expect.any(String), {
      expirationTtl: PASSKEY_CHALLENGE_TTL_SECONDS,
    });
  });

  it("keeps authentication challenge TTL aligned with the WebAuthn timeout", async () => {
    const { env, kvSession } = createEnv();
    const options = await createPasskeyAuthenticationOptions(env);
    expect(options.timeout).toBe(PASSKEY_CHALLENGE_TIMEOUT_MS);
    expect(kvSession.put).toHaveBeenCalledWith(
      `passkey:authenticationOptions:${options.challenge}`,
      expect.any(String),
      { expirationTtl: PASSKEY_CHALLENGE_TTL_SECONDS },
    );
  });

  it("updates the counter and reads the sensei in one PostgreSQL transaction", async () => {
    const { env } = createEnv();
    const result = await advancePasskeyCounterAndGetSensei(env, { keyId: "passkey-a", userId: 1 }, 12);
    expect(result?.username).toBe("sensei");
    expect(mockIdentityDb.transaction).toHaveBeenCalledTimes(1);
    const tx = mockIdentityDb.transaction.mock.calls[0]?.[0];
    expect(tx).toEqual(expect.any(Function));
  });

  it("uses PostgreSQL GREATEST to prevent a stale counter from moving backward", async () => {
    const { env } = createEnv();
    await advancePasskeyCounterAndGetSensei(env, { keyId: "passkey-a", userId: 1 }, 8);
    expect(transactionUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ counter: expect.anything() }));
    const counterExpression = (transactionUpdateSet.mock.calls[0]?.[0] as { counter?: unknown } | undefined)?.counter;
    const chunks = (counterExpression as { queryChunks?: unknown[] }).queryChunks ?? [];
    expect(
      chunks.some((chunk) =>
        String((chunk as { value?: unknown }).value ?? "")
          .toLowerCase()
          .includes("greatest"),
      ),
    ).toBe(true);
  });

  it("persists a verified registration response in PostgreSQL", async () => {
    const { env, kvSession } = createEnv();
    kvSession.get.mockResolvedValueOnce(
      JSON.stringify({ challenge: "challenge", rp: { name: "MolluLog", id: "mollulog.net" } }),
    );
    mockVerifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: "key-1", publicKey: new Uint8Array([1, 2]), counter: 0 },
      },
    });

    await expect(
      verifyAndCreatePasskey(env, sensei, {
        id: "key-1",
        rawId: "key-1",
        response: { clientDataJSON: "", attestationObject: "", publicKey: "AQI" },
        type: "public-key",
      } as never),
    ).resolves.toMatchObject({ uid: "passkey-3", createdAt: "2026-08-01T00:00:00.000Z" });
    expect(mockIdentityDb.insert).toHaveBeenCalledTimes(1);
  });

  it("authenticates a passkey and advances its counter without a separate read connection", async () => {
    const { env, kvSession } = createEnv();
    mockIdentityDb.select.mockImplementationOnce(() => ({
      from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn(async () => [passkeyRow]) })) })),
    }));
    kvSession.get.mockResolvedValue(null);
    mockVerifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 12 },
    });

    await expect(
      verifyPasskeyAuthentication(env, {
        id: "key-1",
        rawId: "key-1",
        response: { clientDataJSON: "", authenticatorData: "", signature: "", userHandle: null },
        type: "public-key",
      } as never),
    ).resolves.toMatchObject({ id: 1, username: "sensei" });
    expect(mockIdentityDb.transaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdateSet).toHaveBeenCalled();
  });
});
