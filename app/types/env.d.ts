declare global {
  interface Env {
    /** Set to any truthy string to bypass KV cache. For local development only. */
    DISABLE_CACHE?: string;
    CONNECT_API_URL?: string;
    CONNECT_INTERNAL_TOKEN?: string;
    /** Cloudflare Queue REST endpoint used only by local E2E development. */
    OCR_QUEUE_API_URL?: string;
    /** Cloudflare API token with Queues Write permission, used only by local E2E development. */
    OCR_QUEUE_API_TOKEN?: string;
    /** Public VAPID key exposed only to the notification settings screen. */
    WEB_PUSH_VAPID_PUBLIC_KEY?: string;
    /** Secret used to encrypt Web Push endpoint and client keys at rest. */
    WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY?: string;
  }
}

export {};
