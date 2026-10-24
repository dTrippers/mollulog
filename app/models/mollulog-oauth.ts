import { and, desc, eq, gt, inArray, isNull, max } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import {
  pgOAuthAccessTokensTable,
  pgOAuthApplicationsTable,
  pgOAuthAuthorizationCodesTable,
  pgOAuthConnectionEventsTable,
  pgOAuthGrantsTable,
  pgSenseisTable,
} from "~/db/postgres/schema";
import { API_SCOPES, normalizeApiScopes, OAUTH_ACCESS_TOKEN_LIFETIME_MONTHS, OAUTH_AUTHORIZATION_CODE_LIFETIME_SECONDS } from "~/domain/mollulog-api-spec";
import type { ApiScope } from "~/domain/mollulog-api-spec";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type OAuthRepositoryOptions = { ctx?: ExecutionContext; createClient?: PostgresClientFactory };
type OAuthDatabase = NodePgDatabase;

export type OAuthApplication = {
  id: number;
  uid: string;
  ownerUserId: number;
  name: string;
  clientId: string;
  clientSecretPrefix: string;
  redirectUris: string[];
  scopes: ApiScope[];
  createdAt: Date;
  updatedAt: Date;
  clientSecretIssuedAt: Date;
  deletedAt: Date | null;
};

export type OAuthConnection = {
  id: number;
  applicationUid: string;
  applicationName: string;
  scopes: ApiScope[];
  connectedAt: Date;
  lastUsedAt: Date | null;
};

export type AuthenticatedOAuthToken = {
  kind: "oauth";
  uid: string;
  userId: number;
  scopes: ApiScope[];
  subject: string;
  applicationUid: string;
  applicationName: string;
};

export class OAuthApplicationInputError extends Error {
  constructor(
    message: string,
    readonly field: "name" | "redirectUris" | "scopes",
    readonly index?: number,
  ) {
    super(message);
  }
}

export class OAuthInvalidGrantError extends Error {}
export class OAuthInvalidClientError extends Error {}

async function withOAuthDatabase<T>(
  env: Env,
  options: OAuthRepositoryOptions,
  operation: (db: OAuthDatabase) => Promise<T>,
): Promise<T> {
  return withPostgresClient(
    env,
    (client) => operation(drizzle(client)),
    options.createClient ?? createPostgresClient,
    options.ctx,
  );
}

function toHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function addCalendarMonths(value: Date, months: number): Date {
  const target = new Date(value);
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function toApplication(row: typeof pgOAuthApplicationsTable.$inferSelect): OAuthApplication {
  return {
    id: row.id,
    uid: row.uid,
    ownerUserId: row.ownerUserId,
    name: row.name,
    clientId: row.clientId,
    clientSecretPrefix: row.clientSecretPrefix,
    redirectUris: row.redirectUris,
    scopes: normalizeApiScopes(row.scopes),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clientSecretIssuedAt: row.clientSecretIssuedAt,
    deletedAt: row.deletedAt,
  };
}

function validateName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > 80) {
    throw new OAuthApplicationInputError("이름은 1자부터 80자까지 입력해주세요.", "name");
  }
  return name;
}

