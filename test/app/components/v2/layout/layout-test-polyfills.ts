// jsdom lacks TextEncoder, which react-router reads when it loads. Import this module before react-router.
import { TextDecoder, TextEncoder } from "node:util";

Object.assign(globalThis, { TextEncoder, TextDecoder });

// jsdom also lacks the Fetch API. A data router builds a Request for every navigation, even when no loader reads it, so a
// minimal stand-in with the fields the router reads is enough for route-only tests.
class RequestStub {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | undefined;

  constructor(input: string, init?: { method?: string; signal?: AbortSignal }) {
    this.url = input;
    this.method = init?.method ?? "GET";
    this.signal = init?.signal;
  }
}

if (typeof globalThis.Request === "undefined") {
  Object.assign(globalThis, { Request: RequestStub });
}
