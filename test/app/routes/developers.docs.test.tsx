import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

import { API_GUIDE_COPY } from "~/domain/mollulog-api-guide";
import {
  API_PUBLIC_ERRORS,
  API_ROUTE_GROUPS,
  API_ROUTES,
  API_STUDENT_STATE_FIELD_SPECS,
  resolveApiDocumentUrls,
} from "~/domain/mollulog-api-spec";
import DevelopersLayout from "~/routes/developers";
import DevelopersDocs, { loader } from "~/routes/developers.docs";

const siteHost = "https://mollulog.net";
const urls = resolveApiDocumentUrls("api.mollulog.net", `${siteHost}/developers/docs`);

function renderDocsPage() {
  const loaderData = loader({
    request: new Request("http://127.0.0.1:8789/developers/docs"),
        context: { cloudflare: { env: { API_HOST: "api.mollulog.net", HOST: "https://dev.example.ts.net" } } },
  } as never);
  const RoutesStub = createRoutesStub([
    {
      id: "developers",
      path: "/developers",
      Component: DevelopersLayout,
      children: [
        {
          id: "developers-docs",
          path: "docs",
          loader: () => loaderData,
          Component: DevelopersDocs,
        },
      ],
    },
  ]);
  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/developers/docs"],
      hydrationData: { loaderData: { developers: { canManageApplications: false }, "developers-docs": loaderData } },
    }),
  );
}

function normalizeMarkup(markup: string) {
  return markup.replace(/<wbr\s*\/?\s*>/g, "");
}

function extractText(markup: string) {
  return normalizeMarkup(markup)
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function collectStringLeaves(value: unknown, path: string): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => collectStringLeaves(child, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => collectStringLeaves(child, `${path}.${key}`));
  }
  return [];
}