export function validateOAuthRedirectUri(value: string): boolean {
  if (value.length === 0 || value !== value.trim() || value.includes("#")) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function validateRedirectUris(values: readonly string[]): string[] {
  if (values.length < 1 || values.length > 5) {
    throw new OAuthApplicationInputError("Redirect URI를 1개부터 5개까지 등록해주세요.", "redirectUris");
  }
  const invalidIndex = values.findIndex((value) => !validateOAuthRedirectUri(value));
  if (invalidIndex !== -1) {
    throw new OAuthApplicationInputError(
      "HTTPS 주소 또는 localhost HTTP 주소를 입력해주세요. fragment는 사용할 수 없어요.",
      "redirectUris",
      invalidIndex,
    );
  }
  const duplicateIndex = values.findIndex((value, index) => values.indexOf(value) !== index);
  if (duplicateIndex !== -1) {
    throw new OAuthApplicationInputError("같은 Redirect URI를 여러 번 등록할 수 없어요.", "redirectUris", duplicateIndex);
  }
  return [...values];
}

function validateScopes(values: readonly string[]): ApiScope[] {
  if (values.some((scope) => !API_SCOPES.includes(scope as ApiScope))) {
    throw new OAuthApplicationInputError("권한을 확인해주세요.", "scopes");
  }
  const scopes = normalizeApiScopes(values as ApiScope[]);
  if (scopes.length === 0) {
    throw new OAuthApplicationInputError("권한을 하나 이상 선택해주세요", "scopes");
  }
  return scopes;
}

export async function createOAuthApplication(
  env: Env,
  ownerUserId: number,
  input: { name: string; redirectUris: readonly string[]; scopes: readonly string[] },
  options: OAuthRepositoryOptions = {},
): Promise<{ application: OAuthApplication; clientSecret: string }> {
  const name = validateName(input.name);
  const redirectUris = validateRedirectUris(input.redirectUris);
  const scopes = validateScopes(input.scopes);
  const clientId = `mllg_oc_${randomHex(16)}`;
  const clientSecret = `mllg_os_${randomHex(32)}`;
  const now = new Date();
  const [row] = await withOAuthDatabase(env, options, async (db) =>
    db
      .insert(pgOAuthApplicationsTable)
      .values({
        uid: nanoid(12),
        ownerUserId,
        name,
        clientId,
        clientSecretHash: await sha256(clientSecret),
        clientSecretPrefix: clientSecret.slice(0, 17),
        redirectUris,
        scopes,
        createdAt: now,
        updatedAt: now,
        clientSecretIssuedAt: now,
      })
      .returning(),
  );
  if (!row) throw new Error("OAuth application was not created.");
  return { application: toApplication(row), clientSecret };
}

export async function getOAuthApplications(
  env: Env,
  ownerUserId: number,
  options: OAuthRepositoryOptions = {},
): Promise<OAuthApplication[]> {
  return withOAuthDatabase(env, options, async (db) => {
    const rows = await db
      .select()
      .from(pgOAuthApplicationsTable)
      .where(and(eq(pgOAuthApplicationsTable.ownerUserId, ownerUserId), isNull(pgOAuthApplicationsTable.deletedAt)))
      .orderBy(desc(pgOAuthApplicationsTable.createdAt), desc(pgOAuthApplicationsTable.id));
    return rows.map(toApplication);
  });
}

export async function getOwnedOAuthApplication(
  env: Env,
  ownerUserId: number,
  uid: string,
  options: OAuthRepositoryOptions = {},
): Promise<OAuthApplication | null> {
  return withOAuthDatabase(env, options, async (db) => {
    const [row] = await db
      .select()
      .from(pgOAuthApplicationsTable)
      .where(
        and(
          eq(pgOAuthApplicationsTable.ownerUserId, ownerUserId),
          eq(pgOAuthApplicationsTable.uid, uid),
          isNull(pgOAuthApplicationsTable.deletedAt),
        ),
      )
      .limit(1);
    return row ? toApplication(row) : null;
  });
}

export async function updateOwnedOAuthApplication(
  env: Env,
  ownerUserId: number,
  uid: string,
  input: { name: string; redirectUris: readonly string[]; scopes: readonly string[] },
  options: OAuthRepositoryOptions = {},
): Promise<OAuthApplication | null> {
  const name = validateName(input.name);
  const redirectUris = validateRedirectUris(input.redirectUris);
  const scopes = validateScopes(input.scopes);
  const [row] = await withOAuthDatabase(env, options, (db) =>
    db
      .update(pgOAuthApplicationsTable)
      .set({ name, redirectUris, scopes, updatedAt: new Date() })
      .where(
        and(
          eq(pgOAuthApplicationsTable.ownerUserId, ownerUserId),
          eq(pgOAuthApplicationsTable.uid, uid),
          isNull(pgOAuthApplicationsTable.deletedAt),
        ),
      )
      .returning(),
  );
  return row ? toApplication(row) : null;
}

export async function regenerateOAuthClientSecret(
  env: Env,
  ownerUserId: number,
  uid: string,
  options: OAuthRepositoryOptions = {},
): Promise<{ clientSecret: string; issuedAt: Date } | null> {
  const clientSecret = `mllg_os_${randomHex(32)}`;
  const issuedAt = new Date();
  const [row] = await withOAuthDatabase(env, options, async (db) =>
    db
      .update(pgOAuthApplicationsTable)
      .set({
        clientSecretHash: await sha256(clientSecret),
        clientSecretPrefix: clientSecret.slice(0, 17),
        clientSecretIssuedAt: issuedAt,
        updatedAt: issuedAt,
      })
      .where(
        and(
          eq(pgOAuthApplicationsTable.ownerUserId, ownerUserId),
          eq(pgOAuthApplicationsTable.uid, uid),
          isNull(pgOAuthApplicationsTable.deletedAt),
        ),
      )
      .returning({ uid: pgOAuthApplicationsTable.uid }),
  );
  return row ? { clientSecret, issuedAt } : null;
}

export async function deleteOwnedOAuthApplication(
  env: Env,
  ownerUserId: number,
  uid: string,
  options: OAuthRepositoryOptions = {},
): Promise<boolean> {
  const now = new Date();
  return withOAuthDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const [applicationRow] = await tx
        .update(pgOAuthApplicationsTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(pgOAuthApplicationsTable.ownerUserId, ownerUserId),
            eq(pgOAuthApplicationsTable.uid, uid),
            isNull(pgOAuthApplicationsTable.deletedAt),
          ),
        )
        .returning({ id: pgOAuthApplicationsTable.id, uid: pgOAuthApplicationsTable.uid, name: pgOAuthApplicationsTable.name });
      if (!applicationRow) return false;

      const grants = await tx
        .update(pgOAuthGrantsTable)
        .set({ disconnectedAt: now, updatedAt: now })
        .where(and(eq(pgOAuthGrantsTable.applicationId, applicationRow.id), isNull(pgOAuthGrantsTable.disconnectedAt)))
        .returning({ id: pgOAuthGrantsTable.id, userId: pgOAuthGrantsTable.userId, scopes: pgOAuthGrantsTable.scopes });
      if (grants.length > 0) {
        const grantIds = grants.map(({ id }) => id);
        await tx
          .update(pgOAuthAccessTokensTable)
          .set({ revokedAt: now })
          .where(and(inArray(pgOAuthAccessTokensTable.grantId, grantIds), isNull(pgOAuthAccessTokensTable.revokedAt)));
        await tx.insert(pgOAuthConnectionEventsTable).values(
          grants.map((grant) => ({
            userId: grant.userId,
            grantId: grant.id,
            applicationUid: applicationRow.uid,
            applicationName: applicationRow.name,
            action: "disconnected",
            scopes: normalizeApiScopes(grant.scopes),
            disconnectReason: "application_deleted",
            createdAt: now,
          })),
        );
      }
      return true;
    }),
  );
}

