import { describe, expect, it } from "@jest/globals";
import {
  createApiDocsResponse,
  createApiErrorBody,
  createApiErrorDocsUrl,
  createOpenApiDocument,
  renderLlmsFull,
  renderLlmsIndex,
} from "~/api/mollulog-api-docs.server";
import {
  type ApiStudentState,
  type ApiStudentStateValues,
  getInternalTier,
  mergeAndValidateApiStudentState,
  toApiStudentState,
} from "~/domain/mollulog-api";
import { API_GUIDE_FULL } from "~/domain/mollulog-api-guide";
import {
  API_DOC_NAME,
  API_DOC_VERSION,
  API_PUBLIC_ERROR_CODES,
  API_PUBLIC_ERRORS,
  API_ROUTES,
  API_STUDENT_STATE_FIELD_SPECS,
  formatApiCurlCommand,
  resolveApiDocumentUrls,
  routePathToOpenApiPath,
} from "~/domain/mollulog-api-spec";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";

const API_CANONICAL_HOST = "api.mollulog.net";
const host = "https://mollulog.net";
const requestUrl = "https://mollulog.net/developers/docs";

function findStateExamples(value: unknown): ApiStudentState[] {
  if (Array.isArray(value)) return value.flatMap(findStateExamples);
  if (typeof value !== "object" || value === null) return [];

  const record = value as Record<string, unknown>;
  const fields = Object.keys(API_STUDENT_STATE_FIELD_SPECS);
  if (fields.every((field) => Object.hasOwn(record, field))) {
    return [Object.fromEntries(fields.map((field) => [field, record[field]])) as ApiStudentState];
  }
  return Object.values(record).flatMap(findStateExamples);
}

function toExistingStudentState(state: ApiStudentState): ApiStudentStateValues {
  const { tier, weaponTier, ...fields } = state;
  return { ...fields, tier: getInternalTier(tier, weaponTier) };
}

