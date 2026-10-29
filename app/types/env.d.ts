import type { QuestionRequest } from "~/models/al1s-question-contract";

type Al1sBinding = { runQuestion(request: QuestionRequest, onEvent?: (event: unknown) => void): Promise<unknown> };

declare global {
  interface Env {
    /** Set to any truthy string to bypass KV cache. For local development only. */
    DISABLE_CACHE?: string;
    /** Cloudflare Queue REST endpoint used only by local E2E development. */
    OCR_QUEUE_API_URL?: string;
    /** Cloudflare API token with Queues Write permission, used only by local E2E development. */
    OCR_QUEUE_API_TOKEN?: string;
    ANTHROPIC_API_KEY?: string;
    API_READ_RATE_LIMITER?: RateLimit;
    QUESTION_RATE_LIMITER: RateLimit;
    AL1S: Al1sBinding;
  }
}
