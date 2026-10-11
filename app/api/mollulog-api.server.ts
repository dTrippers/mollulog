import { createApiDocsResponse, createApiErrorBody } from "~/api/mollulog-api-docs.server";
import {
  API_MAX_REQUEST_BYTES,
  API_STUDENT_PAGE_SIZE,
  API_STUDENT_PAGE_SIZE_MAX,
  ApiInputError,
  parseApiStudentStatePatch,
  parseApiStudentStateRegistration,
} from "~/domain/mollulog-api";
import {
  API_MAX_REQUEST_SIZE_TEXT,
  API_PUBLIC_ERRORS,
  API_READ_WINDOW_SECONDS,
  API_STUDENT_PAGE_SIZE_MIN,
  API_STUDENT_QUERY_MAX_LENGTH,
  API_STUDENT_QUERY_MIN_LENGTH,
  type ApiPublicErrorCode,
  findApiRoute,
  isKnownApiRoutePath,
} from "~/domain/mollulog-api-spec";
import { isStaleStudentStateRequestError } from "~/domain/student-state-errors";
import { captureServerError, getLogger } from "~/lib/observability.server";
import {
  type ApiKeyAuthentication,
  type ApiWriteQuotaResult,
  authenticatePersonalApiKey,
  deleteApiRecruitedStudent,
  getApiRecruitedStudent,
  getApiRecruitedStudents,
  isApiStudentStateAvailable,
  patchApiRecruitedStudent,
  registerApiRecruitedStudent,
  reserveApiWriteQuota,
} from "~/models/mollulog-api";
import type { Student } from "~/models/student";
import { getAllStudents, getStudentPrimaryUids } from "~/models/student";

type StudentApiEnvironment = Pick<Env, "HYPERDRIVE" | "API_READ_RATE_LIMITER">;

class ApiHttpError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiPublicErrorCode,
    message: string,
    readonly options: {
      fields?: Array<{ field: string; message: string }>;
      headers?: Record<string, string>;
      internalReason?: string;
      /** The error that caused a 5xx response, kept for server-side logging only; never sent to clients. */
      underlying?: unknown;
    } = {},
  ) {
    super(message);
    this.status = API_PUBLIC_ERRORS[code].status;
  }

  get fields() {
    return this.options.fields;
  }

  get headers() {
    return this.options.headers;
  }

  get internalReason() {
    return this.options.internalReason;
  }

  get underlying() {
    return this.options.underlying;
  }
}

function apiJson(status: number, value: unknown, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Authorization",
  });
  for (const [name, entry] of Object.entries(extraHeaders ?? {})) headers.set(name, entry);
  return new Response(JSON.stringify(value), { status, headers });
}

function apiError(
  env: Env,
  code: ApiPublicErrorCode,
  message: string,
  fields?: ApiHttpError["fields"],
  headers?: Record<string, string>,
) {
  return apiJson(API_PUBLIC_ERRORS[code].status, createApiErrorBody(env.HOST, code, message, fields), headers);
}

/** Logs a 5xx cause with the request method, path and error code only; the token and headers are never included. */
function reportApiServerError(
  env: Env,
  ctx: ExecutionContext | undefined,
  request: Request,
  code: string,
  error: unknown,
) {
  const scope = { handler: "mollulog_api", method: request.method, path: new URL(request.url).pathname, code };
  getLogger(env, ctx, { handler: "mollulog_api" }).error("MolluLog API request failed", error, scope);
  captureServerError(error, scope);
}

function parseBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function parsePageSize(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw == null) return API_STUDENT_PAGE_SIZE;
  if (!/^\d+$/.test(raw))
    throw new ApiInputError("limit은 정수여야 해요", [{ field: "limit", message: "정수를 보내주세요" }]);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < API_STUDENT_PAGE_SIZE_MIN || value > API_STUDENT_PAGE_SIZE_MAX) {
    throw new ApiInputError(`limit은 ${API_STUDENT_PAGE_SIZE_MIN}부터 ${API_STUDENT_PAGE_SIZE_MAX} 사이여야 해요`, [
      {
        field: "limit",
        message: `${API_STUDENT_PAGE_SIZE_MIN}부터 ${API_STUDENT_PAGE_SIZE_MAX} 사이의 정수를 보내주세요`,
      },
    ]);
  }
  return value;
}

