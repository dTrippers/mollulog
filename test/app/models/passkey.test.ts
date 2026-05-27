import { describe, expect, it, jest } from "@jest/globals";
import {
  PASSKEY_CHALLENGE_TIMEOUT_MS,
  PASSKEY_CHALLENGE_TTL_SECONDS,
  advancePasskeyCounterAndGetSensei,
  createPasskeyAuthenticationOptions,
  createPasskeyCreationOptions,
} from "../../../app/models/passkey";

type PreparedStatement = {
  sql: string;
  params: unknown[];
};

class FakeD1Statement {
  constructor(private readonly sql: string) {}

  bind(...params: unknown[]): PreparedStatement {
    return { sql: this.sql, params };
  }
}

class FakeD1Database {
  counter = 10;
  readonly keyId = "passkey-a";
  readonly sensei = {
    id: 1,
    uid: "sensei-a",
    username: "sensei",
    friendCode: null,
    profileStudentId: null,
    bio: null,
    googleId: null,
    githubId: null,
    role: "guest",
    active: 1,
  };

  readonly batch = jest.fn(async (statements: PreparedStatement[]) =>
    statements.map((statement) => this.execute(statement)),
  );

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(sql);
  }

  private execute(statement: PreparedStatement) {
    const normalizedSql = statement.sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();

    if (normalizedSql.startsWith("update passkeys set counter = max")) {
      const [newCounter, keyId] = statement.params;
      if (keyId === this.keyId) {
        this.counter = Math.max(this.counter, Number(newCounter));
        return { success: true, results: [], meta: { changes: 1 } };
      }
      return { success: true, results: [], meta: { changes: 0 } };
    }

    if (normalizedSql.startsWith("select")) {
      const [senseiId] = statement.params;
      const results = senseiId === this.sensei.id ? [this.sensei] : [];
      return { success: true, results, meta: { changes: 0 } };
    }

    throw new Error(`Unexpected SQL: ${statement.sql}`);
  }
}

function createEnv() {
  const db = new FakeD1Database();
  const kvSession = {
    put: jest.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  };
  return {
    db,
    kvSession,
    env: {
      DB: db,
      KV_SESSION: kvSession,
      HOST: "https://mollulog.net",
    } as unknown as Env,
  };
}

describe("passkey", () => {
  it("keeps registration challenge TTL aligned with the WebAuthn timeout", async () => {
    const { env, kvSession } = createEnv();

    const options = await createPasskeyCreationOptions(env, {
      id: 1,
      uid: "sensei-a",
      username: "sensei",
    } as never);

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

  it("advances the passkey counter and reads the sensei in one batch", async () => {
    const { db, env } = createEnv();

    const sensei = await advancePasskeyCounterAndGetSensei(env, { keyId: db.keyId, userId: db.sensei.id }, 12);

    expect(db.counter).toBe(12);
    expect(sensei?.username).toBe("sensei");
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.batch.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("does not let a stale authentication response move the counter backward", async () => {
    const { db, env } = createEnv();

    await advancePasskeyCounterAndGetSensei(env, { keyId: db.keyId, userId: db.sensei.id }, 8);

    expect(db.counter).toBe(10);
  });
});