export async function getOAuthApplicationForClient(
  env: Env,
  clientId: string,
  options: OAuthRepositoryOptions = {},
): Promise<{ application: OAuthApplication; ownerUsername: string } | null> {
  return withOAuthDatabase(env, options, async (db) => {
    const [row] = await db
      .select({ application: pgOAuthApplicationsTable, ownerUsername: pgSenseisTable.username })
      .from(pgOAuthApplicationsTable)
      .innerJoin(pgSenseisTable, eq(pgSenseisTable.id, pgOAuthApplicationsTable.ownerUserId))
      .where(and(eq(pgOAuthApplicationsTable.clientId, clientId), isNull(pgOAuthApplicationsTable.deletedAt)))
      .limit(1);
    return row ? { application: toApplication(row.application), ownerUsername: row.ownerUsername } : null;
  });
}

export async function getActiveOAuthGrant(
  env: Env,
  applicationId: number,
  userId: number,
  options: OAuthRepositoryOptions = {},
): Promise<{ id: number; scopes: ApiScope[] } | null> {
  return withOAuthDatabase(env, options, async (db) => {
    const [row] = await db
      .select({ id: pgOAuthGrantsTable.id, scopes: pgOAuthGrantsTable.scopes })
      .from(pgOAuthGrantsTable)
      .where(
        and(
          eq(pgOAuthGrantsTable.applicationId, applicationId),
          eq(pgOAuthGrantsTable.userId, userId),
          isNull(pgOAuthGrantsTable.disconnectedAt),
        ),
      )
      .limit(1);
    return row ? { id: row.id, scopes: normalizeApiScopes(row.scopes) } : null;
  });
}

