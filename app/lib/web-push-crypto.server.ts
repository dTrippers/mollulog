const encoder = new TextEncoder();

export class WebPushConfigurationError extends Error {
  constructor() {
    super("브라우저 알림 보안 설정이 준비되지 않았어요.");
    this.name = "WebPushConfigurationError";
  }
}

export class WebPushSubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebPushSubscriptionValidationError";
  }
}

function toBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new WebPushSubscriptionValidationError("브라우저 알림 키를 확인할 수 없어요.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new WebPushSubscriptionValidationError("브라우저 알림 키를 확인할 수 없어요.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  if (!secret.trim()) throw new WebPushConfigurationError();
  const keyBytes = await digest(secret);
  return crypto.subtle.importKey("raw", keyBytes as unknown as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function fingerprintWebPushEndpoint(endpoint: string): Promise<string> {
  return toBase64Url(await digest(endpoint));
}

export function validateWebPushEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length < 20 || value.length > 4096) {
    throw new WebPushSubscriptionValidationError("브라우저 알림 구독 주소를 확인할 수 없어요.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebPushSubscriptionValidationError("브라우저 알림 구독 주소를 확인할 수 없어요.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new WebPushSubscriptionValidationError("브라우저 알림 구독 주소를 확인할 수 없어요.");
  }
  return value;
}

export async function encryptWebPushSecret(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(value),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(encrypted)}`;
}

export async function decryptWebPushSecret(value: string, secret: string): Promise<string> {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) throw new WebPushConfigurationError();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(encodedIv) as unknown as BufferSource },
    await encryptionKey(secret),
    fromBase64Url(encodedCiphertext) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

export type WebPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export function validateWebPushSubscription(input: WebPushSubscriptionInput): WebPushSubscriptionInput {
  const endpoint = validateWebPushEndpoint(input.endpoint);
  if (!input.keys || typeof input.keys.p256dh !== "string" || typeof input.keys.auth !== "string") {
    throw new WebPushSubscriptionValidationError("브라우저 알림 암호화 키를 확인할 수 없어요.");
  }
  const p256dh = fromBase64Url(input.keys.p256dh);
  const auth = fromBase64Url(input.keys.auth);
  if (p256dh.byteLength !== 65 || auth.byteLength < 8 || auth.byteLength > 32) {
    throw new WebPushSubscriptionValidationError("브라우저 알림 암호화 키를 확인할 수 없어요.");
  }
  if (
    input.expirationTime !== undefined &&
    input.expirationTime !== null &&
    (!Number.isFinite(input.expirationTime) || input.expirationTime < 0)
  ) {
    throw new WebPushSubscriptionValidationError("브라우저 알림 만료 시간을 확인할 수 없어요.");
  }
  return { ...input, endpoint };
}
