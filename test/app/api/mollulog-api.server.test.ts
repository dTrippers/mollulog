import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TestRateLimiter = { limit: jest.Mock<() => Promise<{ success: boolean }>> };

const mockApi = {
  authenticatePersonalApiKey: jest.fn<AsyncMock>(),
  deleteApiRecruitedStudent: jest.fn<AsyncMock>(),
  getApiRecruitedStudent: jest.fn<AsyncMock>(),
  getApiRecruitedStudents: jest.fn<AsyncMock>(),
  getPersonalApiSubject: jest.fn<AsyncMock>(),
  isApiStudentStateAvailable: jest.fn<AsyncMock>(),
  patchApiRecruitedStudent: jest.fn<AsyncMock>(),
  registerApiRecruitedStudent: jest.fn<AsyncMock>(),
  reserveApiWriteQuota: jest.fn<AsyncMock>(),
};
const mockOAuth = { authenticateOAuthAccessToken: jest.fn<AsyncMock>() };
const mockStudents = {
  getAllStudents: jest.fn<AsyncMock>(),
  getStudentPrimaryUids: jest.fn<AsyncMock>(),
  getStudentOtherFormUids: jest.fn<AsyncMock>(),
};
const mockSensei = { getSenseiById: jest.fn<AsyncMock>() };
const mockLogger = { error: jest.fn<AsyncMock>() };
const mockObservability = {
  captureServerError: jest.fn<AsyncMock>(),
  getLogger: jest.fn<() => typeof mockLogger>(),
};
/** BAQL's view of each UID: another form-change record maps to its representative, a costume to itself. */
let baqlPrimaryUids: Record<string, string> = {};

jest.mock("~/models/mollulog-api", () => mockApi);
jest.mock("~/models/mollulog-oauth", () => ({
  ...jest.requireActual<typeof import("~/models/mollulog-oauth")>("~/models/mollulog-oauth"),
  ...mockOAuth,
}));
jest.mock("~/models/student", () => mockStudents);
jest.mock("~/models/sensei", () => mockSensei);
jest.mock("~/lib/observability.server", () => mockObservability);

import { handleMolluLogApiRequest } from "~/api/mollulog-api.server";

const student = {
  uid: "10000",
  name: "Aru",
  familyName: null,
  altNames: ["Aru"],
  school: "Gehenna",
  initialTier: 3,
  order: 1,
  attackType: "explosive",
  defenseType: "lightArmor",
  position: "middle",
  tacticRole: "damageDealer",
  birthday: new Date("2000-01-01T00:00:00.000Z"),
  role: "striker",
  equipments: [],
  released: true,
};

function createEnv(readLimit = true, apiHost?: string): Env {
  const limiter: TestRateLimiter = {
    limit: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
  };
  return {
    HOST: "https://mollulog.net",
    API_HOST: apiHost,
    HYPERDRIVE: { connectionString: "postgres://test" },
    API_READ_RATE_LIMITER: readLimit ? (limiter as unknown as RateLimit) : undefined,
  } as unknown as Env;
}

