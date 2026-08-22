import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid/non-secure";
import { utcIsoString, withIdentityDatabase } from "~/db/postgres/identity";
import { pgPasskeysTable, pgSenseisTable } from "~/db/postgres/schema";
import { postgresUniqueConstraintName } from "~/lib/db";
import { type Sensei, toSenseiModel } from "./sensei";

export const PASSKEY_CHALLENGE_TTL_SECONDS = 120;
export const PASSKEY_CHALLENGE_TIMEOUT_MS = PASSKEY_CHALLENGE_TTL_SECONDS * 1000;

export type Passkey = {
  uid: string;
  memo: string;
  createdAt: string;
};

export type DBPasskey = {
  userId: number;
  keyId: string;
  publicKey: string;
  counter: number;
  rawRequest: string;
} & Passkey;

export const passkeysTable = pgPasskeysTable;

function uint8ArrayToBase64Url(uint8Array: Uint8Array) {
  const base64String = btoa(String.fromCodePoint(...uint8Array));
  return base64String.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToUint8Array(string: string) {
  const base64 = string.replaceAll("-", "+").replaceAll("_", "/");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.codePointAt(i) ?? 0;
  }
  return bytes;
}

function toPasskey(row: typeof pgPasskeysTable.$inferSelect): DBPasskey {
  return {
    uid: row.uid,
    userId: row.userId,
    memo: row.memo,
    keyId: row.keyId,
    publicKey: row.publicKey,
    rawRequest: row.rawRequest,
    counter: row.counter,
    createdAt: utcIsoString(row.createdAt),
  };
}

function toPublicPasskey(row: typeof pgPasskeysTable.$inferSelect): Passkey {
  return { uid: row.uid, memo: row.memo, createdAt: utcIsoString(row.createdAt) };
}

