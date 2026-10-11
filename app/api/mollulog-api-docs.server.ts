import { API_GUIDE_COPY, API_GUIDE_FULL, getApiEndpointGuide } from "~/domain/mollulog-api-guide";
import {
  API_DOC_NAME,
  API_DOC_PATHS,
  API_DOC_VERSION,
  API_PUBLIC_ERROR_CODES,
  API_PUBLIC_ERRORS,
  API_ROUTES,
  API_STUDENT_STATE_FIELD_SPECS,
  type ApiRouteParameter,
  type ApiRouteSpec,
  formatApiCurlCommand,
  formatApiErrorExampleJson,
  resolveApiDocumentUrls,
  routePathToOpenApiPath,
} from "~/domain/mollulog-api-spec";

type ApiDocsEnvironment = Pick<Env, "HOST" | "API_HOST">;

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

export function createApiErrorDocsUrl(host: string, code: keyof typeof API_PUBLIC_ERRORS): string {
  return `${host.replace(/\/+$/, "")}/developers/docs#error-${code}`;
}

export function createApiErrorBody(
  host: string,
  code: keyof typeof API_PUBLIC_ERRORS,
  message: string,
  fields?: readonly { field: string; message: string }[],
) {
  return {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      docs: createApiErrorDocsUrl(host, code),
    },
  };
}

export function createApiDocsResponse(pathname: string, requestUrl: string, env: ApiDocsEnvironment): Response | null {
  const urls = resolveApiDocumentUrls(env.API_HOST, requestUrl);
  const publicHeaders = {
    "Cache-Control": "public, max-age=300",
  };

  if (pathname === API_DOC_PATHS.openApi) {
    return new Response(JSON.stringify(createOpenApiDocument(urls.baseUrl, env.HOST)), {
      headers: { ...publicHeaders, "Content-Type": JSON_CONTENT_TYPE },
    });
  }
  if (pathname === API_DOC_PATHS.llms) {
    return new Response(renderLlmsIndex(urls, env.HOST), {
      headers: { ...publicHeaders, "Content-Type": MARKDOWN_CONTENT_TYPE },
    });
  }
  if (pathname === API_DOC_PATHS.llmsFull) {
    return new Response(renderLlmsFull(urls, env.HOST), {
      headers: { ...publicHeaders, "Content-Type": MARKDOWN_CONTENT_TYPE },
    });
  }
  if (pathname === API_DOC_PATHS.discovery && env.API_HOST) {
    const documents = {
      llms: urls.llmsUrl,
      llmsFull: urls.llmsFullUrl,
      openApi: urls.openApiUrl,
      human: `${env.HOST.replace(/\/+$/, "")}/developers/docs`,
    };
    return new Response(JSON.stringify({ name: API_DOC_NAME, version: API_DOC_VERSION, documents }), {
      headers: { ...publicHeaders, "Content-Type": JSON_CONTENT_TYPE },
    });
  }
  return null;
}