describe("developers API documentation page", () => {
  it.each([
    [undefined, "http://127.0.0.1:8789"],
    ["staging-api.example.com", "https://staging-api.example.com"],
  ] as const)("uses the API host or the local request origin when API_HOST is %s", (apiHost, origin) => {
      const result = loader({
        request: new Request("http://127.0.0.1:8789/developers/docs"),
        context: { cloudflare: { env: { API_HOST: apiHost, HOST: "https://dev.example.ts.net" } } },
      } as never);

      expect(result).toEqual({
        siteHost: "https://dev.example.ts.net",
        urls: {
          origin,
          baseUrl: `${origin}/v1`,
          llmsUrl: `${origin}/llms.txt`,
          llmsFullUrl: `${origin}/llms-full.txt`,
          openApiUrl: `${origin}/v1/openapi.json`,
        },
      });
  });

  it("renders the agent entry point and links from the shared guide", () => {
    const markup = normalizeMarkup(renderDocsPage());
    const text = extractText(markup);

    expect(markup).toContain("코딩 에이전트로 연동하기");
    expect(markup).toContain("프롬프트 예시");
    expect(text).toContain(
      "https://api.mollulog.net/llms.txt 를 읽고, 블루 아카이브 데이터 관리 서비스인 몰루로그 API에 대해 파악해주세요. 개발중인 도구와 어떻게 연동할 수 있을지 검토 후 제안해주세요.",
    );
    expect(text).not.toContain("CSV로 내보내는 기능");
    expect(markup).toContain('href="https://api.mollulog.net/llms-full.txt"');
    expect(markup).toContain('href="https://api.mollulog.net/llms.txt"');
    expect(markup).toContain('href="https://api.mollulog.net/v1/openapi.json"');
    expect(markup).toContain("https://api.mollulog.net/v1");
    expect(markup).not.toContain("브라우저 쿠키로는 인증되지 않아요");
    expect(markup).not.toContain("학생 읽기 · 학생 쓰기");
    expect(text).toContain("몰루로그 계정으로 로그인");
    expect(text).toContain("인증 URL");
    expect(text).toContain("토큰 URL");
    expect(text).toContain("Redirect URI는 등록한 주소와 정확히 같아야 해요");
    expect(text).toContain("액세스 토큰은 발급 후 1년 동안 사용할 수 있어요. 갱신 토큰을 발급하지 않으므로 만료되면 인증 절차를 다시 진행해야 해요.");
    expect(text).toContain("모델과 엔드포인트");
    expect(text).toContain("모집 학생 상태");
  });

  it("renders every endpoint, field, and public error from the shared modules", () => {
    const markup = normalizeMarkup(renderDocsPage());
    const text = extractText(markup);

    expect(API_ROUTE_GROUPS.flatMap((group) => group.routeIds)).toEqual(API_ROUTES.map((route) => route.id));
    expect(markup).toMatch(/<h4[^>]*>모집 학생 상태<\/h4>[\s\S]*<h5[^>]*>학생 상태 필드<\/h5>/);

    for (const route of API_ROUTES) {
      expect(markup).toContain(route.displayPath);
      expect(markup).toContain(route.summary);
      expect(text).toContain(JSON.stringify(route.responseExample.body));
    }
    for (const field of Object.keys(API_STUDENT_STATE_FIELD_SPECS)) expect(markup).toContain(field);
    for (const [code, error] of Object.entries(API_PUBLIC_ERRORS)) {
      expect(markup).toContain(`id="error-${code}"`);
      expect(markup).toContain(code);
      expect(markup).toContain(error.title);
      expect(markup).toContain(error.description);
    }
    expect(markup).toContain("https://dev.example.ts.net/developers/docs#error-invalid_request");
    expect(markup).not.toContain("육성 목표·선물 계획을 다루는 엔드포인트는");
  });

  it("requires Hangul in Korean API copy and renders every field-group meaning", () => {
    const text = extractText(renderDocsPage());
    const requiredStrings = [
      ...collectStringLeaves(API_GUIDE_COPY, "API_GUIDE_COPY"),
      ...Object.entries(API_PUBLIC_ERRORS).flatMap(([code, error]) => [
        { path: `API_PUBLIC_ERRORS.${code}.title`, value: error.title },
        { path: `API_PUBLIC_ERRORS.${code}.description`, value: error.description },
      ]),
      ...API_ROUTES.map((route) => ({ path: `API_ROUTES.${route.id}.summary`, value: route.summary })),
    ];
    const routeNotesAndResponses = Object.entries(API_GUIDE_COPY.routeGuides).flatMap(([routeId, guide]) =>
      Object.entries(guide)
        .filter(([key]) => key !== "error")
        .map(([key, value]) => ({ path: `API_GUIDE_COPY.routeGuides.${routeId}.${key}`, value })),
    );
    const koreanPageCopy = [
      { path: "API_GUIDE_COPY.pageTitle", value: API_GUIDE_COPY.pageTitle },
      ...Object.entries(API_GUIDE_COPY.sections).map(([key, value]) => ({
        path: `API_GUIDE_COPY.sections.${key}`,
        value,
      })),
      { path: "API_GUIDE_COPY.agentPromptLabel", value: API_GUIDE_COPY.agentPromptLabel },
      { path: "API_GUIDE_COPY.agentPromptTemplate", value: API_GUIDE_COPY.agentPromptTemplate },
      ...API_GUIDE_COPY.documentLinks.flatMap(({ key, label, copyLabel }) => [
        ...(key === "openApi" ? [] : [{ path: `API_GUIDE_COPY.documentLinks.${key}.label`, value: label }]),
        { path: `API_GUIDE_COPY.documentLinks.${key}.copyLabel`, value: copyLabel },
      ]),
      { path: "API_GUIDE_COPY.connection.authorization", value: API_GUIDE_COPY.connection.authorization },
      { path: "API_GUIDE_COPY.connection.baseUrlCopyLabel", value: API_GUIDE_COPY.connection.baseUrlCopyLabel },
      {
        path: "API_GUIDE_COPY.connection.authorizationCopyLabel",
        value: API_GUIDE_COPY.connection.authorizationCopyLabel,
      },
      ...Object.entries(API_GUIDE_COPY.parameterTable).map(([key, value]) => ({
        path: `API_GUIDE_COPY.parameterTable.${key}`,
        value,
      })),
      { path: "API_GUIDE_COPY.requestExampleLabel", value: API_GUIDE_COPY.requestExampleLabel },
      { path: "API_GUIDE_COPY.responseLabel", value: API_GUIDE_COPY.responseLabel },
      ...API_GUIDE_COPY.fieldTable.columns.map((value, index) => ({
        path: `API_GUIDE_COPY.fieldTable.columns[${index}]`,
        value,
      })),
      { path: "API_GUIDE_COPY.fieldTable.nullAllowed", value: API_GUIDE_COPY.fieldTable.nullAllowed },
      { path: "API_GUIDE_COPY.fieldTable.nullForbidden", value: API_GUIDE_COPY.fieldTable.nullForbidden },
      ...API_GUIDE_COPY.fieldGroups.flatMap((group, index) => [
        { path: `API_GUIDE_COPY.fieldGroups[${index}].meaning`, value: group.meaning },
        ...("detail" in group ? [{ path: `API_GUIDE_COPY.fieldGroups[${index}].detail`, value: group.detail }] : []),
      ]),
      ...API_GUIDE_COPY.pageFieldRules.map((value, index) => ({
        path: `API_GUIDE_COPY.pageFieldRules[${index}]`,
        value,
      })),
      ...API_GUIDE_COPY.pageLimits.flatMap(({ label, value }, index) => [
        { path: `API_GUIDE_COPY.pageLimits[${index}].label`, value: label },
        { path: `API_GUIDE_COPY.pageLimits[${index}].value`, value },
      ]),
      { path: "API_GUIDE_COPY.errorExampleLabel", value: API_GUIDE_COPY.errorExampleLabel },
      { path: "API_GUIDE_COPY.errorExample.message", value: API_GUIDE_COPY.errorExample.message },
      ...API_GUIDE_COPY.errorExample.fields.map(({ message }, index) => ({
        path: `API_GUIDE_COPY.errorExample.fields[${index}].message`,
        value: message,
      })),
    ];
    const requiredKoreanCopy = [
      ...Object.entries(API_PUBLIC_ERRORS).flatMap(([code, error]) => [
        { path: `API_PUBLIC_ERRORS.${code}.title`, value: error.title },
        { path: `API_PUBLIC_ERRORS.${code}.description`, value: error.description },
      ]),
      ...API_GUIDE_COPY.fieldGroups.map((group, index) => ({
        path: `API_GUIDE_COPY.fieldGroups[${index}].meaning`,
        value: group.meaning,
      })),
      ...API_ROUTES.flatMap((route) => [
        { path: `API_ROUTES.${route.id}.summary`, value: route.summary },
        ...route.parameters.map((parameter, index) => ({
          path: `API_ROUTES.${route.id}.parameters[${index}].description`,
          value: parameter.description,
        })),
      ]),
      ...routeNotesAndResponses,
      ...koreanPageCopy,
    ];

    for (const { path, value } of requiredStrings) {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
      expect(path.length).toBeGreaterThan(0);
    }
    const copyMissingHangul = requiredKoreanCopy.filter(({ value }) => !/[가-힣]/.test(value)).map(({ path }) => path);
    expect(copyMissingHangul).toEqual([]);
    for (const group of API_GUIDE_COPY.fieldGroups) {
      expect(group.meaning.trim().length).toBeGreaterThan(0);
      expect(text).toContain(group.meaning);
    }
    for (const route of API_ROUTES) expect(text).toContain(route.summary);
    for (const { title, description } of Object.values(API_PUBLIC_ERRORS)) {
      expect(text).toContain(title);
      expect(text).toContain(description);
    }
    expect(API_GUIDE_COPY.pageFieldRules).toEqual(["결과 상태가 규칙에 맞지 않으면 요청 전체를 거부해요"]);
    expect(text).not.toContain("등록할 때 보내지 않은 필드는 null로 저장돼요");
  });

  it("keeps the approved route notes, curl layout, and error anchors", () => {
    const markup = normalizeMarkup(renderDocsPage());

    expect(markup).toContain("등록하지 않은 학생이면");
    expect(markup).toContain('href="#error-student_not_recruited"');
    expect(markup).toContain('href="#error-student_already_recruited"');
    expect(markup).toContain("모집 등록, 현재 성장도, 인연·경험치를 지워요");
    expect(markup).toContain("육성 목표, 선물 계획, 플래너는 남아요");
    expect(markup).toContain("\n  --url &#x27;https://api.mollulog.net/v1/");
    expect(markup).toContain("scroll-mt-[calc(var(--mobile-header-height)+4.5rem)]");
    expect(markup).toContain("target:bg-v2-inset");
    expect(markup).toContain("@min-[48rem]/page-available:scroll-mt-4");
    expect(markup).not.toContain("lg:scroll-mt-4");
    expect(markup.match(/<details\b[^>]*\bopen(?:="")?/g) ?? []).toHaveLength(0);
  });

  it("keeps the approved URL, response, error table, and copy-button details", () => {
    const markup = renderDocsPage();
    const text = extractText(markup);

    expect(markup).toContain('aria-label="인증 URL 복사하기"');
    expect(markup).toContain('aria-label="토큰 URL 복사하기"');
    expect(markup).toContain('aria-label="토큰 응답 200 코드"');
    expect(text).toContain(
      '{"access_token":"<ACCESS_TOKEN>","token_type":"Bearer","expires_in":31536000,"scope":"profile students:write"}',
    );
    expect(text).not.toContain("내 프로필 확인");

    for (const url of [urls.llmsFullUrl, urls.llmsUrl, urls.openApiUrl]) {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(markup).toMatch(
        new RegExp(`<a\\b[^>]*href="${escapedUrl}"[^>]*><code class="break-keep">[\\s\\S]*?<\\/code><\\/a>`),
      );
    }
    expect(markup).toContain(
      '<span class="whitespace-nowrap">api.mollulog.net/</span><wbr/><span class="whitespace-nowrap">llms-full.txt</span>',
    );
    expect(markup).not.toContain(
      '<span class="whitespace-nowrap">api.mollulog.net</span><wbr/><span class="whitespace-nowrap">/llms-full.txt</span>',
    );

    expect(markup).toContain('aria-label="llms-full.txt 주소 복사"');
    expect(markup).toContain('aria-label="llms.txt 주소 복사"');
    expect(markup).toContain('aria-label="OpenAPI 주소 복사"');
    expect(markup).not.toContain('aria-label="OpenAPI 복사하기"');

    expect(text).toContain("응답: students(UID·이름)와 nextCursor");
    expect(text).toContain("응답: 모집 학생의 현재 상태 목록");
    expect(text).toContain("능력 해방 (HP · 공격력 · 치유력)");
    expect(markup).toMatch(/<thead[^>]*>[\s\S]*?<\/thead>\s*<tbody class="border-t border-v2-divider">/);
    expect(markup).toMatch(
      /<th class="w-14 py-2 align-top whitespace-nowrap font-semibold"[^>]*scope="rowgroup"[^>]*><code>400<\/code><\/th>/,
    );
    expect(text).toContain('"fields": [{ "field": "level", "message": "1부터 90 사이여야 해요." }],');
    expect(markup).toMatch(
      /<a class="[^"]*text-v2-link[^"]*" href="#error-student_not_recruited"><code>\s*404 student_not_recruited\s*<\/code><\/a>/,
    );
  });
});
