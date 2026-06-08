import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

const defaultConnectApiKeyScopes = '["catalog:read","draft:write"]';

export const connectApiKeysTable = sqliteTable("connect_api_keys", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  name: text().notNull(),
  keyPrefix: text().notNull(),
  keyHash: text().notNull(),
  scopes: text().notNull().default(defaultConnectApiKeyScopes),
  createdAt: text().notNull().default(sql`current_timestamp`),
  expiresAt: text(),
  lastUsedAt: text(),
  revokedAt: text(),
});

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

export function toConnectApiKeyScopes(scopes: string): ConnectApiKeyScope[] {
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

export function toConnectApiKeyModel(apiKey: typeof connectApiKeysTable.$inferSelect): ConnectApiKey {
  return {
    uid: apiKey.uid,
    userId: apiKey.userId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: toConnectApiKeyScopes(apiKey.scopes),
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
  };
}
