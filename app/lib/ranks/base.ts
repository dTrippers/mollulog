import protobuf from "protobufjs";
import { fetchWithTimeout, readBodyWithTimeout } from "~/lib/fetch-timeout";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";

export const RANK_API_BASE_URL = import.meta.env.VITE_RANK_API_BASE_URL || "https://ranks.baql.net";
const RANK_FETCH_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.ranksFetch;
const RANK_BODY_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.ranksBody;
const RANK_DECOMPRESS_TIMEOUT_MS = RUNTIME_TIMEOUTS.external.ranksDecompress;

export async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip");
  const stream = new Response(data).body?.pipeThrough(ds);

  if (!stream) {
    throw new Error("Failed to create decompression stream");
  }

  return await new Response(stream).arrayBuffer();
}

function hasGzipHeader(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 2));
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function createProtobufRootCache() {
  const roots = new Map<string, protobuf.Root>();

  return async (schema: string): Promise<protobuf.Root> => {
    let root = roots.get(schema);
    if (!root) {
      root = protobuf.parse(schema).root;
      roots.set(schema, root);
    }

    return root;
  };
}

export async function parseProtobufResponse<T>(
  data: ArrayBuffer,
  schema: string,
  messageType: string,
  getRoot: (schema: string) => Promise<protobuf.Root>,
): Promise<T> {
  const root = await getRoot(schema);
  const message = root.lookupType(messageType).decode(new Uint8Array(data));

  return root.lookupType(messageType).toObject(message, {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true,
  }) as T;
}

export async function fetchProtobuf<T>(params: {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  schema: string;
  messageType: string;
  getRoot: (schema: string) => Promise<protobuf.Root>;
}): Promise<T> {
  const { schema, messageType, getRoot, ...fetchParams } = params;
  const arrayBuffer = await fetchProtobufBytes(fetchParams);

  return await parseProtobufResponse<T>(arrayBuffer, schema, messageType, getRoot);
}

export async function fetchProtobufBytes(params: {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}): Promise<ArrayBuffer> {
  const { url, method = "GET", headers = {}, body } = params;

  const response = await fetchWithTimeout(
    url,
    {
      method,
      headers: {
        "Accept-Encoding": "gzip",
        ...headers,
      },
      body,
    },
    RANK_FETCH_TIMEOUT_MS,
    "ranks.fetch",
    { url },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }

  let arrayBuffer = await readBodyWithTimeout(() => response.arrayBuffer(), RANK_BODY_TIMEOUT_MS, "ranks.body", {
    url,
  });
  const contentEncoding = response.headers.get("Content-Encoding");
  if ((contentEncoding === "gzip" || contentEncoding?.includes("gzip")) && hasGzipHeader(arrayBuffer)) {
    arrayBuffer = await readBodyWithTimeout(
      () => decompressGzip(arrayBuffer),
      RANK_DECOMPRESS_TIMEOUT_MS,
      "ranks.decompress",
      { url },
    );
  }

  return arrayBuffer;
}
