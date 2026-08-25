interface Env {
  KV_CACHE: KVNamespace;
  KV_SESSION: KVNamespace;
  HYPERDRIVE: Hyperdrive;
  CACHE_REFRESH_WORKFLOW: Workflow<{ requestedBy: number }>;
  EVENTS?: Queue;
  OCR_TASKS?: Queue<OcrTaskMessage>;
  OCR_UPLOADS: R2Bucket;
  HOST: string;
  CONNECT_API_URL?: string;
  CONNECT_INTERNAL_TOKEN?: string;
  OCR_R2_ACCOUNT_ID?: string;
  OCR_R2_ACCESS_KEY_ID?: string;
  OCR_R2_SECRET_ACCESS_KEY?: string;
  OCR_R2_BUCKET_NAME?: string;
  OCR_WORKER_TOKEN?: string;
  STAGE?: "staging" | "prod";
  DISABLE_CACHE?: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  DISCORD_OAUTH_CLIENT_ID: string;
  DISCORD_OAUTH_CLIENT_SECRET: string;
  FRONT_SENTRY_DSN?: string;
  SERVER_SENTRY_DSN?: string;
  SERVER_BETTER_STACK_SOURCE_TOKEN?: string;
}

type OcrTaskMessage = import("~/domain/ocr").OcrTaskMessage;
