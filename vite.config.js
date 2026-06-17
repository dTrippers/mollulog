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
        path: process.env.WRANGLER_PERSIST_TO ?? ".wrangler/state",
      },
    }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  // Web Worker 서브번들에도 tsconfig 경로 별칭(~/*)을 적용해 워커가 ~ import를 해석할 수 있게 합니다.
  worker: {
    format: "es",
    plugins: () => [tsconfigPaths()],
  },
}));
