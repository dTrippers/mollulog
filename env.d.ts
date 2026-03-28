interface Env {
  KV_USERDATA: KVNamespace;
  KV_SESSION: KVNamespace;
  DB: D1Database;
  HOST: string;
  STAGE?: "staging" | "prod";
  DISABLE_CACHE?: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  FRONT_BETTER_STACK_SENTRY_DSN?: string;
  SERVER_BETTER_STACK_SENTRY_DSN?: string;
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
}
