import {
  API_MAX_REQUEST_BYTES,
  API_STUDENT_PAGE_SIZE,
  API_STUDENT_PAGE_SIZE_MAX,
  ApiInputError,
  parseApiStudentStatePatch,
  parseApiStudentStateRegistration,
} from "~/domain/mollulog-api";
import { isStaleStudentStateRequestError } from "~/domain/student-state-errors";
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
import { getAllStudents, getStudentVariantIdentity } from "~/models/student";

type StudentApiEnvironment = Pick<Env, "HYPERDRIVE" | "API_READ_RATE_LIMITER">;

class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Array<{ field: string; message: string }>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
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
  status: number,
  code: string,
  message: string,
  fields?: ApiHttpError["fields"],
  headers?: Record<string, string>,
) {
  return apiJson(status, { error: { code, message, ...(fields ? { fields } : {}) } }, headers);
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
  if (!Number.isSafeInteger(value) || value < 1 || value > API_STUDENT_PAGE_SIZE_MAX) {
    throw new ApiInputError(`limit은 1부터 ${API_STUDENT_PAGE_SIZE_MAX} 사이여야 해요`, [
      { field: "limit", message: `1부터 ${API_STUDENT_PAGE_SIZE_MAX} 사이의 정수를 보내주세요` },
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
    throw new ApiHttpError(413, "payload_too_large", "요청 본문은 1MiB 이하여야 해요");
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
        throw new ApiHttpError(413, "payload_too_large", "요청 본문은 1MiB 이하여야 해요");
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
    throw new ApiHttpError(415, "unsupported_media_type", "Content-Type은 application/json이어야 해요");
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

async function findCanonicalStudent(env: Env, uid: string, students: Map<string, Student>): Promise<Student | null> {
  const inputStudent = students.get(uid);
  if (!inputStudent) return null;
  const identity = await getStudentVariantIdentity(env, uid);
  const canonicalUid = identity?.studentVariant?.primaryStudent?.uid;
  if (!identity || !canonicalUid) {
    throw new ApiHttpError(
      503,
      "student_catalog_unavailable",
      "학생 정보를 확인할 수 없어요. 잠시 후 다시 시도해주세요",
    );
  }
  const canonical = students.get(canonicalUid);
  if (!canonical) {
    throw new ApiHttpError(404, "student_not_found", "학생을 찾을 수 없어요");
  }
  return canonical;
}

function requireReadScope(key: { readScope: boolean }) {
  if (!key.readScope) throw new ApiHttpError(403, "insufficient_scope", "이 키에는 학생 읽기 권한이 없어요");
}

function requireWriteScope(key: { writeScope: boolean }) {
  if (!key.writeScope) throw new ApiHttpError(403, "insufficient_scope", "이 키에는 학생 쓰기 권한이 없어요");
}

async function enforceReadLimit(env: StudentApiEnvironment, accountId: number): Promise<void> {
  if (!env.API_READ_RATE_LIMITER) {
    throw new ApiHttpError(
      503,
      "rate_limiter_unavailable",
      "요청 제한 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요",
    );
  }
  let result: { success: boolean };
  try {
    result = await env.API_READ_RATE_LIMITER.limit({ key: String(accountId) });
  } catch {
    throw new ApiHttpError(
      503,
      "rate_limiter_unavailable",
      "요청 제한 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요",
    );
  }
  if (!result.success) {
    throw new ApiHttpError(429, "rate_limit_exceeded", "읽기 요청 한도를 초과했어요", undefined, {
      "Retry-After": "60",
    });
  }
}

function isKnownReadRoute(pathname: string): boolean {
  return pathname === "/v1/students" || pathname === "/v1/me/students" || /^\/v1\/me\/students\/[^/]+$/.test(pathname);
}

function isKnownWriteRoute(pathname: string): boolean {
  return pathname === "/v1/me/students" || /^\/v1\/me\/students\/[^/]+$/.test(pathname);
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
  if (!bearerToken) throw new ApiHttpError(401, "unauthorized", "Authorization: Bearer 키가 필요해요");

  let authentication: ApiKeyAuthentication;
  try {
    authentication = await authenticatePersonalApiKey(env, bearerToken, { ctx });
  } catch {
    throw new ApiHttpError(503, "authentication_unavailable", "인증을 확인할 수 없어요. 잠시 후 다시 시도해주세요");
  }
  if (authentication.kind === "invalid") throw new ApiHttpError(401, "unauthorized", "API 키가 유효하지 않아요");
  if (authentication.kind === "inactive")
    throw new ApiHttpError(403, "account_inactive", "활성 계정에서만 API를 사용할 수 있어요");
  const key = authentication.key;

  if (request.method === "GET") {
    requireReadScope(key);
    await enforceReadLimit(env, key.userId);
    let available: boolean;
    try {
      available = await isApiStudentStateAvailable(env, { ctx });
    } catch {
      throw new ApiHttpError(
        503,
        "student_state_unavailable",
        "학생 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요",
      );
    }
    if (!available) throw new ApiHttpError(503, "student_state_unavailable", "학생 API가 아직 준비되지 않았어요");
  } else {
    requireWriteScope(key);
    let quota: ApiWriteQuotaResult;
    try {
      quota = await reserveApiWriteQuota(env, key.userId, { ctx });
    } catch {
      throw new ApiHttpError(
        503,
        "write_quota_unavailable",
        "요청 한도를 확인할 수 없어요. 학생 상태는 저장하지 않았어요",
      );
    }
    if (!quota.allowed) {
      throw new ApiHttpError(429, "write_limit_exceeded", "10분 쓰기 요청 한도를 초과했어요", undefined, {
        "Retry-After": String(quota.retryAfterSeconds),
      });
    }
    let available: boolean;
    try {
      available = await isApiStudentStateAvailable(env, { ctx });
    } catch {
      throw new ApiHttpError(
        503,
        "student_state_unavailable",
        "학생 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요",
      );
    }
    if (!available) throw new ApiHttpError(503, "student_state_unavailable", "학생 API가 아직 준비되지 않았어요");
  }

  const method = request.method;
  if (method === "GET" && pathname === "/v1/students") {
    const query = url.searchParams.get("query") ?? "";
    if (query.trim().length === 0 || query.length > 200) {
      throw new ApiInputError("query는 1자부터 200자까지 입력해주세요", [
        { field: "query", message: "검색어는 1자부터 200자까지 입력해주세요" },
      ]);
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
    const normalized = await Promise.all(
      pageCandidates.map(async (student) => {
        const canonical = await findCanonicalStudent(
          env,
          student.uid,
          new Map(students.map((item) => [item.uid, item])),
        );
        if (!canonical || seenStudentUids.has(canonical.uid)) return null;
        return { uid: student.uid, canonical };
      }),
    );
    const pageEntries: Array<{ uid: string; canonical: Student }> = [];
    for (const entry of normalized) {
      if (!entry || seenStudentUids.has(entry.canonical.uid)) continue;
      seenStudentUids.add(entry.canonical.uid);
      pageEntries.push(entry);
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

  if (method === "GET" && pathname === "/v1/me/students") {
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
      if (!student) throw new ApiHttpError(503, "student_catalog_unavailable", "학생 정보를 확인할 수 없어요");
      return stateResponse(student.uid, row.state);
    });
    const lastPageRow = pageRows.at(-1);
    return apiJson(200, {
      students: page,
      nextCursor: rows.length > limit && lastPageRow ? encodeStudentCursor(lastPageRow.studentUid) : null,
    });
  }

  if (method === "POST" && pathname === "/v1/me/students") {
    const input = parseApiStudentStateRegistration(await parseJsonBody(request));
    const students = await getAllStudents(env);
    const canonical = await findCanonicalStudent(
      env,
      input.studentUid,
      new Map(students.map((student) => [student.uid, student])),
    );
    if (!canonical) throw new ApiHttpError(404, "student_not_found", "학생을 찾을 수 없어요");
    const result = await registerApiRecruitedStudent(
      env,
      key.userId,
      canonical.uid,
      input.state,
      { apiKeyUid: key.uid, apiKeyName: key.name },
      { ctx },
    );
    if (result.kind === "already_recruited")
      throw new ApiHttpError(409, "student_already_recruited", "이미 모집한 학생이에요");
    return apiJson(201, stateResponse(canonical.uid, key.readScope ? result.state : {}));
  }

  const studentPath = pathname.match(/^\/v1\/me\/students\/([^/]+)$/);
  if (studentPath) {
    let requestedUid: string;
    try {
      requestedUid = decodeURIComponent(studentPath[1]);
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
    if (!canonical) throw new ApiHttpError(404, "student_not_found", "학생을 찾을 수 없어요");

    if (method === "GET") {
      const row = await getApiRecruitedStudent(env, key.userId, canonical.uid, { ctx });
      if (!row) throw new ApiHttpError(404, "student_not_recruited", "모집한 학생을 찾을 수 없어요");
      return apiJson(200, stateResponse(canonical.uid, row.state));
    }
    if (method === "PATCH") {
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
        throw new ApiHttpError(404, "student_not_recruited", "모집한 학생을 찾을 수 없어요");
      return apiJson(200, stateResponse(canonical.uid, key.readScope ? result.state : {}));
    }
    if (method === "DELETE") {
      await ensureEmptyBody(request);
      const result = await deleteApiRecruitedStudent(
        env,
        key.userId,
        canonical.uid,
        { apiKeyUid: key.uid, apiKeyName: key.name },
        { ctx },
      );
      if (result.kind === "not_recruited")
        throw new ApiHttpError(404, "student_not_recruited", "모집한 학생을 찾을 수 없어요");
      return apiJson(200, { studentUid: canonical.uid, deleted: true });
    }
  }

  if (isKnownReadRoute(pathname) || isKnownWriteRoute(pathname)) {
    throw new ApiHttpError(405, "method_not_allowed", "이 경로에서 사용할 수 없는 HTTP 메서드예요");
  }
  throw new ApiHttpError(404, "not_found", "API 경로를 찾을 수 없어요");
}

/** Returns null for non-API traffic so the Worker can apply its regular web/session path. */
export async function handleMolluLogApiRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/v1" && !pathname.startsWith("/v1/")) return null;
  try {
    return await dispatchApiRequest(request, env, ctx);
  } catch (error) {
    if (error instanceof ApiHttpError)
      return apiError(error.status, error.code, error.message, error.fields, error.headers);
    if (error instanceof ApiInputError) return apiError(400, error.code, error.message, error.fields);
    if (isStaleStudentStateRequestError(error)) {
      return apiError(503, "student_state_unavailable", "학생 API가 아직 준비되지 않았어요");
    }
    return apiError(500, "internal_error", "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요");
  }
}