type StudentPageCursor = { afterStudentUid: string | null; seenStudentUids: string[] };

function encodeStudentCursor(studentUid: string, seenStudentUids: string[] = []): string {
  return btoa(JSON.stringify({ version: 1, studentUid, seenStudentUids }));
}

function decodeStudentCursor(cursor: string | null): StudentPageCursor {
  if (cursor == null) return { afterStudentUid: null, seenStudentUids: [] };
  try {
    const value = JSON.parse(atob(cursor)) as {
      version?: unknown;
      studentUid?: unknown;
      seenStudentUids?: unknown;
    };
    if (
      value.version !== 1 ||
      typeof value.studentUid !== "string" ||
      value.studentUid.length === 0 ||
      (value.seenStudentUids !== undefined &&
        (!Array.isArray(value.seenStudentUids) ||
          value.seenStudentUids.length > 1000 ||
          value.seenStudentUids.some((uid) => typeof uid !== "string")))
    ) {
      throw new Error("invalid cursor");
    }
    return {
      afterStudentUid: value.studentUid,
      seenStudentUids: (value.seenStudentUids ?? []) as string[],
    };
  } catch {
    throw new ApiInputError("cursor가 올바르지 않아요", [
      { field: "cursor", message: "목록에서 받은 cursor를 사용해주세요" },
    ]);
  }
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > API_MAX_REQUEST_BYTES) {
    throw new ApiHttpError("invalid_request", `요청 본문 크기는 ${API_MAX_REQUEST_SIZE_TEXT}를 넘을 수 없어요`);
  }
  if (request.body == null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > API_MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ApiHttpError("invalid_request", `요청 본문 크기는 ${API_MAX_REQUEST_SIZE_TEXT}를 넘을 수 없어요`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiHttpError("invalid_request", "Content-Type은 application/json이어야 해요");
  }
  const body = await readBoundedBody(request);
  if (body.byteLength === 0) throw new ApiInputError("JSON 요청 본문이 필요해요");
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new ApiInputError("JSON 형식이 올바르지 않아요");
  }
}

