interface Env {
  KV_CACHE: KVNamespace;
  KV_SESSION: KVNamespace;
  DB: D1Database;
  HYPERDRIVE: Hyperdrive;
  EVENTS?: Queue;
  HOST: string;
  CONNECT_API_URL?: string;
  CONNECT_INTERNAL_TOKEN?: string;
  STAGE?: "staging" | "prod";
  DISABLE_CACHE?: string;
  FAVORITE_STUDENT_SOURCE_MODE?: "d1" | "compare" | "hyperdrive";
  SESSION_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  FRONT_BETTER_STACK_SENTRY_DSN?: string;
  SERVER_BETTER_STACK_SENTRY_DSN?: string;
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
}