export function createOpenApiDocument(baseUrl: string, host: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of API_ROUTES) {
    const path = routePathToOpenApiPath(route.path);
    paths[path] ??= {};
    const parameters = (route.parameters as readonly ApiRouteParameter[]).map((parameter) => ({
      name: parameter.name,
      in: parameter.location,
      required: parameter.required,
      description: parameter.description,
      schema: {
        type: parameter.type,
        ...(parameter.min == null ? {} : { [parameter.type === "string" ? "minLength" : "minimum"]: parameter.min }),
        ...(parameter.max == null ? {} : { [parameter.type === "string" ? "maxLength" : "maximum"]: parameter.max }),
        ...(parameter.default == null ? {} : { default: parameter.default }),
      },
      example: parameter.example,
    }));
    const success = {
      description: `성공 (${route.responseExample.status})`,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${route.responseSchema}` },
          example: route.responseExample.body,
        },
      },
    };
    const responses: Record<string, unknown> = { [route.responseExample.status]: success };
    const codesByStatus = new Map<number, (keyof typeof API_PUBLIC_ERRORS)[]>();
    for (const code of route.errors) {
      const status = API_PUBLIC_ERRORS[code].status;
      const codes = codesByStatus.get(status) ?? [];
      codes.push(code);
      codesByStatus.set(status, codes);
    }
    for (const [status, codes] of codesByStatus) {
      responses[status] = {
        description: codes.map((code) => `${code}: ${API_PUBLIC_ERRORS[code].title}`).join("; "),
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiErrorResponse" },
            examples: Object.fromEntries(
              codes.map((code) => [
                code,
                {
                  summary: API_PUBLIC_ERRORS[code].title,
                  value: createApiErrorBody(host, code, errorExampleMessage(code)),
                },
              ]),
            ),
          },
        },
      };
    }
    const requestSchema = "requestSchema" in route ? route.requestSchema : undefined;
    const requestExample = route.requestExample as ApiRouteSpec["requestExample"];
    paths[path][route.method.toLowerCase()] = {
      operationId: route.id,
      tags: ["Students"],
      summary: route.summary,
      description: route.permission === "read" ? "학생 읽기 권한이 필요해요." : "학생 쓰기 권한이 필요해요.",
      "x-required-permission": route.permission,
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(requestSchema
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${requestSchema}` },
                  example: requestExample.body,
                },
              },
            },
          }
        : {}),
      security: [{ bearerAuth: [] }],
      responses,
    };
  }

  const stateProperties = Object.fromEntries(
    Object.entries(API_STUDENT_STATE_FIELD_SPECS).map(([name, field]) => [
      name,
      {
        type: field.nullable ? ["integer", "null"] : "integer",
        minimum: field.min,
        maximum: field.max,
        description: field.meaning,
      },
    ]),
  );
  const stateRequired = Object.entries(API_STUDENT_STATE_FIELD_SPECS)
    .filter(([_, field]) => !field.nullable)
    .map(([name]) => name);
  const studentWithStateProperties = {
    studentUid: { type: "string", description: "대표 학생 UID" },
    ...stateProperties,
  };

  return {
    openapi: "3.1.0",
    info: {
      title: API_DOC_NAME,
      version: API_DOC_VERSION,
      description: API_GUIDE_FULL.overview,
    },
    servers: [{ url: baseUrl }],
    tags: [{ name: "Students", description: "학생 검색과 모집 학생 상태 관리" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API key" },
      },
      schemas: {
        StudentRegistration: {
          type: "object",
          additionalProperties: false,
          properties: { studentUid: { type: "string", minLength: 1 }, ...stateProperties },
          required: [
            "studentUid",
            ...Object.entries(API_STUDENT_STATE_FIELD_SPECS)
              .filter(([_, field]) => field.requiredForRegistration)
              .map(([name]) => name),
          ],
        },
        StudentPatch: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: stateProperties,
        },
        StudentSummary: {
          type: "object",
          additionalProperties: false,
          properties: {
            studentUid: { type: "string" },
            name: { type: "string" },
          },
          required: ["studentUid", "name"],
        },
        StudentSearchResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            students: { type: "array", items: { $ref: "#/components/schemas/StudentSummary" } },
            nextCursor: { type: ["string", "null"] },
          },
          required: ["students", "nextCursor"],
        },
        RecruitedStudentState: {
          type: "object",
          additionalProperties: false,
          properties: studentWithStateProperties,
          required: ["studentUid", ...stateRequired],
        },
        RecruitedStudentListResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            students: { type: "array", items: { $ref: "#/components/schemas/RecruitedStudentState" } },
            nextCursor: { type: ["string", "null"] },
          },
          required: ["students", "nextCursor"],
        },
        RecruitedStudentResponse: { $ref: "#/components/schemas/RecruitedStudentState" },
        StudentWriteResponse: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: { studentUid: { type: "string" } },
              required: ["studentUid"],
            },
            { $ref: "#/components/schemas/RecruitedStudentState" },
          ],
        },
        StudentDeleteResponse: {
          type: "object",
          additionalProperties: false,
          properties: { studentUid: { type: "string" }, deleted: { type: "boolean", const: true } },
          required: ["studentUid", "deleted"],
        },
        ApiFieldError: {
          type: "object",
          additionalProperties: false,
          properties: { field: { type: "string" }, message: { type: "string" } },
          required: ["field", "message"],
        },
        ApiError: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: { type: "string", enum: API_PUBLIC_ERROR_CODES },
            message: { type: "string" },
            fields: { type: "array", items: { $ref: "#/components/schemas/ApiFieldError" } },
            docs: { type: "string", format: "uri" },
          },
          required: ["code", "message", "docs"],
        },
        ApiErrorResponse: {
          type: "object",
          additionalProperties: false,
          properties: { error: { $ref: "#/components/schemas/ApiError" } },
          required: ["error"],
        },
      },
    },
  };
}