function request(path: string, method = "GET", options: { token?: string; body?: string; contentType?: string } = {}) {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("Content-Type", options.contentType ?? "application/json");
  headers.set("Cookie", "__session=web-session");
  return new Request(`https://api.mollulog.net${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

describe("MolluLog v1 API entry", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockApi.authenticatePersonalApiKey.mockResolvedValue({
      kind: "authenticated",
      key: { kind: "personal", uid: "key-uid", name: "test", userId: 5, scopes: ["students:read", "students:write"] },
    });
    mockApi.isApiStudentStateAvailable.mockResolvedValue(true);
    mockApi.reserveApiWriteQuota.mockResolvedValue({ allowed: true, used: 1, resetsAt: new Date() });
    mockApi.getPersonalApiSubject.mockResolvedValue("mllg_pu_user-subject");
    mockOAuth.authenticateOAuthAccessToken.mockResolvedValue({ kind: "invalid" });
    mockSensei.getSenseiById.mockResolvedValue({ username: "sensei", profileStudentId: null });
    mockStudents.getAllStudents.mockResolvedValue([student]);
    mockStudents.getStudentOtherFormUids.mockResolvedValue({});
    baqlPrimaryUids = { "10000": "10000", "10001": "10000", "10002": "10002" };
    mockStudents.getStudentPrimaryUids.mockImplementation(async (...args: unknown[]) => {
      const uids = args[1] as string[];
      return new Map(uids.filter((uid) => uid in baqlPrimaryUids).map((uid) => [uid, baqlPrimaryUids[uid]]));
    });
    mockObservability.getLogger.mockReturnValue(mockLogger);
  });

  it("leaves non-API paths to the web session and SPA handler", async () => {
    expect(await handleMolluLogApiRequest(request("/students", "GET"), createEnv())).toBeNull();
    expect(mockApi.authenticatePersonalApiKey).not.toHaveBeenCalled();
  });

  it("serves public documents without a bearer key or student-state availability", async () => {
    mockApi.isApiStudentStateAvailable.mockResolvedValue(false);
    const openApi = await handleMolluLogApiRequest(request("/v1/openapi.json"), createEnv());
    const llms = await handleMolluLogApiRequest(request("/llms.txt"), createEnv());

    expect(openApi?.status).toBe(200);
    expect(openApi?.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(openApi?.headers.get("Vary")).toBeNull();
    expect(openApi?.headers.get("Content-Type")).toContain("application/json; charset=utf-8");
    expect(llms?.status).toBe(200);
    expect(llms?.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(llms?.headers.get("Vary")).toBeNull();
    expect(llms?.headers.get("Content-Type")).toContain("text/markdown; charset=utf-8");
    expect(mockApi.authenticatePersonalApiKey).not.toHaveBeenCalled();
    expect(mockApi.isApiStudentStateAvailable).not.toHaveBeenCalled();
  });

  it("serves discovery and rejects non-API paths on the production API host", async () => {
    const env = createEnv(true, "api.mollulog.net");
    const discovery = await handleMolluLogApiRequest(request("/"), env);
    const unknown = await handleMolluLogApiRequest(request("/developers/docs"), env);
    const tokenEndpoint = await handleMolluLogApiRequest(
      new Request("https://api.mollulog.net/oauth/token", { method: "POST" }),
      env,
    );

    expect(discovery?.status).toBe(200);
    expect(await discovery?.json()).toMatchObject({
      name: "MolluLog API",
      documents: {
        llms: "https://api.mollulog.net/llms.txt",
        llmsFull: "https://api.mollulog.net/llms-full.txt",
        openApi: "https://api.mollulog.net/v1/openapi.json",
      },
    });
    expect(unknown?.status).toBe(404);
    expect(tokenEndpoint?.status).toBe(400);
    expect(tokenEndpoint?.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await tokenEndpoint?.json()).toMatchObject({ error: "invalid_request" });
    expect(await unknown?.json()).toMatchObject({
      error: { code: "not_found", docs: "https://mollulog.net/developers/docs#error-not_found" },
    });
    expect(mockApi.authenticatePersonalApiKey).not.toHaveBeenCalled();
  });

  it("directs production web-host API requests to the canonical API host", async () => {
    const env = createEnv(true, "api.mollulog.net");
    const response = await handleMolluLogApiRequest(new Request("https://mollulog.net/v1/students?query=Aru"), env);

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({
      error: {
        code: "not_found",
        message: "몰루로그 API는 https://api.mollulog.net/v1 주소로 요청해주세요",
        docs: "https://mollulog.net/developers/docs#error-not_found",
      },
    });
    expect(mockApi.authenticatePersonalApiKey).not.toHaveBeenCalled();
  });

  it("does not accept a web session cookie as API authentication", async () => {
    const response = await handleMolluLogApiRequest(request("/v1/me/students"), createEnv());

    expect(response?.status).toBe(401);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response?.headers.get("Content-Type")).toContain("application/json");
    expect(await response?.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Authorization: Bearer API 키 또는 액세스 토큰이 필요해요",
        docs: "https://mollulog.net/developers/docs#error-unauthorized",
      },
    });
    expect(mockApi.authenticatePersonalApiKey).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials and applies the scope required by the matched route", async () => {
    mockApi.authenticatePersonalApiKey.mockResolvedValueOnce({ kind: "invalid" });
    const invalid = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bad" }),
      createEnv(),
    );
    expect(invalid?.status).toBe(401);

    mockApi.authenticatePersonalApiKey.mockResolvedValueOnce({ kind: "inactive" });
    const inactive = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bad" }),
      createEnv(),
    );
    expect(inactive?.status).toBe(403);

    mockApi.authenticatePersonalApiKey.mockResolvedValueOnce({
      kind: "authenticated",
      key: { kind: "personal", uid: "key", name: "write only", userId: 5, scopes: ["students:write"] },
    });
    const denied = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bad" }),
      createEnv(),
    );
    expect(denied?.status).toBe(200);
    expect(mockApi.isApiStudentStateAvailable).toHaveBeenCalledTimes(1);
  });

  it("returns profile data with the profile scope without checking student-state availability", async () => {
    mockApi.authenticatePersonalApiKey.mockResolvedValueOnce({
      kind: "authenticated",
      key: { kind: "personal", uid: "profile-key", name: "profile", userId: 5, scopes: ["profile"] },
    });
    const response = await handleMolluLogApiRequest(request("/v1/me", "GET", { token: "profile-token" }), createEnv());

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      id: "mllg_pu_user-subject",
      username: "sensei",
      profileStudent: null,
    });
    expect(mockApi.isApiStudentStateAvailable).not.toHaveBeenCalled();
    expect(mockApi.getPersonalApiSubject).toHaveBeenCalledWith(expect.anything(), 5, { ctx: undefined });
  });

  it("uses the OAuth grant subject for /me", async () => {
    mockOAuth.authenticateOAuthAccessToken.mockResolvedValueOnce({
      kind: "authenticated",
      principal: {
        kind: "oauth",
        uid: "app-uid",
        userId: 5,
        scopes: ["profile"],
        subject: "application-specific-subject",
        applicationUid: "app-uid",
        applicationName: "Tool",
      },
    });

    const response = await handleMolluLogApiRequest(
      request("/v1/me", "GET", { token: `mllg_ot_${"a".repeat(64)}` }),
      createEnv(),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      id: "application-specific-subject",
      username: "sensei",
      profileStudent: null,
    });
    expect(mockApi.getPersonalApiSubject).not.toHaveBeenCalled();
    expect(mockApi.isApiStudentStateAvailable).not.toHaveBeenCalled();
  });

  it("denies a profile route when the credential has only student scope", async () => {
    mockApi.authenticatePersonalApiKey.mockResolvedValueOnce({
      kind: "authenticated",
      key: { kind: "personal", uid: "student-key", name: "student", userId: 5, scopes: ["students:read"] },
    });
    const response = await handleMolluLogApiRequest(request("/v1/me", "GET", { token: "student-token" }), createEnv());

    expect(response?.status).toBe(403);
    expect(mockApi.getPersonalApiSubject).not.toHaveBeenCalled();
  });

  it("fails closed if the read limiter is missing or denies the account", async () => {
    const missing = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bearer" }),
      createEnv(false),
    );
    expect(missing?.status).toBe(503);
    expect(mockObservability.captureServerError).not.toHaveBeenCalled();

    const deniedEnv = createEnv();
    const limit = deniedEnv.API_READ_RATE_LIMITER as unknown as TestRateLimiter;
    limit.limit.mockResolvedValueOnce({ success: false });
    const denied = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bearer" }),
      deniedEnv,
    );
    expect(denied?.status).toBe(429);
    expect(denied?.headers.get("Retry-After")).toBe("60");
  });

  it("keeps the API unavailable until canonical student-state mode is active", async () => {
    mockApi.isApiStudentStateAvailable.mockResolvedValue(false);
    const response = await handleMolluLogApiRequest(
      request("/v1/me/students", "GET", { token: "bearer" }),
      createEnv(),
    );

    expect(response?.status).toBe(503);
    expect(mockObservability.captureServerError).not.toHaveBeenCalled();
    expect(mockApi.getApiRecruitedStudents).not.toHaveBeenCalled();
  });

  it("reserves quota before body validation and rejects object arrays for writes", async () => {
    const response = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", { token: "bearer", body: "[]" }),
      createEnv(),
    );

    expect(response?.status).toBe(400);
    expect(mockApi.reserveApiWriteQuota).toHaveBeenCalledWith(expect.anything(), 5, { ctx: undefined });
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();
  });

  it("paginates recruited students and distinguishes detail success from a missing record", async () => {
    const secondStudent = { ...student, uid: "10001", name: "Mutsuki" };
    mockStudents.getAllStudents.mockResolvedValue([student, secondStudent]);
    const firstState = { tier: 5, weaponTier: 0, level: 80 };
    const secondState = { tier: 4, weaponTier: 0, level: null };
    mockApi.getApiRecruitedStudents
      .mockResolvedValueOnce([
        { studentUid: "10000", state: firstState },
        { studentUid: "10001", state: secondState },
      ])
      .mockResolvedValueOnce([{ studentUid: "10001", state: secondState }]);

    const firstPageResponse = await handleMolluLogApiRequest(
      request("/v1/me/students?limit=1", "GET", { token: "bearer" }),
      createEnv(),
    );
    const firstPage = (await firstPageResponse?.json()) as {
      students: Array<{ studentUid: string; level: number | null }>;
      nextCursor: string;
    };
    expect(firstPageResponse?.status).toBe(200);
    expect(firstPage.students).toEqual([{ studentUid: "10000", ...firstState }]);
    expect(JSON.parse(atob(firstPage.nextCursor))).toEqual({
      version: 1,
      studentUid: "10000",
      seenStudentUids: [],
    });

    const secondPageResponse = await handleMolluLogApiRequest(
      request(`/v1/me/students?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`, "GET", {
        token: "bearer",
      }),
      createEnv(),
    );
    expect(await secondPageResponse?.json()).toEqual({
      students: [{ studentUid: "10001", ...secondState }],
      nextCursor: null,
    });

    mockApi.getApiRecruitedStudent.mockResolvedValueOnce({ state: firstState });
    const detailResponse = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(await detailResponse?.json()).toEqual({ studentUid: "10000", ...firstState });

    mockApi.getApiRecruitedStudent.mockResolvedValueOnce(null);
    const missingResponse = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(missingResponse?.status).toBe(404);
    expect(await missingResponse?.json()).toMatchObject({ error: { code: "student_not_recruited" } });
  });

  it("returns write conflict and missing errors and deletes a mode UID with only an acknowledgement", async () => {
    const body = JSON.stringify({ studentUid: "10000", tier: 5, weaponTier: 0 });
    mockApi.registerApiRecruitedStudent.mockResolvedValueOnce({ kind: "already_recruited" });
    const conflict = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", { token: "bearer", body }),
      createEnv(),
    );
    expect(conflict?.status).toBe(409);
    expect(await conflict?.json()).toMatchObject({ error: { code: "student_already_recruited" } });

    mockApi.patchApiRecruitedStudent.mockResolvedValueOnce({ kind: "not_recruited" });
    const missing = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "PATCH", { token: "bearer", body: JSON.stringify({ level: 80 }) }),
      createEnv(),
    );
    expect(missing?.status).toBe(404);
    expect(await missing?.json()).toMatchObject({ error: { code: "student_not_recruited" } });

    const mode = { ...student, uid: "10001", name: "Aru Mode" };
    mockStudents.getAllStudents.mockResolvedValue([student, mode]);
    const withBody = await handleMolluLogApiRequest(
      request("/v1/me/students/10001", "DELETE", { token: "bearer", body: "{}" }),
      createEnv(),
    );
    expect(withBody?.status).toBe(400);
    expect(mockApi.deleteApiRecruitedStudent).not.toHaveBeenCalled();

    mockApi.deleteApiRecruitedStudent.mockResolvedValueOnce({ kind: "deleted" });
    const deleted = await handleMolluLogApiRequest(
      request("/v1/me/students/10001", "DELETE", { token: "bearer" }),
      createEnv(),
    );
    expect(deleted?.status).toBe(200);
    expect(await deleted?.json()).toEqual({ studentUid: "10000", deleted: true });
    expect(mockApi.deleteApiRecruitedStudent).toHaveBeenCalledWith(
      expect.anything(),
      5,
      "10000",
      { apiKeyUid: "key-uid", apiKeyName: "test" },
      { ctx: undefined },
    );
  });

  it("denies write requests to a read-only key before reserving quota", async () => {
    mockApi.authenticatePersonalApiKey.mockResolvedValue({
      kind: "authenticated",
      key: { kind: "personal", uid: "read-key", name: "read only", userId: 5, scopes: ["students:read"] },
    });

    const response = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", {
        token: "bearer",
        body: JSON.stringify({ studentUid: "10000", tier: 5, weaponTier: 0 }),
      }),
      createEnv(),
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({
      error: { code: "forbidden", docs: "https://mollulog.net/developers/docs#error-forbidden" },
    });
    expect(mockApi.reserveApiWriteQuota).not.toHaveBeenCalled();
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();
  });

  it("fails closed for quota storage errors and returns Retry-After when quota is exhausted", async () => {
    mockApi.reserveApiWriteQuota.mockRejectedValueOnce(new Error("private database details"));
    const payload = JSON.stringify({ studentUid: "10000", tier: 5, weaponTier: 0 });
    const unavailable = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", { token: "bearer", body: payload }),
      createEnv(),
    );
    expect(unavailable?.status).toBe(503);
    expect(await unavailable?.json()).toEqual({
      error: {
        code: "unavailable",
        message: "요청 한도를 확인할 수 없어요. 학생 상태는 저장하지 않았어요",
        docs: "https://mollulog.net/developers/docs#error-unavailable",
      },
    });
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();

    mockApi.reserveApiWriteQuota.mockResolvedValueOnce({
      allowed: false,
      used: 500,
      resetsAt: new Date(),
      retryAfterSeconds: 17,
    });
    const limited = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", { token: "bearer", body: payload }),
      createEnv(),
    );
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBe("17");
    expect(limited?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await limited?.json()).toMatchObject({
      error: { code: "rate_limited", docs: "https://mollulog.net/developers/docs#error-rate_limited" },
    });
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();
    expect(mockApi.reserveApiWriteQuota).toHaveBeenCalledTimes(2);
  });

  it("counts validation failures, no-ops, and persistence errors without exposing internal errors", async () => {
    const invalid = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", { token: "bearer", body: "[]" }),
      createEnv(),
    );
    expect(invalid?.status).toBe(400);
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();

    mockApi.patchApiRecruitedStudent
      .mockResolvedValueOnce({ kind: "updated", state: { tier: 5, weaponTier: 0, level: 80 }, changed: false })
      .mockRejectedValueOnce(new Error("secret database password and stack"));
    const noOp = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "PATCH", { token: "bearer", body: JSON.stringify({ level: 80 }) }),
      createEnv(),
    );
    expect(noOp?.status).toBe(200);

    const failedWrite = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "PATCH", { token: "bearer", body: JSON.stringify({ level: 81 }) }),
      createEnv(),
    );
    expect(failedWrite?.status).toBe(500);
    expect(failedWrite?.headers.get("Content-Type")).toContain("application/json");
    expect(failedWrite?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await failedWrite?.json()).toEqual({
      error: {
        code: "internal_error",
        message: "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요",
        docs: "https://mollulog.net/developers/docs#error-internal_error",
      },
    });
    expect(mockApi.reserveApiWriteQuota).toHaveBeenCalledTimes(3);
  });

  it("rejects oversized declared and streamed bodies after reserving quota", async () => {
    const declaredSizeRequest = request("/v1/me/students", "POST", {
      token: "bearer",
      body: "{}",
    });
    declaredSizeRequest.headers.set("Content-Length", String(1024 * 1024 + 1));
    const declaredSize = await handleMolluLogApiRequest(declaredSizeRequest, createEnv());
    expect(declaredSize?.status).toBe(400);
    expect(await declaredSize?.json()).toMatchObject({
      error: { code: "invalid_request", docs: "https://mollulog.net/developers/docs#error-invalid_request" },
    });

    const headers = new Headers({
      Authorization: "Bearer bearer",
      "Content-Type": "application/json",
    });
    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        controller.close();
      },
    });
    const streamedRequest = new Request("https://api.mollulog.net/v1/me/students", {
      method: "POST",
      headers,
      body: oversizedStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const streamedSize = await handleMolluLogApiRequest(streamedRequest, createEnv());
    expect(streamedSize?.status).toBe(400);
    expect(await streamedSize?.json()).toMatchObject({
      error: { code: "invalid_request", docs: "https://mollulog.net/developers/docs#error-invalid_request" },
    });
    expect(mockApi.reserveApiWriteQuota).toHaveBeenCalledTimes(2);
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();
  });

  it("returns JSON method errors with private response headers", async () => {
    const response = await handleMolluLogApiRequest(
      request("/v1/me/students", "PUT", { token: "bearer" }),
      createEnv(),
    );

    expect(response?.status).toBe(400);
    expect(response?.headers.get("Content-Type")).toContain("application/json");
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response?.headers.get("Vary")).toBe("Authorization");
    expect(await response?.json()).toMatchObject({
      error: { code: "invalid_request", docs: "https://mollulog.net/developers/docs#error-invalid_request" },
    });
  });

  it("maps unsupported content types to invalid_request", async () => {
    const response = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", {
        token: "bearer",
        body: "{}",
        contentType: "text/plain",
      }),
      createEnv(),
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({
      error: { code: "invalid_request", docs: "https://mollulog.net/developers/docs#error-invalid_request" },
    });
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();
  });

  it("normalizes a submitted variant UID to its own primary student UID", async () => {
    mockStudents.getAllStudents.mockResolvedValue([student, { ...student, uid: "10001", name: "Aru Mode" }]);
    mockApi.registerApiRecruitedStudent.mockResolvedValue({ kind: "created", state: { tier: 5, weaponTier: 0 } });

    const response = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", {
        token: "bearer",
        body: JSON.stringify({ studentUid: "10001", tier: 5, weaponTier: 0 }),
      }),
      createEnv(),
    );

    expect(response?.status).toBe(201);
    expect(mockApi.registerApiRecruitedStudent).toHaveBeenCalledWith(
      expect.anything(),
      5,
      "10000",
      { tier: 5, weaponTier: 0 },
      { apiKeyUid: "key-uid", apiKeyName: "test" },
      { ctx: undefined },
    );
    expect(await response?.json()).toEqual({ studentUid: "10000", tier: 5, weaponTier: 0 });
  });

  it("finds the representative by another form-change UID that the catalog omits", async () => {
    mockStudents.getStudentOtherFormUids.mockResolvedValue({ "10000": ["10001"] });
    const response = await handleMolluLogApiRequest(
      request("/v1/students?query=10001", "GET", { token: "bearer" }),
      createEnv(),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ students: [{ studentUid: "10000", name: "Aru" }], nextCursor: null });
  });

  it("reports the catalog as unavailable when form-change UIDs cannot be loaded", async () => {
    mockStudents.getStudentOtherFormUids.mockRejectedValueOnce(new Error("BAQL timeout"));
    const response = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bearer" }),
      createEnv(),
    );

    expect(response?.status).toBe(503);
  });

  it("deduplicates form-change records on one catalog page while retaining a separate costume", async () => {
    const mode = { ...student, uid: "10001", name: "Aru Mode" };
    const costume = { ...student, uid: "10002", name: "Aru Costume" };
    mockStudents.getAllStudents.mockResolvedValue([student, mode, costume]);
    const response = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru&limit=10", "GET", { token: "bearer" }),
      createEnv(),
    );

    expect(response?.status).toBe(200);
    expect(mockStudents.getStudentPrimaryUids).toHaveBeenCalledTimes(1);
    expect(mockStudents.getStudentPrimaryUids).toHaveBeenCalledWith(expect.anything(), ["10000", "10001", "10002"]);
    expect(await response?.json()).toEqual({
      students: [
        { studentUid: "10000", name: "Aru" },
        { studentUid: "10002", name: "Aru Costume" },
      ],
      nextCursor: null,
    });
  });

  it("resolves a form-change UID that the catalog omits to its representative on every student route", async () => {
    // The catalog holds only the representative; BAQL maps the mode UID 10001 to 10000.
    mockApi.getApiRecruitedStudent.mockResolvedValueOnce({ state: { tier: 5, weaponTier: 0, level: 80 } });
    const read = await handleMolluLogApiRequest(
      request("/v1/me/students/10001", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(read?.status).toBe(200);
    expect(await read?.json()).toEqual({ studentUid: "10000", tier: 5, weaponTier: 0, level: 80 });
    expect(mockApi.getApiRecruitedStudent).toHaveBeenCalledWith(expect.anything(), 5, "10000", { ctx: undefined });

    mockApi.patchApiRecruitedStudent.mockResolvedValueOnce({
      kind: "updated",
      state: { tier: 5, weaponTier: 0, level: 81 },
      changed: true,
    });
    const patched = await handleMolluLogApiRequest(
      request("/v1/me/students/10001", "PATCH", { token: "bearer", body: JSON.stringify({ level: 81 }) }),
      createEnv(),
    );
    expect(patched?.status).toBe(200);
    expect(await patched?.json()).toEqual({ studentUid: "10000", tier: 5, weaponTier: 0, level: 81 });

    mockApi.deleteApiRecruitedStudent.mockResolvedValueOnce({ kind: "deleted" });
    const deleted = await handleMolluLogApiRequest(
      request("/v1/me/students/10001", "DELETE", { token: "bearer" }),
      createEnv(),
    );
    expect(deleted?.status).toBe(200);
    expect(await deleted?.json()).toEqual({ studentUid: "10000", deleted: true });

    mockApi.registerApiRecruitedStudent.mockResolvedValueOnce({ kind: "created", state: { tier: 5, weaponTier: 0 } });
    const registered = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", {
        token: "bearer",
        body: JSON.stringify({ studentUid: "10001", tier: 5, weaponTier: 0 }),
      }),
      createEnv(),
    );
    expect(registered?.status).toBe(201);
    expect(await registered?.json()).toEqual({ studentUid: "10000", tier: 5, weaponTier: 0 });
  });

  it("returns 404 for a UID that BAQL does not know, before any recruitment read or write", async () => {
    const read = await handleMolluLogApiRequest(
      request("/v1/me/students/99999", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(read?.status).toBe(404);
    expect(await read?.json()).toMatchObject({
      error: { code: "not_found", docs: "https://mollulog.net/developers/docs#error-not_found" },
    });

    const registered = await handleMolluLogApiRequest(
      request("/v1/me/students", "POST", {
        token: "bearer",
        body: JSON.stringify({ studentUid: "99999", tier: 5, weaponTier: 0 }),
      }),
      createEnv(),
    );
    expect(registered?.status).toBe(404);
    expect(await registered?.json()).toMatchObject({
      error: { code: "not_found", docs: "https://mollulog.net/developers/docs#error-not_found" },
    });

    expect(mockApi.getApiRecruitedStudent).not.toHaveBeenCalled();
    expect(mockApi.registerApiRecruitedStudent).not.toHaveBeenCalled();
  });

  it("maps a BAQL lookup failure or an unresolved candidate to 503 unavailable, never 404", async () => {
    mockStudents.getStudentPrimaryUids.mockRejectedValueOnce(new Error("BAQL transport detail"));
    const failed = await handleMolluLogApiRequest(
      request("/v1/me/students/10001", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(failed?.status).toBe(503);
    expect(await failed?.json()).toEqual({
      error: {
        code: "unavailable",
        message: "학생 정보를 확인할 수 없어요. 잠시 후 다시 시도해주세요",
        docs: "https://mollulog.net/developers/docs#error-unavailable",
      },
    });

    mockStudents.getStudentPrimaryUids.mockRejectedValueOnce(new Error("BAQL GraphQL errors"));
    const searchFailed = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(searchFailed?.status).toBe(503);
    expect(await searchFailed?.json()).toMatchObject({ error: { code: "unavailable" } });

    mockStudents.getAllStudents.mockResolvedValueOnce([student, { ...student, uid: "10002", name: "Aru Costume" }]);
    mockStudents.getStudentPrimaryUids.mockResolvedValueOnce(new Map([["10000", "10000"]]));
    const missingCandidate = await handleMolluLogApiRequest(
      request("/v1/students?query=Aru", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(missingCandidate?.status).toBe(503);
    expect(await missingCandidate?.json()).toMatchObject({ error: { code: "unavailable" } });
  });

  it("logs 5xx causes with method, path and code, never the bearer token or the Authorization header", async () => {
    const token = `mllg_${"a".repeat(64)}`;
    mockApi.authenticatePersonalApiKey.mockRejectedValueOnce(new Error("hyperdrive connection reset"));
    const unavailable = await handleMolluLogApiRequest(request("/v1/me/students", "GET", { token }), createEnv());
    expect(unavailable?.status).toBe(503);
    expect(await unavailable?.json()).toEqual({
      error: {
        code: "unavailable",
        message: "인증을 확인할 수 없어요. 잠시 후 다시 시도해주세요",
        docs: "https://mollulog.net/developers/docs#error-unavailable",
      },
    });
    expect(mockObservability.captureServerError).toHaveBeenLastCalledWith(expect.any(Error), {
      handler: "mollulog_api",
      method: "GET",
      path: "/v1/me/students",
      code: "authentication_unavailable",
    });

    mockApi.patchApiRecruitedStudent.mockRejectedValueOnce(new Error("insert failed"));
    const internal = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "PATCH", { token, body: JSON.stringify({ level: 81 }) }),
      createEnv(),
    );
    expect(internal?.status).toBe(500);
    expect(mockObservability.captureServerError).toHaveBeenLastCalledWith(expect.any(Error), {
      handler: "mollulog_api",
      method: "PATCH",
      path: "/v1/me/students/10000",
      code: "internal_error",
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      "MolluLog API request failed",
      expect.any(Error),
      expect.objectContaining({ method: "PATCH", path: "/v1/me/students/10000", code: "internal_error" }),
    );

    const captured = mockObservability.captureServerError.mock.calls.length;
    const notFound = await handleMolluLogApiRequest(
      request("/v1/me/students/99999", "GET", { token: "bearer" }),
      createEnv(),
    );
    expect(notFound?.status).toBe(404);
    expect(mockObservability.captureServerError.mock.calls.length).toBe(captured);

    const logged = JSON.stringify([mockObservability.captureServerError.mock.calls, mockLogger.error.mock.calls]);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("Bearer");
    expect(logged).not.toContain("Authorization");
  });

  it("returns the current state to a key with read and write scope", async () => {
    mockApi.authenticatePersonalApiKey.mockResolvedValue({
      kind: "authenticated",
      key: {
        kind: "personal",
        uid: "key-uid",
        name: "read and write",
        userId: 5,
        scopes: ["students:read", "students:write"],
      },
    });
    mockApi.patchApiRecruitedStudent.mockResolvedValue({
      kind: "updated",
      state: { tier: 5, weaponTier: 0, level: 81 },
      changed: true,
    });

    const response = await handleMolluLogApiRequest(
      request("/v1/me/students/10000", "PATCH", { token: "bearer", body: JSON.stringify({ level: 81 }) }),
      createEnv(),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ studentUid: "10000", tier: 5, weaponTier: 0, level: 81 });
  });
});
