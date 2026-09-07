import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoRepositoryEnvironmentFiles, loadLocalEnvironment, LocalDevError } from "./local-dev-env.mjs";
import { connectLocalDatabase, databaseStatus, migrateFiles, reportDatabaseError } from "./local-postgres.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [command, ...args] = process.argv.slice(2);
try {
  if (!["doctor", "dev", "db:status", "db:migrate"].includes(command)) {
    throw new LocalDevError("Unknown local development command.");
  }
  if (!["dev", "db:migrate"].includes(command) && args.length) {
    throw new LocalDevError("This command does not accept arguments.");
  }
  if (command === "dev") assertNoRepositoryEnvironmentFiles(root);
  const env = loadLocalEnvironment(process.env, { requireWorker: command === "dev" });
  if (["doctor", "db:status", "db:migrate"].includes(command)) {
    const client = await connectLocalDatabase(env);
    try {
      if (command === "db:migrate") await migrateFiles(client, root, args);
      else await databaseStatus(client, root);
    } finally { await client.end(); }
  } else {
    const child = spawn("pnpm", ["exec", "react-router", "dev", "--host", ...args], {
      cwd: root,
      env: { ...env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true" },
      stdio: "inherit",
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("error", () => { console.error("Cannot launch pnpm. Run this command with mise exec."); process.exitCode = 1; });
    child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143); });
  }
} catch (error) {
  console.error(error instanceof LocalDevError ? error.message : reportDatabaseError(error));
  process.exitCode = 1;
}