export async function issueOAuthAuthorizationCode(
  env: Env,
  input: {
    applicationId: number;
    applicationUid: string;
    applicationName: string;
    userId: number;
    redirectUri: string;
    scopes: readonly ApiScope[];
    codeChallenge: string | null;
    expectedGrantId?: number;
  },
  options: OAuthRepositoryOptions = {},
): Promise<string> {
  const code = `mllg_oa_${randomHex(32)}`;
  const codeHash = await sha256(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_AUTHORIZATION_CODE_LIFETIME_SECONDS * 1000);
  const scopes = normalizeApiScopes(input.scopes);
  return withOAuthDatabase(env, options, async (db) =>
    db.transaction(async (tx) => {
      const [sensei] = await tx
        .select({ active: pgSenseisTable.active })
        .from(pgSenseisTable)
        .where(eq(pgSenseisTable.id, input.userId))
        .limit(1);
      if (!sensei?.active) throw new OAuthInvalidGrantError("The account is inactive.");
      const [application] = await tx
        .select({
          id: pgOAuthApplicationsTable.id,
          deletedAt: pgOAuthApplicationsTable.deletedAt,
          scopes: pgOAuthApplicationsTable.scopes,
        })
        .from(pgOAuthApplicationsTable)
        .where(and(eq(pgOAuthApplicationsTable.id, input.applicationId), eq(pgOAuthApplicationsTable.uid, input.applicationUid)))
        .for("update")
        .limit(1);
      if (!application || application.deletedAt) throw new OAuthInvalidGrantError("The application is unavailable.");
      if (normalizeApiScopes(application.scopes).join(" ") !== scopes.join(" ")) {
        throw new OAuthInvalidGrantError("The requested scopes do not match the application.");
      }

      const [activeGrant] = await tx
        .select()
        .from(pgOAuthGrantsTable)
        .where(
          and(
            eq(pgOAuthGrantsTable.applicationId, input.applicationId),
            eq(pgOAuthGrantsTable.userId, input.userId),
            isNull(pgOAuthGrantsTable.disconnectedAt),
            ...(input.expectedGrantId !== undefined ? [eq(pgOAuthGrantsTable.id, input.expectedGrantId)] : []),
          ),
        )
        .for("update")
        .limit(1);
      if (input.expectedGrantId !== undefined && !activeGrant) {
        throw new OAuthInvalidGrantError("The consented grant is no longer active.");
      }
      let grantId: number;
      if (activeGrant) {
        grantId = activeGrant.id;
        const grantedScopes = normalizeApiScopes(activeGrant.scopes);
        const nextScopes = normalizeApiScopes([...grantedScopes, ...scopes]);
        if (nextScopes.some((scope) => !grantedScopes.includes(scope))) {
          await tx
            .update(pgOAuthGrantsTable)
            .set({ scopes: nextScopes, updatedAt: now })
            .where(eq(pgOAuthGrantsTable.id, activeGrant.id));
          await tx.insert(pgOAuthConnectionEventsTable).values({
            userId: input.userId,
            grantId: activeGrant.id,
            applicationUid: input.applicationUid,
            applicationName: input.applicationName,
            action: "scopes_expanded",
            scopes: nextScopes,
            disconnectReason: null,
            createdAt: now,
          });
        }
      } else {
        const [createdGrant] = await tx
          .insert(pgOAuthGrantsTable)
          .values({
            applicationId: input.applicationId,
            userId: input.userId,
            subject: randomHex(32),
            scopes,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: pgOAuthGrantsTable.id });
        if (!createdGrant) throw new Error("OAuth grant was not created.");
        grantId = createdGrant.id;
        await tx.insert(pgOAuthConnectionEventsTable).values({
          userId: input.userId,
          grantId,
          applicationUid: input.applicationUid,
          applicationName: input.applicationName,
          action: "connected",
          scopes,
          disconnectReason: null,
          createdAt: now,
        });
      }

      await tx.insert(pgOAuthAuthorizationCodesTable).values({
        codeHash,
        applicationId: input.applicationId,
        userId: input.userId,
        grantId,
        redirectUri: input.redirectUri,
        scopes,
        codeChallenge: input.codeChallenge,
        createdAt: now,
        expiresAt,
      });
      return code;
    }),
  );
}

