import { nanoid } from "nanoid";
import { nanoid as nonSecureNanoid } from "nanoid/non-secure";
import {
  createPostgresConnectApiKey,
  listPostgresConnectApiKeys,
  revokePostgresConnectApiKey,
} from "~/db/postgres/connect-api-key";

const CONNECT_API_KEY_PREFIX = "mlc_";
const CONNECT_API_KEY_RANDOM_LENGTH = 32;
const CONNECT_API_KEY_PREFIX_RANDOM_LENGTH = 8;
const CONNECT_API_KEY_NAME_MAX_LENGTH = 80;

export const defaultConnectApiKeyScopes = [
  "catalog:read",
  "draft:write",
] as const satisfies readonly ConnectApiKeyScope[];

export type ConnectApiKeyScope = "catalog:read" | "draft:write";

export type ConnectApiKey = {
  uid: string;
  userId: number;
  name: string;
  keyPrefix: string;
  scopes: ConnectApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type GeneratedConnectApiKey = {
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
};

export type CreatedConnectApiKey = ConnectApiKey & {
  plaintext: string;
};

export function normalizeConnectApiKeyName(name: string): string {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("API 키 이름을 입력해주세요.");
  }
  if (normalizedName.length > CONNECT_API_KEY_NAME_MAX_LENGTH) {
    throw new Error(`API 키 이름은 ${CONNECT_API_KEY_NAME_MAX_LENGTH}자 이하로 입력해주세요.`);
  }
  return normalizedName;
}

export function toConnectApiKeyPrefix(plaintext: string): string {
  if (!plaintext.startsWith(CONNECT_API_KEY_PREFIX)) {
    throw new Error("유효하지 않은 API 키 형식이에요.");
  }

  return plaintext.slice(0, CONNECT_API_KEY_PREFIX.length + CONNECT_API_KEY_PREFIX_RANDOM_LENGTH);
}

export function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(digest);
}

export async function generateConnectApiKey(
  randomPart = nanoid(CONNECT_API_KEY_RANDOM_LENGTH),
): Promise<GeneratedConnectApiKey> {
  const plaintext = `${CONNECT_API_KEY_PREFIX}${randomPart}`;
  return {
    plaintext,
    keyPrefix: toConnectApiKeyPrefix(plaintext),
    keyHash: await sha256Hex(plaintext),
  };
}

export function toConnectApiKeyScopes(scopes: unknown): ConnectApiKeyScope[] {
  if (Array.isArray(scopes)) {
    return scopes.filter((scope): scope is ConnectApiKeyScope => scope === "catalog:read" || scope === "draft:write");
  }
  if (typeof scopes !== "string") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(scopes);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((scope): scope is ConnectApiKeyScope => scope === "catalog:read" || scope === "draft:write");
}

function toIso(value: Date | string | null): string | null {
  return value == null ? null : value instanceof Date ? value.toISOString() : value;
}

function requireIso(value: Date | string, field: string): string {
  const iso = toIso(value);
  if (!iso) throw new Error(`Missing required PostgreSQL timestamp: ${field}`);
  return iso;
}

export function toConnectApiKeyModel(apiKey: {
  id?: number;
  uid: string;
  userId: number;
  name: string;
  keyPrefix: string;
  keyHash?: string;
  scopes: unknown;
  createdAt: Date | string;
  expiresAt: Date | string | null;
  lastUsedAt: Date | string | null;
  revokedAt: Date | string | null;
}): ConnectApiKey {
  return {
    uid: apiKey.uid,
    userId: apiKey.userId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: toConnectApiKeyScopes(apiKey.scopes),
    createdAt: requireIso(apiKey.createdAt, "connect_api_keys.created_at"),
    expiresAt: toIso(apiKey.expiresAt),
    lastUsedAt: toIso(apiKey.lastUsedAt),
    revokedAt: toIso(apiKey.revokedAt),
  };
}

export async function createConnectApiKey(env: Env, userId: number, name: string): Promise<CreatedConnectApiKey> {
  const normalizedName = normalizeConnectApiKeyName(name);
  const generatedKey = await generateConnectApiKey();
  const uid = nonSecureNanoid(12);
  const createdApiKey = await createPostgresConnectApiKey(env, {
    uid,
    userId,
    name: normalizedName,
    keyPrefix: generatedKey.keyPrefix,
    keyHash: generatedKey.keyHash,
    scopes: [...defaultConnectApiKeyScopes],
  });

  return {
    ...toConnectApiKeyModel(createdApiKey),
    plaintext: generatedKey.plaintext,
  };
}

export async function listConnectApiKeys(env: Env, userId: number): Promise<ConnectApiKey[]> {
  const apiKeys = await listPostgresConnectApiKeys(env, userId);
  return apiKeys.map(toConnectApiKeyModel);
}

export async function revokeConnectApiKey(env: Env, userId: number, uid: string): Promise<void> {
  await revokePostgresConnectApiKey(env, userId, uid);
}
