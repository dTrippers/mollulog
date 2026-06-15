declare global {
  interface Env {
    /** Set to any truthy string to bypass KV cache. For local development only. */
    DISABLE_CACHE?: string;
    CONNECT_API_URL?: string;
    CONNECT_INTERNAL_TOKEN?: string;
  }
}

export {};