export async function disconnectOAuthGrant(
  env: Env,
  userId: number,
  grantId: number,
  options: OAuthRepositoryOptions = {},
): Promise<boolean> {
  const now = new Date();
  return withOAuthDatabase(env, options, (db) =>
    db.transaction(async (tx) => {
      const [grant] = await tx
        .select({
          id: pgOAuthGrantsTable.id,
          userId: pgOAuthGrantsTable.userId,
          scopes: pgOAuthGrantsTable.scopes,
          applicationUid: pgOAuthApplicationsTable.uid,
          applicationName: pgOAuthApplicationsTable.name,
        })
        .from(pgOAuthGrantsTable)
        .innerJoin(pgOAuthApplicationsTable, eq(pgOAuthApplicationsTable.id, pgOAuthGrantsTable.applicationId))
        .where(
          and(
            eq(pgOAuthGrantsTable.id, grantId),
            eq(pgOAuthGrantsTable.userId, userId),
            isNull(pgOAuthGrantsTable.disconnectedAt),
            isNull(pgOAuthApplicationsTable.deletedAt),
          ),
        )
        .for("update", { of: pgOAuthGrantsTable })
        .limit(1);
      if (!grant) return false;
      await tx
        .update(pgOAuthGrantsTable)
        .set({ disconnectedAt: now, updatedAt: now })
        .where(eq(pgOAuthGrantsTable.id, grant.id));
      await tx
        .update(pgOAuthAccessTokensTable)
        .set({ revokedAt: now })
        .where(and(eq(pgOAuthAccessTokensTable.grantId, grant.id), isNull(pgOAuthAccessTokensTable.revokedAt)));
      await tx.insert(pgOAuthConnectionEventsTable).values({
        userId: grant.userId,
        grantId: grant.id,
        applicationUid: grant.applicationUid,
        applicationName: grant.applicationName,
        action: "disconnected",
        scopes: normalizeApiScopes(grant.scopes),
        disconnectReason: "user",
        createdAt: now,
      });
      return true;
    }),
  );
}

export async function getOAuthConnections(
  env: Env,
  userId: number,
  options: OAuthRepositoryOptions = {},
): Promise<OAuthConnection[]> {
  return withOAuthDatabase(env, options, async (db) => {
    const rows = await db
      .select({
        id: pgOAuthGrantsTable.id,
        applicationUid: pgOAuthApplicationsTable.uid,
        applicationName: pgOAuthApplicationsTable.name,
        scopes: pgOAuthGrantsTable.scopes,
        connectedAt: pgOAuthGrantsTable.createdAt,
        lastUsedAt: max(pgOAuthAccessTokensTable.lastUsedAt),
      })
      .from(pgOAuthGrantsTable)
      .innerJoin(pgOAuthApplicationsTable, eq(pgOAuthApplicationsTable.id, pgOAuthGrantsTable.applicationId))
      .leftJoin(pgOAuthAccessTokensTable, eq(pgOAuthAccessTokensTable.grantId, pgOAuthGrantsTable.id))
      .where(
        and(
          eq(pgOAuthGrantsTable.userId, userId),
          isNull(pgOAuthGrantsTable.disconnectedAt),
          isNull(pgOAuthApplicationsTable.deletedAt),
        ),
      )
      .groupBy(pgOAuthGrantsTable.id, pgOAuthApplicationsTable.id)
      .orderBy(desc(pgOAuthGrantsTable.createdAt), desc(pgOAuthGrantsTable.id));
    return rows.map((row) => ({ ...row, scopes: normalizeApiScopes(row.scopes) }));
  });
}

