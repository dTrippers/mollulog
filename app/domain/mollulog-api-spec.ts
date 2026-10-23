import { getAccumulatedRelationshipExpForLevel } from "~/domain/relationship-level";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  EQUIPMENT_LEVEL_MAX_LEVEL,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";

export const API_DOC_NAME = "MolluLog API";
export const API_DOC_VERSION = "1";
export const API_DOC_PATHS = {
  discovery: "/",
  llms: "/llms.txt",
  llmsFull: "/llms-full.txt",
  openApi: "/v1/openapi.json",
} as const;

export const API_STUDENT_PAGE_SIZE = 50;
export const API_STUDENT_PAGE_SIZE_MIN = 1;
export const API_STUDENT_PAGE_SIZE_MAX = 100;
export const API_STUDENT_QUERY_MIN_LENGTH = 1;
export const API_STUDENT_QUERY_MAX_LENGTH = 200;
export const API_MAX_REQUEST_BYTES = 1024 * 1024;
export const API_MAX_REQUEST_SIZE_TEXT = `${API_MAX_REQUEST_BYTES / (1024 * 1024)}MiB`;
export const API_MAX_BOND_EXP = getAccumulatedRelationshipExpForLevel(100);
export const API_READ_LIMIT_PER_MINUTE = 60;
export const API_READ_WINDOW_SECONDS = 60;
export const API_READ_WINDOW_MS = API_READ_WINDOW_SECONDS * 1000;
export const API_WRITE_LIMIT = 500;
export const API_WRITE_WINDOW_MINUTES = 10;
export const API_WRITE_WINDOW_MS = API_WRITE_WINDOW_MINUTES * 60 * 1000;
export const API_KEY_LIFETIME_MONTHS = 12;
export const OAUTH_ACCESS_TOKEN_LIFETIME_MONTHS = 12;
export const OAUTH_AUTHORIZATION_CODE_LIFETIME_SECONDS = 5 * 60;

export const API_SCOPE_REGISTRY = {
  profile: {
    resource: "profile",
    operation: "read",
    developerLabel: "프로필",
    userLabel: "프로필 보기",
    description: "닉네임 · 프로필 학생",
  },
  "students:read": {
    resource: "students",
    operation: "read",
    developerLabel: "학생 읽기",
    userLabel: "모집 학생 보기",
    description: "모집 여부, 성장도, 인연 랭크",
  },
  "students:write": {
    resource: "students",
    operation: "write",
    developerLabel: "학생 쓰기",
    userLabel: "모집 학생 보기·변경",
    description: "모집 등록·해제, 성장도, 인연 랭크",
  },
} as const;

export type ApiScope = keyof typeof API_SCOPE_REGISTRY;
export const API_SCOPES = Object.keys(API_SCOPE_REGISTRY) as ApiScope[];

export function normalizeApiScopes(scopes: readonly ApiScope[]): ApiScope[] {
  const normalized = new Set<ApiScope>(scopes);
  if (normalized.has("students:write")) normalized.add("students:read");
  return API_SCOPES.filter((scope) => normalized.has(scope));
}

export function apiScopesInclude(scopes: readonly ApiScope[], requiredScopes: readonly ApiScope[]): boolean {
  const granted = new Set(normalizeApiScopes(scopes));
  return requiredScopes.every((scope) => granted.has(scope));
}

export function getDeveloperScopeLabels(scopes: readonly ApiScope[]): string[] {
  const normalized = normalizeApiScopes(scopes);
  const labels: string[] = [];
  if (normalized.includes("profile")) labels.push(API_SCOPE_REGISTRY.profile.developerLabel);
  if (normalized.includes("students:read")) {
    labels.push(
      normalized.includes("students:write")
        ? "학생 읽기/쓰기"
        : API_SCOPE_REGISTRY["students:read"].developerLabel,
    );
  }
  return labels;
}

export function getDeveloperScopeSummary(scopes: readonly ApiScope[]): string {
  return getDeveloperScopeLabels(scopes).join(" · ");
}

