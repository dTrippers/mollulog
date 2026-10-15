// jsdom lacks TextEncoder, which react-router reads when it loads. Import this module before react-router.
import { TextDecoder, TextEncoder } from "node:util";

Object.assign(globalThis, { TextEncoder, TextDecoder });
