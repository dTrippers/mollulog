const encoder = new TextEncoder();

type R2PresignOptions = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  method: "GET" | "PUT";
  expiresSeconds: number;
  now?: Date;
};

export async function createR2PresignedUrl(options: R2PresignOptions): Promise<string> {
  if (options.expiresSeconds < 1 || options.expiresSeconds > 604800) {
    throw new Error("R2 presigned URL 만료시간은 1초부터 7일까지 가능해요");
  }

  const now = options.now ?? new Date();
  const amzDate = toAmzDate(now);
  const shortDate = amzDate.slice(0, 8);
  const scope = `${shortDate}/auto/s3/aws4_request`;
  const host = `${options.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePath(options.bucket)}/${encodePath(options.key)}`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${options.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(options.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  });
  params.sort();

  const canonicalRequest = [
    options.method,
    canonicalUri,
    params.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const dateKey = await hmac(`AWS4${options.secretAccessKey}`, shortDate);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  params.set("X-Amz-Signature", bytesToHex(await hmac(signingKey, stringToSign)));

  return `https://${host}${canonicalUri}?${params.toString()}`;
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hmac(key: string | Uint8Array, value: string): Promise<Uint8Array> {
  const keyBytes = typeof key === "string" ? encoder.encode(key) : Uint8Array.from(key);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes.buffer, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