export function getUserScopeSummary(scopes: readonly ApiScope[]): string {
  const normalized = normalizeApiScopes(scopes);
  const labels: string[] = [];
  if (normalized.includes("profile")) labels.push(API_SCOPE_REGISTRY.profile.userLabel);
  if (normalized.includes("students:write")) labels.push(API_SCOPE_REGISTRY["students:write"].userLabel);
  else if (normalized.includes("students:read")) labels.push(API_SCOPE_REGISTRY["students:read"].userLabel);
  return labels.join(" · ");
}

export const API_STUDENT_STATE_FIELD_SPECS = {
  tier: { meaning: "학생 성급", min: 1, max: 5, nullable: false, requiredForRegistration: true },
  weaponTier: { meaning: "고유무기 성급", min: 0, max: 4, nullable: false, requiredForRegistration: true },
  level: { meaning: "학생 Lv", min: 1, max: 90, nullable: true, requiredForRegistration: false },
  skillEx: { meaning: "EX 스킬", min: 1, max: 5, nullable: true, requiredForRegistration: false },
  skillNormal: { meaning: "기본 스킬", min: 1, max: 10, nullable: true, requiredForRegistration: false },
  skillEnhanced: { meaning: "강화 스킬", min: 1, max: 10, nullable: true, requiredForRegistration: false },
  skillSub: { meaning: "서브 스킬", min: 1, max: 10, nullable: true, requiredForRegistration: false },
  equip1: { meaning: "장비 1 티어", min: 1, max: 10, nullable: true, requiredForRegistration: false },
  equip2: { meaning: "장비 2 티어", min: 1, max: 10, nullable: true, requiredForRegistration: false },
  equip3: { meaning: "장비 3 티어", min: 1, max: 10, nullable: true, requiredForRegistration: false },
  equip1Level: {
    meaning: "장비 1 레벨",
    min: 1,
    max: EQUIPMENT_LEVEL_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  equip2Level: {
    meaning: "장비 2 레벨",
    min: 1,
    max: EQUIPMENT_LEVEL_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  equip3Level: {
    meaning: "장비 3 레벨",
    min: 1,
    max: EQUIPMENT_LEVEL_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  equipSpecial: { meaning: "애용품", min: 1, max: 2, nullable: true, requiredForRegistration: false },
  weaponLevel: {
    meaning: "고유무기 Lv",
    min: 0,
    max: WEAPON_LEVEL_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  abilityHp: {
    meaning: "능력 해방 (HP)",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  abilityAtk: {
    meaning: "능력 해방 (공격력)",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  abilityHeal: {
    meaning: "능력 해방 (치유력)",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
    nullable: true,
    requiredForRegistration: false,
  },
  bond: { meaning: "인연 랭크", min: 1, max: 100, nullable: true, requiredForRegistration: false },
  bondExp: {
    meaning: "인연 누적 경험치",
    min: 0,
    max: API_MAX_BOND_EXP,
    nullable: true,
    requiredForRegistration: false,
  },
} as const;

export type ApiStudentStateField = keyof typeof API_STUDENT_STATE_FIELD_SPECS;
export type ApiPublicErrorCode = keyof typeof API_PUBLIC_ERRORS;

export const API_PUBLIC_ERRORS = {
  invalid_request: {
    status: 400,
    title: "잘못된 요청",
    description: "요청 내용을 확인해주세요 · 문제가 된 필드는 fields에 담겨요",
  },
  unauthorized: {
    status: 401,
    title: "인증 실패",
    description: "API 키나 액세스 토큰이 없거나, 올바르지 않거나, 만료·삭제됐어요",
  },
  forbidden: {
    status: 403,
    title: "권한 없음",
    description: "토큰에 필요한 권한이 없거나 계정이 활성 상태가 아니에요",
  },
  not_found: {
    status: 404,
    title: "찾을 수 없음",
    description: "API 경로나 학생 UID를 확인해주세요",
  },
  student_not_recruited: {
    status: 404,
    title: "등록하지 않은 학생",
    description: "먼저 POST로 등록해주세요",
  },
  student_already_recruited: {
    status: 409,
    title: "이미 등록한 학생",
    description: "값을 바꾸려면 PATCH로 보내주세요",
  },
  rate_limited: {
    status: 429,
    title: "요청 한도 초과",
    description: "Retry-After만큼 기다린 뒤 다시 보내주세요",
  },
  internal_error: {
    status: 500,
    title: "서버 오류",
    description: "요청이 처리됐는지 알 수 없어요 · GET으로 확인한 뒤 필요하면 다시 보내주세요",
  },
  unavailable: {
    status: 503,
    title: "잠시 사용할 수 없음",
    description: "요청을 처리하지 않았어요 · 잠시 후 다시 보내주세요",
  },
} as const satisfies Record<string, { status: number; title: string; description: string }>;

export const API_PUBLIC_ERROR_CODES = Object.keys(API_PUBLIC_ERRORS) as ApiPublicErrorCode[];

export type ApiRouteMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type ApiRouteParameter = {
  name: string;
  location: "query" | "path";
  required: boolean;
  description: string;
  type: "string" | "integer";
  min?: number;
  max?: number;
  default?: number;
  example: string | number;
};

export type ApiRouteSpec = {
  id: string;
  method: ApiRouteMethod;
  path: string;
  displayPath: string;
  requiredScopes: readonly ApiScope[];
  summary: string;
  parameters: readonly ApiRouteParameter[];
  requestExample: {
    path: string;
    headers: readonly { name: string; value: string }[];
    body?: unknown;
  };
  responseExample: { status: number; body: unknown };
  errors: readonly ApiPublicErrorCode[];
  requestSchema?: "StudentRegistration" | "StudentPatch";
  responseSchema:
    | "MeResponse"
    | "StudentSearchResponse"
    | "RecruitedStudentListResponse"
    | "RecruitedStudentResponse"
    | "StudentWriteResponse"
    | "StudentDeleteResponse";
};

const readErrors = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "internal_error",
  "unavailable",
] as const;
const writeErrors = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "internal_error",
  "unavailable",
] as const;
const stateExample = {
  tier: 5,
  weaponTier: 0,
  level: 90,
  skillEx: 5,
  skillNormal: 10,
  skillEnhanced: 10,
  skillSub: 10,
  equip1: 10,
  equip2: 10,
  equip3: 10,
  equip1Level: 70,
  equip2Level: 70,
  equip3Level: 70,
  equipSpecial: 2,
  weaponLevel: 0,
  abilityHp: 0,
  abilityAtk: 0,
  abilityHeal: 0,
  bond: 20,
  bondExp: getAccumulatedRelationshipExpForLevel(20),
};

export const API_ROUTES = [
  {
    id: "getMe",
    method: "GET",
    path: "/me",
    displayPath: "/me",
    requiredScopes: ["profile"],
    summary: "내 프로필",
    parameters: [],
    requestExample: {
      path: "/me",
      headers: [{ name: "Accept", value: "application/json" }],
    },
    responseExample: {
      status: 200,
      body: { id: "<SUBJECT>", username: "sensei", profileStudent: { studentUid: "10000", name: "아루" } },
    },
    errors: [...readErrors],
    responseSchema: "MeResponse",
  },
  {
    id: "findStudents",
    method: "GET",
    path: "/students",
    displayPath: "/students?query=",
    requiredScopes: ["students:read"],
    summary: "학생 찾기",
    parameters: [
      {
        name: "query",
        location: "query",
        required: true,
        description: `학생 UID 또는 이름 검색어 (${API_STUDENT_QUERY_MIN_LENGTH}–${API_STUDENT_QUERY_MAX_LENGTH}자)`,
        type: "string",
        min: API_STUDENT_QUERY_MIN_LENGTH,
        max: API_STUDENT_QUERY_MAX_LENGTH,
        example: "아루",
      },
      {
        name: "limit",
        location: "query",
        required: false,
        description: `기본 ${API_STUDENT_PAGE_SIZE} · 최대 ${API_STUDENT_PAGE_SIZE_MAX}`,
        type: "integer",
        min: API_STUDENT_PAGE_SIZE_MIN,
        max: API_STUDENT_PAGE_SIZE_MAX,
        default: API_STUDENT_PAGE_SIZE,
        example: API_STUDENT_PAGE_SIZE,
      },
      {
        name: "cursor",
        location: "query",
        required: false,
        description: "이전 응답에서 받은 nextCursor",
        type: "string",
        example: "<CURSOR>",
      },
    ],
    requestExample: {
      path: "/students?query=아루",
      headers: [{ name: "Accept", value: "application/json" }],
    },
    responseExample: {
      status: 200,
      body: { students: [{ studentUid: "10000", name: "아루" }], nextCursor: null },
    },
    errors: [...readErrors],
    responseSchema: "StudentSearchResponse",
  },
  {
    id: "listRecruitedStudents",
    method: "GET",
    path: "/me/students",
    displayPath: "/me/students",
    requiredScopes: ["students:read"],
    summary: "모집 학생 목록",
    parameters: [
      {
        name: "limit",
        location: "query",
        required: false,
        description: `기본 ${API_STUDENT_PAGE_SIZE} · 최대 ${API_STUDENT_PAGE_SIZE_MAX}`,
        type: "integer",
        min: API_STUDENT_PAGE_SIZE_MIN,
        max: API_STUDENT_PAGE_SIZE_MAX,
        default: API_STUDENT_PAGE_SIZE,
        example: API_STUDENT_PAGE_SIZE,
      },
      {
        name: "cursor",
        location: "query",
        required: false,
        description: "이전 응답에서 받은 nextCursor",
        type: "string",
        example: "<CURSOR>",
      },
    ],
    requestExample: {
      path: `/me/students?limit=${API_STUDENT_PAGE_SIZE}&cursor=<CURSOR>`,
      headers: [{ name: "Accept", value: "application/json" }],
    },
    responseExample: {
      status: 200,
      body: { students: [{ studentUid: "10000", ...stateExample }], nextCursor: null },
    },
    errors: [...readErrors],
    responseSchema: "RecruitedStudentListResponse",
  },
  {
    id: "getRecruitedStudent",
    method: "GET",
    path: "/me/students/:studentUid",
    displayPath: "/me/students/:studentUid",
    requiredScopes: ["students:read"],
    summary: "모집 학생 조회",
    parameters: [
      {
        name: "studentUid",
        location: "path",
        required: true,
        description: "학생 찾기로 얻은 UID",
        type: "string",
        example: "10000",
      },
    ],
    requestExample: {
      path: "/me/students/10000",
      headers: [{ name: "Accept", value: "application/json" }],
    },
    responseExample: { status: 200, body: { studentUid: "10000", ...stateExample } },
    errors: [...readErrors.slice(0, 3), "not_found", "student_not_recruited", ...readErrors.slice(3)],
    responseSchema: "RecruitedStudentResponse",
  },
  {
    id: "registerRecruitedStudent",
    method: "POST",
    path: "/me/students",
    displayPath: "/me/students",
    requiredScopes: ["students:write"],
    summary: "모집 학생 등록",
    parameters: [],
    requestExample: {
      path: "/me/students",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: { studentUid: "10000", tier: 5, weaponTier: 0, level: 90 },
    },
    responseExample: { status: 201, body: { studentUid: "10000" } },
    errors: [...writeErrors.slice(0, 3), "not_found", "student_already_recruited", ...writeErrors.slice(3)],
    requestSchema: "StudentRegistration",
    responseSchema: "StudentWriteResponse",
  },
  {
    id: "patchRecruitedStudent",
    method: "PATCH",
    path: "/me/students/:studentUid",
    displayPath: "/me/students/:studentUid",
    requiredScopes: ["students:write"],
    summary: "모집 학생 수정",
    parameters: [
      {
        name: "studentUid",
        location: "path",
        required: true,
        description: "학생 찾기로 얻은 UID",
        type: "string",
        example: "10000",
      },
    ],
    requestExample: {
      path: "/me/students/10000",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: { level: 90, bond: 20 },
    },
    responseExample: { status: 200, body: { studentUid: "10000" } },
    errors: [...writeErrors.slice(0, 3), "not_found", "student_not_recruited", ...writeErrors.slice(3)],
    requestSchema: "StudentPatch",
    responseSchema: "StudentWriteResponse",
  },
  {
    id: "deleteRecruitedStudent",
    method: "DELETE",
    path: "/me/students/:studentUid",
    displayPath: "/me/students/:studentUid",
    requiredScopes: ["students:write"],
    summary: "모집 학생 삭제",
    parameters: [
      {
        name: "studentUid",
        location: "path",
        required: true,
        description: "학생 찾기로 얻은 UID",
        type: "string",
        example: "10000",
      },
    ],
    requestExample: { path: "/me/students/10000", headers: [] },
    responseExample: { status: 200, body: { studentUid: "10000", deleted: true } },
    errors: [...writeErrors.slice(0, 3), "not_found", "student_not_recruited", ...writeErrors.slice(3)],
    responseSchema: "StudentDeleteResponse",
  },
] as const satisfies readonly ApiRouteSpec[];

export const API_ROUTE_GROUPS = [
  { scope: "profile", title: "프로필 권한" },
  { scope: "students:read", title: "학생 읽기 권한" },
  { scope: "students:write", title: "학생 쓰기 권한" },
] as const satisfies readonly { scope: ApiScope; title: string }[];

export function routePathToOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}");
}

export function resolveApiDocumentUrls(apiHost: string | undefined, requestUrl: string) {
  const origin = apiHost ? `https://${apiHost}` : new URL(requestUrl).origin;
  return {
    origin,
    baseUrl: `${origin}/v1`,
    llmsUrl: `${origin}${API_DOC_PATHS.llms}`,
    llmsFullUrl: `${origin}${API_DOC_PATHS.llmsFull}`,
    openApiUrl: `${origin}${API_DOC_PATHS.openApi}`,
  };
}

export function formatApiCurlCommand(baseUrl: string, route: ApiRouteSpec): string {
  const argumentsList = [
    `--request ${route.method}`,
    `--url '${baseUrl}${route.requestExample.path}'`,
    "--header 'Authorization: Bearer <API 키 또는 액세스 토큰>'",
    ...route.requestExample.headers.map(({ name, value }) => `--header '${name}: ${value}'`),
    ...(route.requestExample.body === undefined ? [] : [`--data '${JSON.stringify(route.requestExample.body)}'`]),
  ];
  const lines = argumentsList.map((argument, index) => {
    const line = (index === 0 ? "curl " : "  ") + argument;
    return index < argumentsList.length - 1 ? `${line} \\` : line;
  });
  return lines.join("\n");
}

export function formatApiErrorExampleJson(body: {
  error: {
    code: string;
    message: string;
    fields?: readonly { field: string; message: string }[];
    docs: string;
  };
}): string {
  const { error } = body;
  const fieldsLine = error.fields
    ? `    "fields": [${error.fields
        .map(({ field, message }) => `{ "field": ${JSON.stringify(field)}, "message": ${JSON.stringify(message)} }`)
        .join(", ")}],`
    : undefined;
  return [
    "{",
    '  "error": {',
    `    "code": ${JSON.stringify(error.code)},`,
    `    "message": ${JSON.stringify(error.message)},`,
    ...(fieldsLine ? [fieldsLine] : []),
    `    "docs": ${JSON.stringify(error.docs)}`,
    "  }",
    "}",
  ].join("\n");
}

export function matchApiRoutePath(pathTemplate: string, pathname: string): Record<string, string> | null {
  const names: string[] = [];
  const pattern = pathTemplate
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        names.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  const match = new RegExp(`^${pattern}$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
}

export function findApiRoute(method: string, pathname: string) {
  for (const route of API_ROUTES) {
    if (route.method !== method) continue;
    const params = matchApiRoutePath(route.path, pathname);
    if (params) return { route, params };
  }
  return null;
}

export function isKnownApiRoutePath(pathname: string): boolean {
  return API_ROUTES.some((route) => matchApiRoutePath(route.path, pathname) !== null);
}
