import { execFileSync } from "node:child_process";
import { chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";

export const connectionKey = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
const processKeys = [connectionKey, "WRANGLER_PERSIST_TO", "ALLOWED_HOSTS"];

export class LocalDevError extends Error {}

export function locations(root, env = process.env) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const primary = dirname(common);
  return { root, primary, shared: resolve(env.MOLLULOG_DEV_CONFIG_DIR || join(primary, "..", ".mollulog-dev")) };
}

export function readSettings(path) {
  if (!existsSync(path)) throw new LocalDevError(`Missing ${path}. Run pnpm dev:setup; see docs/development.md.`);
  try { return parseEnv(readFileSync(path, "utf8")); }
  catch { throw new LocalDevError(`Cannot parse ${path}. Use dotenv assignments, not shell commands.`); }
}

export function assertLocalConnection(value) {
  let url;
  try { url = new URL(value); } catch { throw new LocalDevError(`Missing or invalid ${connectionKey}.`); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.search || url.hash || !url.pathname.slice(1) || !url.username) {
    throw new LocalDevError("Local DB commands require a loopback PostgreSQL URL with a database and user, without query parameters.");
  }
  return url;
}

// One-time import of the existing workstation settings. Never execute .envrc.
// Only these three development variables are copied; unrelated shell secrets stay out.
export function setupShared(paths) {
  const localEnv = join(paths.shared, "local.env");
  const vars = join(paths.shared, ".dev.vars");
  const sourceEnv = join(paths.primary, "..", ".envrc");
  const sourceVars = join(paths.primary, ".dev.vars");
  // Preflight both inputs before creating either file.
  const settings = existsSync(localEnv) ? readSettings(localEnv) : readSettings(sourceEnv);
  assertLocalConnection(settings[connectionKey]);
  if (!existsSync(vars) && !existsSync(sourceVars)) {
    throw new LocalDevError(`Create ${vars} from your development secrets; no existing .dev.vars was found.`);
  }
  mkdirSync(paths.shared, { recursive: true, mode: 0o700 });
  if (!existsSync(localEnv)) {
    const content = processKeys.filter((key) => settings[key] != null).map((key) => {
      const value = settings[key];
      if (/["\r\n]/.test(value)) throw new LocalDevError(`Unsupported value in ${key}; configure local.env manually.`);
      return `${key}="${value}"`;
    }).join("\n");
    writeFileSync(localEnv, `${content}\n`, { flag: "wx", mode: 0o600 });
  }
  if (!existsSync(vars)) {
    copyFileSync(sourceVars, vars, constants.COPYFILE_EXCL);
    chmodSync(vars, 0o600);
  }
}

export function loadLocalEnvironment(paths, inherited = process.env) {
  if (inherited.CLOUDFLARE_ENV && inherited.CLOUDFLARE_ENV !== "development") {
    throw new LocalDevError("Local development commands cannot use CLOUDFLARE_ENV staging/production.");
  }
  const settings = readSettings(join(paths.shared, "local.env"));
  assertLocalConnection(settings[connectionKey]);
  const env = { ...inherited };
  for (const key of processKeys) {
    if (settings[key] != null) env[key] = settings[key];
  }
  return env;
}

export function prepareDevVars(paths) {
  const sharedVars = join(paths.shared, ".dev.vars");
  readSettings(sharedVars);
  const destination = join(paths.root, ".dev.vars");
  const stat = lstatSync(destination, { throwIfNoEntry: false });
  if (!stat) {
    try { symlinkSync(sharedVars, destination); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  const vars = readSettings(destination);
  for (const key of ["HOST", "SESSION_SECRET"]) {
    if (!vars[key]) throw new LocalDevError(`Missing ${key} in the worktree .dev.vars.`);
  }
  return realpathSync(destination) === realpathSync(sharedVars) ? "shared" : "existing worktree file (preserved)";
}
