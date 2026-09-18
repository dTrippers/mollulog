import { existsSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";

export const connectionKey = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

export const postgresKeys = [
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSSLMODE",
];

export const workerEnvKeys = [
  "HOST",
  "OCR_R2_ACCOUNT_ID",
  "OCR_R2_ACCESS_KEY_ID",
  "OCR_R2_SECRET_ACCESS_KEY",
  "OCR_R2_BUCKET_NAME",
  "OCR_WORKER_TOKEN",
  "STAGE",
  "DISABLE_CACHE",
  "SESSION_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "DISCORD_OAUTH_CLIENT_ID",
  "DISCORD_OAUTH_CLIENT_SECRET",
  "FRONT_SENTRY_DSN",
  "SERVER_SENTRY_DSN",
  "SERVER_BETTER_STACK_SOURCE_TOKEN",
  "OCR_QUEUE_API_URL",
  "OCR_QUEUE_API_TOKEN",
];

const requiredWorkerEnvKeys = ["HOST", "SESSION_SECRET"];
const sslModes = new Set(["disable", "prefer", "require", "verify-ca", "verify-full", "no-verify"]);
const hostnamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export class LocalDevError extends Error {}

export function assertNoRepositoryEnvironmentFiles(root, { includeDevVars = true } = {}) {
  const names = readdirSync(root);
  const conflicts = names.filter((name) => {
    const isDotEnv = name === ".env" || name.startsWith(".env.");
    const isDevVars = includeDevVars && (name === ".dev.vars" || name.startsWith(".dev.vars."));
    return (isDotEnv || isDevVars) && existsSync(join(root, name));
  });
  if (conflicts.length) {
    throw new LocalDevError(
      `MolluLog accepts inherited environment variables only. Move or rename ${conflicts.join(", ")} before running this command; existing files were not modified.`,
    );
  }
}

function missingKeys(env, keys) {
  return keys.filter((key) => typeof env[key] !== "string" || env[key].trim() === "");
}

function assertRequiredEnvironment(env, keys) {
  const missing = missingKeys(env, keys);
  if (missing.length) throw new LocalDevError(`Missing required environment variable(s): ${missing.join(", ")}. Provide them through the selected environment file.`);
}

function assertSslMode(value) {
  if (!sslModes.has(value)) {
    throw new LocalDevError(`Invalid PGSSLMODE. Use one of: ${[...sslModes].join(", ")}.`);
  }
}

function normalizeHost(value) {
  const rawHost = value.trim();
  if (!rawHost || rawHost.includes("/") || rawHost.includes("\\") || rawHost.includes("#") || rawHost.includes("?")) {
    throw new LocalDevError("Invalid PGHOST. Use a PostgreSQL hostname or IP address.");
  }
  const bracketed = rawHost.startsWith("[") || rawHost.endsWith("]");
  if (bracketed && !(rawHost.startsWith("[") && rawHost.endsWith("]"))) {
    throw new LocalDevError("Invalid PGHOST. Use a PostgreSQL hostname or IP address.");
  }
  const host = bracketed ? rawHost.slice(1, -1) : rawHost;
  if (isIP(host) === 6) return `[${host}]`;
  if (isIP(host) === 4) return host;
  if (!hostnamePattern.test(host)) {
    throw new LocalDevError("Invalid PGHOST. Use a PostgreSQL hostname or IP address.");
  }
  return host;
}

export function connectionStringFromPostgresEnvironment(env) {
  assertRequiredEnvironment(env, postgresKeys);
  const host = normalizeHost(env.PGHOST);
  const port = Number(env.PGPORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new LocalDevError("Invalid PGPORT. Use a TCP port between 1 and 65535.");
  }
  assertSslMode(env.PGSSLMODE);

  const url = new URL("postgresql://localhost");
  url.username = env.PGUSER;
  url.password = env.PGPASSWORD;
  url.hostname = host;
  url.port = String(port);
  url.pathname = `/${encodeURIComponent(env.PGDATABASE)}`;
  url.searchParams.set("sslmode", env.PGSSLMODE);
  return url.toString();
}

export function allowedLocalDbHosts(env) {
  const raw = env.LOCAL_DB_ALLOWED_HOSTS;
  if (raw === undefined) return [];
  if (typeof raw !== "string") {
    throw new LocalDevError("Invalid LOCAL_DB_ALLOWED_HOSTS. Use a comma-separated list of hostnames.");
  }
  const entries = raw.split(",").map((entry) => entry.trim());
  for (const entry of entries) {
    if (!entry) {
      throw new LocalDevError("Invalid LOCAL_DB_ALLOWED_HOSTS: entries cannot be empty. Use a comma-separated hostname list, or remove the variable for loopback-only access.");
    }
    if (!hostnamePattern.test(entry)) {
      throw new LocalDevError("Invalid LOCAL_DB_ALLOWED_HOSTS entry. Use a comma-separated list of plain hostnames.");
    }
  }
  return entries.map((entry) => entry.toLowerCase());
}

export function assertLocalConnection(value, allowedHosts = []) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new LocalDevError(`Missing or invalid ${connectionKey}.`);
  }
  const permittedLoopbackHosts = ["127.0.0.1", "localhost", "[::1]"];
  const hostPermitted = permittedLoopbackHosts.includes(url.hostname) || allowedHosts.includes(url.hostname.toLowerCase());
  const queryKeys = [...url.searchParams.keys()];
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !hostPermitted ||
    url.hash ||
    !url.pathname.slice(1) ||
    !url.username ||
    url.searchParams.getAll("sslmode").length > 1 ||
    queryKeys.some((key) => key !== "sslmode") ||
    (url.searchParams.has("sslmode") && !sslModes.has(url.searchParams.get("sslmode")))
  ) {
    throw new LocalDevError(
      "Local DB commands require a loopback PostgreSQL connection with a database and user, without connection overrides. " +
        "To allow a non-loopback local database host, set LOCAL_DB_ALLOWED_HOSTS to a comma-separated hostname list in the selected environment file.",
    );
  }
  return url;
}

export function workerBindingsFromEnvironment(env = process.env) {
  return Object.fromEntries(
    workerEnvKeys
      .filter((key) => typeof env[key] === "string" && env[key] !== "")
      .map((key) => [key, env[key]]),
  );
}

export function loadLocalEnvironment(inherited = process.env, { requireWorker = false } = {}) {
  if (inherited.CLOUDFLARE_ENV) {
    throw new LocalDevError("Unset CLOUDFLARE_ENV for local development commands; they use the default Wrangler configuration, not a named environment.");
  }
  if (requireWorker) assertRequiredEnvironment(inherited, requiredWorkerEnvKeys);
  return {
    ...inherited,
    [connectionKey]: connectionStringFromPostgresEnvironment(inherited),
  };
}