describe("MolluLog API machine-readable documentation", () => {
  it("generates OpenAPI paths and methods from the route spec", () => {
    const document = createOpenApiDocument("https://api.mollulog.net/v1", host);
    const actual = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    const expected = API_ROUTES.map((route) => `${route.method} ${routePathToOpenApiPath(route.path)}`);

    expect(document.openapi).toBe("3.1.0");
    expect(document.info).toMatchObject({ title: API_DOC_NAME, version: API_DOC_VERSION });
    expect(document.servers).toEqual([{ url: "https://api.mollulog.net/v1" }]);
    expect(actual.sort()).toEqual(expected.sort());
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(document.paths["/me"].get).toMatchObject({
      tags: ["Profile"],
      "x-required-scopes": ["profile"],
    });
    expect(document.paths["/me/students"].get).toMatchObject({ "x-required-scopes": ["students:read"] });
    expect(document.paths["/me/students"].post).toMatchObject({ "x-required-scopes": ["students:write"] });
  });

  it("generates student field schemas from the field spec, including nullability and required registration fields", () => {
    const document = createOpenApiDocument("https://api.mollulog.net/v1", host);
    const registration = document.components.schemas.StudentRegistration;
    const recruitedStudent = document.components.schemas.RecruitedStudentState;
    const registrationProperties = registration.properties as Record<
      string,
      { minimum?: number; maximum?: number; type?: string | string[] }
    >;
    const recruitedStudentProperties = recruitedStudent.properties as Record<
      string,
      { minimum?: number; maximum?: number; type?: string | string[]; description?: string }
    >;

    expect(Object.keys(recruitedStudent.properties).filter((name) => name !== "studentUid")).toEqual(
      Object.keys(API_STUDENT_STATE_FIELD_SPECS),
    );
    for (const [name, field] of Object.entries(API_STUDENT_STATE_FIELD_SPECS)) {
      expect(recruitedStudentProperties[name]).toMatchObject({
        minimum: field.min,
        maximum: field.max,
        type: field.nullable ? ["integer", "null"] : "integer",
      });
      expect(registrationProperties[name]).toMatchObject({
        minimum: field.min,
        maximum: field.max,
        type: field.nullable ? ["integer", "null"] : "integer",
      });
    }
    expect(registration.required).toEqual([
      "studentUid",
      ...Object.entries(API_STUDENT_STATE_FIELD_SPECS)
        .filter(([, field]) => field.requiredForRegistration)
        .map(([name]) => name),
    ]);
    expect(recruitedStudentProperties.abilityHp.description).toBe("능력 해방 (HP)");
    expect(recruitedStudentProperties.abilityAtk.description).toBe("능력 해방 (공격력)");
    expect(recruitedStudentProperties.abilityHeal.description).toBe("능력 해방 (치유력)");
  });

  it("keeps the student search request and response examples consistent", () => {
    const findStudents = API_ROUTES.find((route) => route.id === "findStudents");

    expect(findStudents?.parameters[0].example).toBe("아루");
    expect(findStudents?.requestExample.path).toBe("/students?query=아루");
    expect(findStudents?.responseExample.body).toMatchObject({
      students: [{ studentUid: "10000", name: "아루" }],
    });
  });

  it("keeps every response state example valid without validator changes", () => {
    const stateExamples = API_ROUTES.flatMap((route) => findStateExamples(route.responseExample.body));

    expect(stateExamples.length).toBeGreaterThan(0);
    for (const example of stateExamples) {
      const validated = mergeAndValidateApiStudentState(toExistingStudentState(example), {});
      expect(toApiStudentState(validated)).toEqual(example);
    }
  });

  it("publishes only the approved public error codes and status groups", () => {
    const document = createOpenApiDocument("https://api.mollulog.net/v1", host);
    const errorSchema = document.components.schemas.ApiError;
    const statusCodes = new Set(Object.values(API_PUBLIC_ERRORS).map((error) => error.status));

    expect(API_PUBLIC_ERROR_CODES).toEqual([
      "invalid_request",
      "unauthorized",
      "forbidden",
      "not_found",
      "student_not_recruited",
      "student_already_recruited",
      "rate_limited",
      "internal_error",
      "unavailable",
    ]);
    expect(errorSchema.properties.code.enum).toEqual(API_PUBLIC_ERROR_CODES);
    expect(statusCodes).toEqual(new Set([400, 401, 403, 404, 409, 429, 500, 503]));
    expect(errorSchema.required).toContain("docs");
  });

  it("adds a HOST-based docs URL for every public error code", () => {
    for (const code of API_PUBLIC_ERROR_CODES) {
      expect(createApiErrorDocsUrl(host, code)).toBe(`${host}/developers/docs#error-${code}`);
      expect(createApiErrorBody(host, code, API_PUBLIC_ERRORS[code].title).error.docs).toBe(
        `${host}/developers/docs#error-${code}`,
      );
    }
  });

  it("renders the llms index with its full guide, OpenAPI, and human page links", () => {
    const urls = resolveApiDocumentUrls(API_CANONICAL_HOST, requestUrl);
    const index = renderLlmsIndex(urls, host);

    expect(index).toContain(`# ${API_DOC_NAME}`);
    expect(index).toContain(`> ${API_GUIDE_FULL.overview}`);
    expect(index).toContain(`[전체 안내](${urls.llmsFullUrl})`);
    expect(index).toContain(`[OpenAPI](${urls.openApiUrl})`);
    expect(index).toContain(`[API 문서](${host}/developers/docs)`);
  });

  it("renders the complete Korean guide from the route, field, error, and guide sources", () => {
    const urls = resolveApiDocumentUrls(API_CANONICAL_HOST, requestUrl);
    const text = renderLlmsFull(urls, host);

    expect(text).toContain("## 인증과 키 취급");
    expect(text).toContain("## OAuth 로그인");
    expect(text).toContain("client_id=mllg_oc_<CLIENT_ID>");
    expect(text).toContain("필요 scope: `profile`");
    expect(text).toContain("MOLLULOG_API_KEY");
    expect(text).toContain("코드, 커밋, 로그에 남기지 마세요");
    expect(text).toContain("## 핵심 실행 흐름");
    expect(text).toContain("## 모델과 엔드포인트");
    expect(text).toContain("### 모집 학생 상태");
    expect(text).toContain("#### 학생 상태 필드");
    expect(text).toContain("##### 필드 간 제약");
    expect(text).toContain("쓰기 본문은 학생 한 명의 객체여야 해요. 배열은 보낼 수 없어요.");
    expect(text).toContain("모집 등록, 현재 성장도, 인연·경험치를 지워요");
    expect(text).toContain("## 오류 code별 대응");
    expect(text).toContain("## 한도와 재시도");
    expect(text).toContain("## 동기화 예제");
    expect(text).toContain("process.env.MOLLULOG_API_KEY");
    expect(text).toContain("목록의 limit은 기본 50명이고, 한 번에 최대 100명이에요.");
    expect(text).toContain(
      "등록할 때 보내지 않은 상태 필드는 null로 저장돼요. 다만 이미 기록된 인연 랭크와 누적 경험치가 있으면 그대로 유지돼요. PATCH에서 보내지 않은 필드는 그대로 유지돼요.",
    );
    expect(text).not.toContain(
      "등록 시 보내지 않은 상태 필드는 null로 저장돼요. PATCH에서 보내지 않은 필드는 그대로 유지돼요.",
    );
    expect(text).toContain('"fields": [{ "field": "level", "message": "1부터 90 사이여야 해요." }],');
    expect(text).toContain("능력 해방 (HP · 공격력 · 치유력)");
    const noWeaponTier = API_STUDENT_STATE_FIELD_SPECS.weaponTier.min;
    const weaponTierMax = API_STUDENT_STATE_FIELD_SPECS.weaponTier.max;
    const studentTierMax = API_STUDENT_STATE_FIELD_SPECS.tier.max;
    const noWeaponLevelMax = getWeaponLevelMaxByTier(studentTierMax + noWeaponTier);
    const noWeaponLevelRange = noWeaponLevelMax === 0 ? "0 또는 null" : `0부터 ${noWeaponLevelMax}까지 또는 null`;
    expect(text).toContain(`고유무기 성급 ${noWeaponTier}이면 \`weaponLevel\`은 ${noWeaponLevelRange}이어야 해요.`);
    const weaponLevelMaxima = Array.from({ length: weaponTierMax - noWeaponTier }, (_, index) =>
      getWeaponLevelMaxByTier(studentTierMax + noWeaponTier + index + 1),
    );
    expect(text).toContain(
      `고유무기 성급 ${noWeaponTier + 1}부터 ${weaponTierMax}까지 각각 ${weaponLevelMaxima.join("·")}까지 입력할 수 있어요.`,
    );
    for (const code of API_PUBLIC_ERROR_CODES) expect(text).toContain(`\`${code}\``);
    for (const field of Object.keys(API_STUDENT_STATE_FIELD_SPECS)) expect(text).toContain(`\`${field}\``);
    for (const route of API_ROUTES) {
      expect(text).toContain(`${route.method} ${route.displayPath}`);
      expect(text).toContain(route.path.replace(/:studentUid/g, "10000"));
    }
  });

  it("formats every curl request as a continued multi-line command", () => {
    const baseUrl = "https://api.mollulog.net/v1";
    for (const route of API_ROUTES) {
      const lines = formatApiCurlCommand(baseUrl, route).split("\n");
      expect(lines[0]).toBe(`curl --request ${route.method} \\`);
      expect(lines.slice(1).every((line) => line.startsWith("  --"))).toBe(true);
      expect(lines.slice(0, -1).every((line) => line.endsWith(" \\"))).toBe(true);
      expect(lines.at(-1)).not.toMatch(/\\$/);
      expect(lines.join("\n")).toContain("'Authorization: Bearer <API 키 또는 액세스 토큰>'");
    }
  });

  it("serves discovery and document responses publicly with cache and content-type headers", async () => {
    const env = { HOST: host, API_HOST: API_CANONICAL_HOST } as Env;
    const expected = [
      ["/", "application/json"],
      ["/llms.txt", "text/markdown"],
      ["/llms-full.txt", "text/markdown"],
      ["/v1/openapi.json", "application/json"],
    ] as const;

    for (const [pathname, contentType] of expected) {
      const response = createApiDocsResponse(pathname, requestUrl, env);
      expect(response?.status).toBe(200);
      expect(response?.headers.get("Cache-Control")).toBe("public, max-age=300");
      expect(response?.headers.get("Vary")).toBeNull();
      expect(response?.headers.get("Content-Type")).toBe(`${contentType}; charset=utf-8`);
    }

    const discovery = await createApiDocsResponse("/", requestUrl, env)?.json();
    expect(discovery).toEqual({
      name: API_DOC_NAME,
      version: API_DOC_VERSION,
      documents: {
        llms: "https://api.mollulog.net/llms.txt",
        llmsFull: "https://api.mollulog.net/llms-full.txt",
        openApi: "https://api.mollulog.net/v1/openapi.json",
        human: `${host}/developers/docs`,
      },
    });
  });

  it("uses request origin without API_HOST and leaves the site root to the web app", () => {
    expect(resolveApiDocumentUrls(undefined, "http://127.0.0.1:8793/developers/docs")).toMatchObject({
      baseUrl: "http://127.0.0.1:8793/v1",
      llmsUrl: "http://127.0.0.1:8793/llms.txt",
    });
    expect(createApiDocsResponse("/", requestUrl, { HOST: host } as Env)).toBeNull();
  });
});
