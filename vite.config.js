import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import {
  assertNoRepositoryEnvironmentFiles,
  workerBindingsFromEnvironment,
} from "./scripts/local-dev-env.mjs";

const AYUMU_CONFIG_ENV = "MOLLULOG_AYUMU_CONFIG_PATH";

export function workerConfigForCommand(command, env = process.env) {
  return command === "serve"
    ? { secrets: { required: Object.keys(workerBindingsFromEnvironment(env)) } }
    : undefined;
}

export default defineConfig(({ mode, command }) => {
  assertNoRepositoryEnvironmentFiles(process.cwd(), { includeDevVars: command === "serve" });
  const ayumuConfigPath = process.env[AYUMU_CONFIG_ENV]?.trim();
  const useAyumu = command === "serve" && mode === "development" && Boolean(ayumuConfigPath);
  if (useAyumu && !existsSync(resolve(process.cwd(), ayumuConfigPath))) {
    throw new Error(`${AYUMU_CONFIG_ENV} does not point to an existing Wrangler config.`);
  }
  const allowedHosts = process.env.ALLOWED_HOSTS
    ?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const developmentWorkerConfig = workerConfigForCommand(command);
  const workerConfigOption = developmentWorkerConfig ? { config: developmentWorkerConfig } : {};
  if (command === "serve") process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "true";

  return {
    envDir: false,
    server: {
      port: 8787,
      allowedHosts: allowedHosts?.length ? allowedHosts : undefined,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      cloudflare({
        ...workerConfigOption,
        viteEnvironment: { name: "ssr" },
        persistState: {
          path: process.env.WRANGLER_PERSIST_TO ?? ".wrangler/state",
        },
        auxiliaryWorkers: [
          {
            configPath: "./wrangler.cron.jsonc",
            ...workerConfigOption,
            viteEnvironment: { name: "cron" },
          },
          ...(useAyumu
            ? [
                {
                  configPath: ayumuConfigPath,
                  config: (_config, { entryWorkerConfig }) => ({
                    compatibility_date: entryWorkerConfig.compatibility_date,
                    hyperdrive: entryWorkerConfig.hyperdrive,
                  }),
                  devOnly: true,
                  viteEnvironment: { name: "ayumu" },
                },
              ]
            : []),
        ],
      }),
      tailwindcss(),
      reactRouter(),
    ],
    worker: {
      format: "es",
    },
  };
});
