declare global {
  interface Env {
    /** Set to any truthy string to bypass KV cache. For local development only. */
    DISABLE_CACHE?: string;
    /** Cloudflare Queue REST endpoint used only by local E2E development. */
    OCR_QUEUE_API_URL?: string;
    /** Cloudflare API token with Queues Write permission, used only by local E2E development. */
    OCR_QUEUE_API_TOKEN?: string;
  }
}

export {};
