import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const AYUMU_CONFIG_PATH = "../../mollulog-ayumu/wrangler.toml";

export default defineConfig(({ mode }) => {
  const hasLocalAyumu =
    mode === "development" && existsSync(new URL(AYUMU_CONFIG_PATH, import.meta.url));

  return {
    server: {
      port: 8787,
      allowedHosts: process.env.ALLOWED_HOSTS?.split(","),
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      cloudflare({
        viteEnvironment: { name: "ssr" },
        environment: mode,
        persistState: {
          path: process.env.WRANGLER_PERSIST_TO ?? ".wrangler/state",
        },
        auxiliaryWorkers: [
          {
            configPath: "./wrangler.cron.jsonc",
            viteEnvironment: { name: "cron" },
          },
          ...(hasLocalAyumu
            ? [
                {
                  configPath: AYUMU_CONFIG_PATH,
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
