import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  server: {
    port: 8787,
    allowedHosts: process.env.ALLOWED_HOSTS?.split(","),
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      environment: mode,
      persistState: {
        path: process.env.WRANGLER_PERSIST_TO ?? ".",
      },
    }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
}));