// Meta information for passkeys
export function passkeyRelyingParty(env: Env): { name: string; id: string } {
  return {
    name: "MolluLog | 몰루로그",
    id: env.HOST.replace(/^https?:\/\//, "").split(":")[0],
  };
}

function passkeyCreationOptionKey(sensei: Sensei): string {
  return `passkey:creationOptions:${sensei.id}`;
}

export async function createPasskeyCreationOptions(
  env: Env,
  sensei: Sensei,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const creationOptions: PublicKeyCredentialCreationOptionsJSON = {
    challenge: nanoid(64),
    rp: passkeyRelyingParty(env),
    user: {
      id: sensei.uid,
      name: sensei.username,
      displayName: sensei.username,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: PASSKEY_CHALLENGE_TIMEOUT_MS,
  };

  await env.KV_SESSION.put(passkeyCreationOptionKey(sensei), JSON.stringify(creationOptions), {
    expirationTtl: PASSKEY_CHALLENGE_TTL_SECONDS,
  });

  return creationOptions;
}

export async function verifyAndCreatePasskey(
  env: Env,
  sensei: Sensei,
  response: RegistrationResponseJSON,
): Promise<Passkey | null> {
  const creationOptionsRaw = await env.KV_SESSION.get(passkeyCreationOptionKey(sensei));
  if (!creationOptionsRaw) return null;

  const creationOptions: PublicKeyCredentialCreationOptionsJSON = JSON.parse(creationOptionsRaw);
  const verificationResult = await verifyRegistrationResponse({
    response,
    expectedChallenge: creationOptions.challenge,
    expectedOrigin: env.HOST,
    expectedRPID: passkeyRelyingParty(env).id,
    requireUserVerification: false,
  });
  if (!verificationResult.verified || !response.response.publicKey || !verificationResult.registrationInfo) {
    return null;
  }

  const { credential } = verificationResult.registrationInfo;
  const uid = nanoid(8);
  const memo = `Passkey #${nanoid(6)}`;
  const rawRequest = JSON.stringify(response);

  try {
    return await withIdentityDatabase(env, "create_passkey", async (db) => {
      const [row] = await db
        .insert(pgPasskeysTable)
        .values({
          uid,
          userId: sensei.id,
          memo,
          keyId: credential.id,
          publicKey: uint8ArrayToBase64Url(credential.publicKey),
          rawRequest,
          counter: 0,
        })
        .returning();
      return row ? toPublicPasskey(row) : null;
    });
  } catch (error) {
    const constraint = postgresUniqueConstraintName(error);
    if (constraint === "passkeys_key_id_uidx" || constraint === "passkeys_uid_uidx") return null;
    throw error;
  }
}

function passkeyAuthenticationOptionKey(challenge: string): string {
  return `passkey:authenticationOptions:${challenge}`;
}

export async function createPasskeyAuthenticationOptions(env: Env): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const challenge = nanoid(64);
  const authenticationOptions: PublicKeyCredentialRequestOptionsJSON = {
    challenge,
    rpId: passkeyRelyingParty(env).id,
    userVerification: "preferred",
    timeout: PASSKEY_CHALLENGE_TIMEOUT_MS,
  };
  await env.KV_SESSION.put(passkeyAuthenticationOptionKey(challenge), JSON.stringify(authenticationOptions), {
    expirationTtl: PASSKEY_CHALLENGE_TTL_SECONDS,
  });

  return authenticationOptions;
}

export async function verifyPasskeyAuthentication(
  env: Env,
  response: AuthenticationResponseJSON,
): Promise<Sensei | null> {
  const passkey = await withIdentityDatabase(env, "passkey_by_key_id", async (db) => {
    const [row] = await db.select().from(pgPasskeysTable).where(eq(pgPasskeysTable.keyId, response.id)).limit(1);
    return row ? toPasskey(row) : null;
  });
  if (!passkey) return null;

  const verificationResult = await verifyAuthenticationResponse({
    response,
    expectedChallenge: async (challenge) => {
      return (await env.KV_SESSION.get(passkeyAuthenticationOptionKey(challenge))) != null;
    },
    expectedOrigin: env.HOST,
    expectedRPID: passkeyRelyingParty(env).id,
    requireUserVerification: false,
    credential: {
      id: passkey.keyId,
      publicKey: base64UrlToUint8Array(passkey.publicKey),
      counter: passkey.counter,
    },
  });
  if (!verificationResult.verified) return null;

  const { newCounter } = verificationResult.authenticationInfo;
  return advancePasskeyCounterAndGetSensei(env, passkey, newCounter);
}

export async function advancePasskeyCounterAndGetSensei(
  env: Env,
  passkey: Pick<DBPasskey, "keyId" | "userId">,
  newCounter: number,
): Promise<Sensei | null> {
  return withIdentityDatabase(env, "advance_passkey_counter", async (db) => {
    const senseiRows = await db.transaction(async (tx) => {
      await tx
        .update(pgPasskeysTable)
        .set({ counter: sql`GREATEST(${pgPasskeysTable.counter}, ${newCounter})`, updatedAt: new Date() })
        .where(eq(pgPasskeysTable.keyId, passkey.keyId));
      return tx.select().from(pgSenseisTable).where(eq(pgSenseisTable.id, passkey.userId)).limit(1);
    });
    return senseiRows[0] ? toSenseiModel(senseiRows[0]) : null;
  });
}

export async function getPasskeysBySensei(env: Env, sensei: Sensei): Promise<Passkey[]> {
  return withIdentityDatabase(env, "passkeys_by_sensei", async (db) => {
    const rows = await db
      .select()
      .from(pgPasskeysTable)
      .where(eq(pgPasskeysTable.userId, sensei.id))
      .orderBy(asc(pgPasskeysTable.id));
    return rows.map(toPublicPasskey);
  });
}

export async function updatePasskeyMemo(env: Env, sensei: Sensei, uid: string, memo: string): Promise<void> {
  await withIdentityDatabase(env, "update_passkey_memo", async (db) => {
    await db
      .update(pgPasskeysTable)
      .set({ memo, updatedAt: new Date() })
      .where(and(eq(pgPasskeysTable.userId, sensei.id), eq(pgPasskeysTable.uid, uid)));
  });
}

export async function deletePasskey(env: Env, sensei: Sensei, uid: string): Promise<void> {
  await withIdentityDatabase(env, "delete_passkey", async (db) => {
    await db.delete(pgPasskeysTable).where(and(eq(pgPasskeysTable.userId, sensei.id), eq(pgPasskeysTable.uid, uid)));
  });
}