async function ensureEmptyBody(request: Request): Promise<void> {
  const body = await readBoundedBody(request);
  if (body.byteLength > 0) throw new ApiInputError("DELETE 요청에는 본문을 보낼 수 없어요");
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function catalogUnavailable(underlying?: unknown) {
  return new ApiHttpError("unavailable", "학생 정보를 확인할 수 없어요. 잠시 후 다시 시도해주세요", {
    internalReason: "student_catalog_unavailable",
    underlying,
  });
}

/** One BAQL lookup for the given UIDs. Transport and GraphQL failures become 503; a UID BAQL does not know is absent. */
async function lookupPrimaryStudentUids(env: Env, uids: string[]): Promise<Map<string, string | null>> {
  try {
    return await getStudentPrimaryUids(env, uids);
  } catch (error) {
    throw catalogUnavailable(error);
  }
}

/**
 * Resolves any battle-mode UID to the representative student in the catalog. Returns null for a UID BAQL does
 * not know, or when the representative is missing from the catalog; a BAQL row without a representative is a 503.
 */
async function findCanonicalStudent(env: Env, uid: string, students: Map<string, Student>): Promise<Student | null> {
  const primaryUids = await lookupPrimaryStudentUids(env, [uid]);
  if (!primaryUids.has(uid)) return null;
  const canonicalUid = primaryUids.get(uid);
  if (!canonicalUid) {
    throw catalogUnavailable(new Error(`BAQL returned no primary student for ${uid}`));
  }
  return students.get(canonicalUid) ?? null;
}

function requireReadScope(key: { readScope: boolean }) {
  if (!key.readScope) throw new ApiHttpError("forbidden", "이 키에는 학생 읽기 권한이 없어요");
}

function requireWriteScope(key: { writeScope: boolean }) {
  if (!key.writeScope) throw new ApiHttpError("forbidden", "이 키에는 학생 쓰기 권한이 없어요");
}

async function enforceReadLimit(env: StudentApiEnvironment, accountId: number): Promise<void> {
  if (!env.API_READ_RATE_LIMITER) {
    throw new ApiHttpError("unavailable", "요청 제한 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요", {
      internalReason: "rate_limiter_unavailable",
    });
  }
  let result: { success: boolean };
  try {
    result = await env.API_READ_RATE_LIMITER.limit({ key: String(accountId) });
  } catch (error) {
    throw new ApiHttpError("unavailable", "요청 제한 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요", {
      internalReason: "rate_limiter_unavailable",
      underlying: error,
    });
  }
  if (!result.success) {
    throw new ApiHttpError("rate_limited", "읽기 요청 한도를 초과했어요", {
      headers: { "Retry-After": String(API_READ_WINDOW_SECONDS) },
    });
  }
}

function catalogStudentResponse(student: Student) {
  return {
    studentUid: student.uid,
    name: student.name,
  };
}

function stateResponse<T extends object>(studentUid: string, state: T) {
  return { studentUid, ...state };
}

async function dispatchApiRequest(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const bearerToken = parseBearerToken(request);
  if (!bearerToken) throw new ApiHttpError("unauthorized", "Authorization: Bearer 키가 필요해요");

  let authentication: ApiKeyAuthentication;
  try {
    authentication = await authenticatePersonalApiKey(env, bearerToken, { ctx });
  } catch (error) {
    throw new ApiHttpError("unavailable", "인증을 확인할 수 없어요. 잠시 후 다시 시도해주세요", {
      internalReason: "authentication_unavailable",
      underlying: error,
    });
  }
  if (authentication.kind === "invalid") throw new ApiHttpError("unauthorized", "API 키가 유효하지 않아요");
  if (authentication.kind === "inactive") throw new ApiHttpError("forbidden", "활성 계정에서만 API를 사용할 수 있어요");
  const key = authentication.key;

  if (request.method === "GET") {
    requireReadScope(key);
    await enforceReadLimit(env, key.userId);
    let available: boolean;
    try {
      available = await isApiStudentStateAvailable(env, { ctx });
    } catch (error) {
      throw new ApiHttpError("unavailable", "학생 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요", {
        internalReason: "student_state_unavailable",
        underlying: error,
      });
    }
    if (!available)
      throw new ApiHttpError("unavailable", "학생 API가 아직 준비되지 않았어요", {
        internalReason: "student_state_unavailable",
      });
  } else {
    requireWriteScope(key);
    let quota: ApiWriteQuotaResult;
    try {
      quota = await reserveApiWriteQuota(env, key.userId, { ctx });
    } catch (error) {
      throw new ApiHttpError("unavailable", "요청 한도를 확인할 수 없어요. 학생 상태는 저장하지 않았어요", {
        internalReason: "write_quota_unavailable",
        underlying: error,
      });
    }
    if (!quota.allowed) {
      throw new ApiHttpError("rate_limited", "10분 쓰기 요청 한도를 초과했어요", {
        internalReason: "write_limit_exceeded",
        headers: { "Retry-After": String(quota.retryAfterSeconds) },
      });
    }
    let available: boolean;
    try {
      available = await isApiStudentStateAvailable(env, { ctx });
    } catch (error) {
      throw new ApiHttpError("unavailable", "학생 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요", {
        internalReason: "student_state_unavailable",
        underlying: error,
      });
    }
    if (!available)
      throw new ApiHttpError("unavailable", "학생 API가 아직 준비되지 않았어요", {
        internalReason: "student_state_unavailable",
      });
  }

  const method = request.method;
  const apiPath = pathname === "/v1" ? "/" : pathname.slice("/v1".length);
  const routeMatch = findApiRoute(method, apiPath);
  const routeId = routeMatch?.route.id;
  if (routeId === "findStudents") {
    const query = url.searchParams.get("query") ?? "";
    if (query.trim().length < API_STUDENT_QUERY_MIN_LENGTH || query.length > API_STUDENT_QUERY_MAX_LENGTH) {
      throw new ApiInputError(
        `query는 ${API_STUDENT_QUERY_MIN_LENGTH}자부터 ${API_STUDENT_QUERY_MAX_LENGTH}자까지 입력해주세요`,
        [
          {
            field: "query",
            message: `검색어는 ${API_STUDENT_QUERY_MIN_LENGTH}자부터 ${API_STUDENT_QUERY_MAX_LENGTH}자까지 입력해주세요`,
          },
        ],
      );
    }
    const limit = parsePageSize(url);
    const cursor = decodeStudentCursor(url.searchParams.get("cursor"));
    const students = await getAllStudents(env);
    const normalizedQuery = normalizeSearch(query);
    const matches = students
      .filter((student) =>
        [student.uid, student.name, student.familyName ?? "", ...student.altNames].some((value) =>
          normalizeSearch(value).includes(normalizedQuery),
        ),
      )
      .sort((left, right) => left.uid.localeCompare(right.uid))
      .filter((student) => cursor.afterStudentUid == null || student.uid > cursor.afterStudentUid)
      .slice(0, limit + 1);
    const pageCandidates = matches.slice(0, limit);
    const seenStudentUids = new Set(cursor.seenStudentUids);
    const studentsByUid = new Map(students.map((item) => [item.uid, item]));
    const candidateUids = pageCandidates.map((student) => student.uid);
    const primaryUids =
      candidateUids.length > 0 ? await lookupPrimaryStudentUids(env, candidateUids) : new Map<string, string | null>();
    const pageEntries: Array<{ uid: string; canonical: Student }> = [];
    for (const candidate of pageCandidates) {
      const canonicalUid = primaryUids.get(candidate.uid);
      if (!canonicalUid) {
        throw catalogUnavailable(new Error(`BAQL returned no primary student for ${candidate.uid}`));
      }
      const canonical = studentsByUid.get(canonicalUid);
      if (!canonical || seenStudentUids.has(canonical.uid)) continue;
      seenStudentUids.add(canonical.uid);
      pageEntries.push({ uid: candidate.uid, canonical });
    }
    const lastPageCandidate = pageCandidates.at(-1);
    return apiJson(200, {
      students: pageEntries.map(({ canonical }) => catalogStudentResponse(canonical)),
      nextCursor:
        matches.length > limit && lastPageCandidate
          ? encodeStudentCursor(lastPageCandidate.uid, [...seenStudentUids])
          : null,
    });
  }

  if (routeId === "listRecruitedStudents") {
    const limit = parsePageSize(url);
    const cursor = decodeStudentCursor(url.searchParams.get("cursor"));
    const rows = await getApiRecruitedStudents(
      env,
      key.userId,
      { ctx },
      { afterStudentUid: cursor.afterStudentUid, limit: limit + 1 },
    );
    const pageRows = rows.slice(0, limit);
    const students = await getAllStudents(env, true);
    const studentsByUid = new Map(students.map((student) => [student.uid, student]));
    const page = pageRows.map((row) => {
      const student = studentsByUid.get(row.studentUid);
      if (!student) {
        throw new ApiHttpError("unavailable", "학생 정보를 확인할 수 없어요", {
          internalReason: "student_catalog_unavailable",
          underlying: new Error(`recruited student ${row.studentUid} is missing from the catalog`),
        });
      }
      return stateResponse(student.uid, row.state);
    });
    const lastPageRow = pageRows.at(-1);
    return apiJson(200, {
      students: page,
      nextCursor: rows.length > limit && lastPageRow ? encodeStudentCursor(lastPageRow.studentUid) : null,
    });
  }

  if (routeId === "registerRecruitedStudent") {
    const input = parseApiStudentStateRegistration(await parseJsonBody(request));
    const students = await getAllStudents(env);
    const canonical = await findCanonicalStudent(
      env,
      input.studentUid,
      new Map(students.map((student) => [student.uid, student])),
    );
    if (!canonical) throw new ApiHttpError("not_found", "학생을 찾을 수 없어요");
    const result = await registerApiRecruitedStudent(
      env,
      key.userId,
      canonical.uid,
      input.state,
      { apiKeyUid: key.uid, apiKeyName: key.name },
      { ctx },
    );
    if (result.kind === "already_recruited")
      throw new ApiHttpError("student_already_recruited", "이미 모집한 학생이에요");
    return apiJson(201, stateResponse(canonical.uid, key.readScope ? result.state : {}));
  }

  const studentPath = routeMatch?.params.studentUid;
  if (studentPath !== undefined) {
    let requestedUid: string;
    try {
      requestedUid = decodeURIComponent(studentPath);
    } catch {
      throw new ApiInputError("학생 UID 형식이 올바르지 않아요", [
        { field: "studentUid", message: "문자열 UID를 확인해주세요" },
      ]);
    }
    const students = await getAllStudents(env, true);
    const canonical = await findCanonicalStudent(
      env,
      requestedUid,
      new Map(students.map((student) => [student.uid, student])),
    );
    if (!canonical) throw new ApiHttpError("not_found", "학생을 찾을 수 없어요");

    if (routeId === "getRecruitedStudent") {
      const row = await getApiRecruitedStudent(env, key.userId, canonical.uid, { ctx });
      if (!row) throw new ApiHttpError("student_not_recruited", "모집한 학생을 찾을 수 없어요");
      return apiJson(200, stateResponse(canonical.uid, row.state));
    }
    if (routeId === "patchRecruitedStudent") {
      const patch = parseApiStudentStatePatch(await parseJsonBody(request));
      const result = await patchApiRecruitedStudent(
        env,
        key.userId,
        canonical.uid,
        patch,
        { apiKeyUid: key.uid, apiKeyName: key.name },
        { ctx },
      );
      if (result.kind === "not_recruited")
        throw new ApiHttpError("student_not_recruited", "모집한 학생을 찾을 수 없어요");
      return apiJson(200, stateResponse(canonical.uid, key.readScope ? result.state : {}));
    }
    if (routeId === "deleteRecruitedStudent") {
      await ensureEmptyBody(request);
      const result = await deleteApiRecruitedStudent(
        env,
        key.userId,
        canonical.uid,
        { apiKeyUid: key.uid, apiKeyName: key.name },
        { ctx },
      );
      if (result.kind === "not_recruited")
        throw new ApiHttpError("student_not_recruited", "모집한 학생을 찾을 수 없어요");
      return apiJson(200, { studentUid: canonical.uid, deleted: true });
    }
  }

  if (isKnownApiRoutePath(apiPath)) {
    throw new ApiHttpError("invalid_request", "이 경로에서 사용할 수 없는 HTTP 메서드예요");
  }
  throw new ApiHttpError("not_found", "API 경로를 찾을 수 없어요");
}

/** Returns null for non-API traffic so the Worker can apply its regular web/session path. */
export async function handleMolluLogApiRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isVersionedApiPath = pathname === "/v1" || pathname.startsWith("/v1/");

  if (env.API_HOST) {
    const isApiHost = url.hostname.toLowerCase() === env.API_HOST.toLowerCase();
    if (isApiHost) {
      const docsResponse = createApiDocsResponse(pathname, request.url, env);
      if (docsResponse) return docsResponse;
      if (!isVersionedApiPath) return apiError(env, "not_found", "API 경로를 찾을 수 없어요");
    } else if (isVersionedApiPath) {
      return apiError(env, "not_found", `몰루로그 API는 https://${env.API_HOST}/v1 주소로 요청해주세요`);
    } else {
      return null;
    }
  } else {
    const docsResponse = createApiDocsResponse(pathname, request.url, env);
    if (docsResponse) return docsResponse;
    if (!isVersionedApiPath) return null;
  }

  try {
    return await dispatchApiRequest(request, env, ctx);
  } catch (error) {
    if (error instanceof ApiHttpError) {
      if (error.status >= 500 && error.underlying !== undefined) {
        reportApiServerError(env, ctx, request, error.internalReason ?? error.code, error.underlying);
      }
      return apiError(env, error.code, error.message, error.fields, error.headers);
    }
    if (error instanceof ApiInputError) return apiError(env, "invalid_request", error.message, error.fields);
    if (isStaleStudentStateRequestError(error)) {
      reportApiServerError(env, ctx, request, "student_state_unavailable", error);
      return apiError(env, "unavailable", "학생 API가 아직 준비되지 않았어요");
    }
    reportApiServerError(env, ctx, request, "internal_error", error);
    return apiError(env, "internal_error", "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요");
  }
}
