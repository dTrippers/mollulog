import { API_SCOPES } from "~/domain/mollulog-api-spec";
import {
  exchangeOAuthAuthorizationCode,
  OAuthInvalidClientError,
  OAuthInvalidGrantError,
} from "~/models/mollulog-oauth";

type TokenError = "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "server_error";

function tokenResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  const responseHeaders = new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Content-Type": "application/json; charset=utf-8",
  });
  new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function tokenError(error: TokenError, status: number, description: string, headers?: HeadersInit): Response {
  return tokenResponse(status, { error, error_description: description }, headers);
}

function readBasicClient(request: Request): { clientId: string; clientSecret: string } | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match) return null;
  try {
    const credentials = atob(match[1]);
    const separator = credentials.indexOf(":");
    if (separator < 1) return null;
    return { clientId: credentials.slice(0, separator), clientSecret: credentials.slice(separator + 1) };
  } catch {
    return null;
  }
}

async function readTokenFormBody(request: Request): Promise<string | null> {
  const maxBytes = 16 * 1024;
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function handleOAuthTokenRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") {
    return tokenError("invalid_request", 400, "POST 요청을 보내주세요.");
  }
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return tokenError("invalid_request", 400, "Content-Type은 application/x-www-form-urlencoded여야 해요.");
  }

  let body: string | null;
  try {
    body = await readTokenFormBody(request);
  } catch {
    return tokenError("invalid_request", 400, "요청 본문을 읽을 수 없어요.");
  }
  if (body === null) return tokenError("invalid_request", 400, "요청 본문이 너무 커요.");
  const form = new URLSearchParams(body);
  for (const key of new Set([...form.keys()])) {
    if (form.getAll(key).length > 1) return tokenError("invalid_request", 400, "요청 파라미터를 한 번씩만 보내주세요.");
  }
  const grantType = form.get("grant_type");
  if (!grantType) return tokenError("invalid_request", 400, "grant_type을 보내주세요.");
  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type", 400, "authorization_code grant만 지원해요.");
  }

  const code = form.get("code");
  const redirectUri = form.get("redirect_uri");
  if (!code || !redirectUri) {
    return tokenError("invalid_request", 400, "code와 redirect_uri를 보내주세요.");
  }

  const basicClient = readBasicClient(request);
  const hasBasicHeader = request.headers.has("Authorization");
  const postedClientId = form.get("client_id");
  const postedClientSecret = form.get("client_secret");
  if (hasBasicHeader && (!basicClient || postedClientId !== null || postedClientSecret !== null)) {
    return tokenError("invalid_client", 401, "클라이언트 인증에 실패했어요.", {
      "WWW-Authenticate": 'Basic realm="oauth/token"',
    });
  }
  const credentials = basicClient ??
    (postedClientId && postedClientSecret ? { clientId: postedClientId, clientSecret: postedClientSecret } : null);
  if (!credentials) {
    return tokenError("invalid_client", 401, "클라이언트 인증이 필요해요.", {
      "WWW-Authenticate": 'Basic realm="oauth/token"',
    });
  }

  const codeVerifier = form.get("code_verifier");
  if (codeVerifier !== null && !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
    return tokenError("invalid_request", 400, "code_verifier 형식이 올바르지 않아요.");
  }
  try {
    const result = await exchangeOAuthAuthorizationCode(
      env,
      { ...credentials, code, redirectUri, codeVerifier },
      { ctx },
    );
    return tokenResponse(200, {
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: result.expiresIn,
      scope: API_SCOPES.filter((scope) => result.scopes.includes(scope)).join(" "),
    });
  } catch (error) {
    if (error instanceof OAuthInvalidClientError) {
      return tokenError("invalid_client", 401, "클라이언트 인증에 실패했어요.", {
        "WWW-Authenticate": 'Basic realm="oauth/token"',
      });
    }
    if (error instanceof OAuthInvalidGrantError) {
      return tokenError("invalid_grant", 400, "authorization code가 유효하지 않거나 만료됐어요.");
    }
    return tokenError("server_error", 500, "토큰을 발급할 수 없어요. 잠시 후 다시 시도해주세요.");
  }
}
