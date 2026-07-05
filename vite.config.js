import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
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
      ],
    }),
    tailwindcss(),
    reactRouter(),
  ],
  worker: {
    format: "es",
  },
}));
