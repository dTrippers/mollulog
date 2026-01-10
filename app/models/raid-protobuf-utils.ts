import protobuf from "protobufjs";

/**
 * Base URL for the raid API server
 */
export const RAID_API_BASE_URL = "https://ranks.mollulog.net";

/**
 * Decompress gzip data
 */
export async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip");
  const stream = new Response(data).body?.pipeThrough(ds);
  if (!stream) {
    throw new Error("Failed to create decompression stream");
  }
  const response = await new Response(stream);
  return await response.arrayBuffer();
}

/**
 * Create a cached protobuf root parser
 */
export function createProtobufRootCache() {
  let root: protobuf.Root | null = null;

  return async (schema: string): Promise<protobuf.Root> => {
    if (!root) {
      root = protobuf.parse(schema).root;
    }
    return root;
  };
}

/**
 * Parse protobuf binary data to a typed object
 */
export async function parseProtobufResponse<T>(
  data: ArrayBuffer,
  schema: string,
  messageType: string,
  getRoot: (schema: string) => Promise<protobuf.Root>
): Promise<T> {
  const root = await getRoot(schema);
  const MessageType = root.lookupType(messageType);

  // Decode the protobuf message
  const message = MessageType.decode(new Uint8Array(data));
  return MessageType.toObject(message, {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true,
  }) as T;
}

/**
 * Fetch protobuf data from server with gzip support
 */
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

  // Handle gzip decompression
  let arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("Content-Encoding");
  if (contentType === "gzip" || contentType?.includes("gzip")) {
    arrayBuffer = await decompressGzip(arrayBuffer);
  }

  // Parse protobuf response
  return await parseProtobufResponse<T>(arrayBuffer, schema, messageType, getRoot);
}

