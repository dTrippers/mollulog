import protobuf from "protobufjs";

export const RANK_API_BASE_URL = import.meta.env.VITE_RANK_API_BASE_URL || "https://ranks.baql.net";

export async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip");
  const stream = new Response(data).body?.pipeThrough(ds);

  if (!stream) {
    throw new Error("Failed to create decompression stream");
  }

  return await new Response(stream).arrayBuffer();
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
  const { url, method = "GET", headers = {}, body, schema, messageType, getRoot } = params;

  const response = await fetch(url, {
    method,
    headers: {
      "Accept-Encoding": "gzip",
      ...headers,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }

  let arrayBuffer = await response.arrayBuffer();
  const contentEncoding = response.headers.get("Content-Encoding");
  if (contentEncoding === "gzip" || contentEncoding?.includes("gzip")) {
    arrayBuffer = await decompressGzip(arrayBuffer);
  }

  return await parseProtobufResponse<T>(arrayBuffer, schema, messageType, getRoot);
}