export function renderLlmsIndex(urls: ReturnType<typeof resolveApiDocumentUrls>, host: string): string {
  return [
    `# ${API_DOC_NAME}`,
    `> ${API_GUIDE_FULL.overview}`,
    "",
    "## Documentation",
    `- [전체 안내](${urls.llmsFullUrl})`,
    `- [OpenAPI](${urls.openApiUrl})`,
    `- [사람용 문서](${host.replace(/\/+$/, "")}/developers/docs)`,
    "",
  ].join("\n");
}

export function renderLlmsFull(urls: ReturnType<typeof resolveApiDocumentUrls>, host: string): string {
  const sections = [
    `# ${API_DOC_NAME}`,
    `> ${API_GUIDE_FULL.overview}`,
    "",
    `Base URL: ${urls.baseUrl}`,
    `OpenAPI: ${urls.openApiUrl}`,
    `사람용 문서: ${host.replace(/\/+$/, "")}/developers/docs`,
    "",
    "## 인증과 키 취급",
    ...API_GUIDE_FULL.authentication.map((line) => `- ${line}`),
    "",
    "## 핵심 실행 흐름",
    ...API_GUIDE_FULL.workflow.map((line, index) => `${index + 1}. ${line}`),
    "",
    "## 엔드포인트",
  ];

  for (const route of API_ROUTES) {
    const guide = getApiEndpointGuide(route.id);
    sections.push(
      "",
      `### ${route.method} ${route.displayPath}`,
      `권한: 학생 ${route.permission === "read" ? "읽기" : "쓰기"}`,
      route.summary,
    );
    if (route.parameters.length > 0) {
      sections.push("", "파라미터:");
      for (const parameter of route.parameters) {
        sections.push(`- \`${parameter.name}\`: ${parameter.description}`);
      }
    }
    sections.push(
      "",
      "요청 예시:",
      "```bash",
      formatApiCurlCommand(urls.baseUrl, route),
      "```",
      "",
      "응답 예시:",
      "```json",
    );
    sections.push(JSON.stringify(route.responseExample.body, null, 2), "```");
    if (guide && "response" in guide) sections.push("", guide.response);
    if (guide && "required" in guide) {
      sections.push(
        "",
        guide.required,
        guide.readPermission,
        `이미 등록한 학생이면 ${errorLink("student_already_recruited")}`,
      );
    }
    if (guide && "note" in guide) {
      const error = "error" in guide ? guide.error : undefined;
      sections.push("", `${guide.note}${error ? ` ${errorLink(error)}` : ""}`);
    }
    sections.push("", `오류: ${route.errors.map(errorLink).join(" · ")}`);
  }

  sections.push("", "## 학생 상태 필드", "");
  sections.push("| 필드 | 의미 | 범위 | null로 비우기 |", "| --- | --- | --- | --- |");
  for (const group of API_GUIDE_COPY.fieldGroups) {
    const firstField = API_STUDENT_STATE_FIELD_SPECS[group.fields[0] as keyof typeof API_STUDENT_STATE_FIELD_SPECS];
    const range = `${formatNumber(firstField.min)}–${formatNumber(firstField.max)}`;
    sections.push(
      `| ${group.fields.map((field) => `\`${field}\``).join("<br>")} | ${group.meaning}${"detail" in group ? `<br>${group.detail}` : ""} | ${range} | ${firstField.nullable ? "가능" : "불가"} |`,
    );
  }
  sections.push(
    "",
    "### 필드 간 제약",
    ...API_GUIDE_FULL.fieldRules.map((line) => `- ${line}`),
    "",
    API_GUIDE_FULL.representativeUid,
    API_GUIDE_FULL.responseScopes,
    API_GUIDE_FULL.deletion,
    "",
    "## 오류 code별 대응",
    "",
    "| HTTP | code | 의미와 대응 |",
    "| --- | --- | --- |",
  );
  for (const [code, error] of Object.entries(API_PUBLIC_ERRORS)) {
    sections.push(`| ${error.status} | \`${code}\` | ${error.title} · ${error.description} |`);
  }
  sections.push(
    "",
    ...API_GUIDE_FULL.errorFields.map((line) => `- ${line}`),
    "",
    "오류 응답 예시:",
    "```json",
    formatApiErrorExampleJson(
      createApiErrorBody(
        host,
        "invalid_request",
        API_GUIDE_COPY.errorExample.message,
        API_GUIDE_COPY.errorExample.fields,
      ),
    ),
    "```",
    "",
    "## 한도와 재시도",
    ...API_GUIDE_FULL.cursorAndLimit.map((line) => `- ${line}`),
    ...API_GUIDE_FULL.limits.map((line) => `- ${line}`),
    ...API_GUIDE_FULL.retry.map((line) => `- ${line}`),
    "",
    "## 동기화 예제",
    "```ts",
    renderTypeScriptExample(urls.baseUrl),
    "```",
    "",
  );
  return sections.join("\n");

  function errorLink(code: keyof typeof API_PUBLIC_ERRORS): string {
    return `\`${API_PUBLIC_ERRORS[code].status} ${code}\``;
  }
}