export async function exchangeOAuthAuthorizationCode(
  env: Env,
  input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string | null;
  },
  options: OAuthRepositoryOptions = {},
  now = new Date(),
): Promise<{ accessToken: string; scopes: ApiScope[]; expiresIn: number }> {
  const secretHash = await sha256(input.clientSecret);
  const [application] = await withOAuthDatabase(env, options, async (db) =>
    db
      .select({ id: pgOAuthApplicationsTable.id })
      .from(pgOAuthApplicationsTable)
      .where(
        and(
          eq(pgOAuthApplicationsTable.clientId, input.clientId),
          eq(pgOAuthApplicationsTable.clientSecretHash, secretHash),
          isNull(pgOAuthApplicationsTable.deletedAt),
        ),
      )
      .limit(1),
  );
  if (!application) throw new OAuthInvalidClientError("Client authentication failed.");

  const codeHash = await sha256(input.code);
  const result = await withOAuthDatabase(env, options, async (db) =>
    db.transaction(async (tx) => {
      const [authorization] = await tx
        .select()
        .from(pgOAuthAuthorizationCodesTable)
        .where(eq(pgOAuthAuthorizationCodesTable.codeHash, codeHash))
        .for("update")
        .limit(1);
      if (
        !authorization ||
        authorization.applicationId !== application.id ||
        authorization.redirectUri !== input.redirectUri ||
        authorization.usedAt !== null ||
        authorization.expiresAt <= now ||
        (authorization.codeChallenge !== null && input.codeVerifier === null) ||
        (authorization.codeChallenge === null && input.codeVerifier !== null)
      ) {
        throw new OAuthInvalidGrantError("The authorization code is invalid.");
      }
      if (authorization.codeChallenge && input.codeVerifier) {
        const verifierDigest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.codeVerifier)),
        );
        const challenge = btoa(String.fromCharCode(...verifierDigest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        if (challenge !== authorization.codeChallenge) throw new OAuthInvalidGrantError("The PKCE verifier is invalid.");
      }

      const [validContext] = await tx
        .select({ active: pgSenseisTable.active, grantId: pgOAuthGrantsTable.id })
        .from(pgOAuthGrantsTable)
        .innerJoin(pgOAuthApplicationsTable, eq(pgOAuthApplicationsTable.id, pgOAuthGrantsTable.applicationId))
        .innerJoin(pgSenseisTable, eq(pgSenseisTable.id, pgOAuthGrantsTable.userId))
        .where(
          and(
            eq(pgOAuthGrantsTable.id, authorization.grantId),
            eq(pgOAuthGrantsTable.userId, authorization.userId),
            isNull(pgOAuthGrantsTable.disconnectedAt),
            isNull(pgOAuthApplicationsTable.deletedAt),
          ),
        )
        .limit(1);
      if (!validContext?.active) throw new OAuthInvalidGrantError("The authorization context is unavailable.");

      const [consumed] = await tx
        .update(pgOAuthAuthorizationCodesTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(pgOAuthAuthorizationCodesTable.id, authorization.id),
            isNull(pgOAuthAuthorizationCodesTable.usedAt),
            gt(pgOAuthAuthorizationCodesTable.expiresAt, now),
          ),
        )
        .returning({ id: pgOAuthAuthorizationCodesTable.id });
      if (!consumed) throw new OAuthInvalidGrantError("The authorization code was already used.");

      const accessToken = `mllg_ot_${randomHex(32)}`;
      const expiresAt = addCalendarMonths(now, OAUTH_ACCESS_TOKEN_LIFETIME_MONTHS);
      await tx.insert(pgOAuthAccessTokensTable).values({
        tokenHash: await sha256(accessToken),
        tokenPrefix: accessToken.slice(0, 18),
        applicationId: application.id,
        userId: authorization.userId,
        grantId: authorization.grantId,
        scopes: normalizeApiScopes(authorization.scopes),
        issuedAt: now,
        expiresAt,
      });
      return {
        accessToken,
        scopes: normalizeApiScopes(authorization.scopes),
        expiresIn: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
      };
    }),
  );
  return result;
}

export async function authenticateOAuthAccessToken(
  env: Env,
  token: string,
  options: OAuthRepositoryOptions = {},
  now = new Date(),
): Promise<{ kind: "invalid" | "inactive" } | { kind: "authenticated"; principal: AuthenticatedOAuthToken }> {
  if (!/^mllg_ot_[a-f0-9]{64}$/.test(token)) return { kind: "invalid" };
  const tokenHash = await sha256(token);
  return withOAuthDatabase(env, options, async (db) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          accessToken: pgOAuthAccessTokensTable,
          grant: pgOAuthGrantsTable,
          application: pgOAuthApplicationsTable,
          active: pgSenseisTable.active,
        })
        .from(pgOAuthAccessTokensTable)
        .innerJoin(pgOAuthGrantsTable, eq(pgOAuthGrantsTable.id, pgOAuthAccessTokensTable.grantId))
        .innerJoin(pgOAuthApplicationsTable, eq(pgOAuthApplicationsTable.id, pgOAuthAccessTokensTable.applicationId))
        .innerJoin(pgSenseisTable, eq(pgSenseisTable.id, pgOAuthAccessTokensTable.userId))
        .where(eq(pgOAuthAccessTokensTable.tokenHash, tokenHash))
        .for("update", { of: pgOAuthAccessTokensTable })
        .limit(1);
      if (
        !row ||
        row.accessToken.revokedAt !== null ||
        row.accessToken.expiresAt <= now ||
        row.grant.disconnectedAt !== null ||
        row.application.deletedAt !== null
      ) {
        return { kind: "invalid" };
      }
      if (!row.active) return { kind: "inactive" };
      await tx
        .update(pgOAuthAccessTokensTable)
        .set({ lastUsedAt: now })
        .where(eq(pgOAuthAccessTokensTable.id, row.accessToken.id));
      return {
        kind: "authenticated",
        principal: {
          kind: "oauth",
          uid: row.application.uid,
          userId: row.accessToken.userId,
          scopes: normalizeApiScopes(row.accessToken.scopes),
          subject: row.grant.subject,
          applicationUid: row.application.uid,
          applicationName: row.application.name,
        },
      };
    }),
  );
}
