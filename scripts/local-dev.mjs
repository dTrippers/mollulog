import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment, LocalDevError, locations, prepareDevVars, setupShared } from "./local-dev-env.mjs";
import { connectLocalDatabase, databaseStatus, migrateFiles, reportDatabaseError } from "./local-postgres.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [command, ...args] = process.argv.slice(2);
try {
  if (!["setup", "doctor", "dev", "start", "db:status", "db:migrate"].includes(command)) {
    throw new LocalDevError("Unknown local development command.");
  }
  if (!["dev", "start", "db:migrate"].includes(command) && args.length) {
    throw new LocalDevError("This command does not accept arguments.");
  }
  const paths = locations(root);
  if (command === "setup") setupShared(paths);
  const env = loadLocalEnvironment(paths);
  if (["setup", "doctor", "dev", "start"].includes(command)) {
    console.log(`Development variables: ${prepareDevVars(paths)}`);
  }
  if (command === "setup") {
    console.log(`Shared settings ready at ${paths.shared}. Existing source files were preserved.`);
  } else if (["doctor", "db:status", "db:migrate"].includes(command)) {
    const client = await connectLocalDatabase(env);
    try {
      if (command === "db:migrate") await migrateFiles(client, root, args);
      else await databaseStatus(client, root);
    } finally { await client.end(); }
  } else {
    const childArgs = command === "dev"
      ? ["exec", "react-router", "dev", "--host", ...args]
      : ["exec", "wrangler", "dev", "--persist-to", env.WRANGLER_PERSIST_TO || ".wrangler/state", ...args];
    const child = spawn("pnpm", childArgs, { cwd: root, env, stdio: "inherit" });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("error", () => { console.error("Cannot launch pnpm. Run this command with mise exec."); process.exitCode = 1; });
    child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143); });
  }
} catch (error) {
  console.error(error instanceof LocalDevError ? error.message : reportDatabaseError(error));
  process.exitCode = 1;
}