function errorExampleMessage(code: keyof typeof API_PUBLIC_ERRORS): string {
  return code === "invalid_request" ? API_GUIDE_COPY.errorExample.message : API_PUBLIC_ERRORS[code].title;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function renderTypeScriptExample(baseUrl: string): string {
  return `const baseUrl = ${JSON.stringify(baseUrl)};
const apiKey = process.env.MOLLULOG_API_KEY;
if (!apiKey) throw new Error("MOLLULOG_API_KEY 환경 변수를 설정해주세요.");

const headers = {
  Authorization: \`Bearer \${apiKey}\`,
  "Content-Type": "application/json",
};
const studentQuery = await fetch(\`\${baseUrl}/students?query=10000\`, { headers });
if (!studentQuery.ok) throw new Error("학생 찾기 요청을 확인해주세요.");
const found = (await studentQuery.json()) as { students: Array<{ studentUid: string }> };
const studentUid = found.students[0]?.studentUid;
if (!studentUid) throw new Error("학생 UID를 찾지 못했어요.");

const stateUrl = \`\${baseUrl}/me/students/\${encodeURIComponent(studentUid)}\`;
const current = await fetch(stateUrl, { headers });
const body = { studentUid, tier: 5, weaponTier: 0, level: 90 };

if (current.ok) {
  const updated = await fetch(stateUrl, { method: "PATCH", headers, body: JSON.stringify({ level: 90 }) });
  if (!updated.ok) throw new Error("학생 상태 수정을 확인해주세요.");
} else {
  const error = (await current.json()) as { error?: { code?: string } };
  if (current.status !== 404 || error.error?.code !== "student_not_recruited") {
    throw new Error("학생 상태 조회 결과를 확인해주세요.");
  }
  const registered = await fetch(\`\${baseUrl}/me/students\`, { method: "POST", headers, body: JSON.stringify(body) });
  if (registered.status === 409) {
    const updated = await fetch(stateUrl, { method: "PATCH", headers, body: JSON.stringify({ level: 90 }) });
    if (!updated.ok) throw new Error("학생 상태 수정을 확인해주세요.");
  } else if (!registered.ok) {
    throw new Error("학생 등록 결과를 확인해주세요.");
  }
}`;
}
