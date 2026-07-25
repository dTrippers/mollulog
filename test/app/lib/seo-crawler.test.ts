import { describe, expect, it } from "@jest/globals";
import {
  isGoogleSearchCrawler,
  isSenseiProfilePath,
  materializeReactSuspenseBoundaries,
  requiresSelfCanonical,
  stripExecutableScripts,
  validateSeoDocumentInvariant,
} from "~/lib/seo-crawler";

describe("Google search crawler SEO containment", () => {
  it("recognizes Googlebot and Search Console inspection user agents only", () => {
    expect(isGoogleSearchCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(
      true,
    );
    expect(isGoogleSearchCrawler("Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)")).toBe(true);
    expect(isGoogleSearchCrawler("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36")).toBe(false);
    expect(isGoogleSearchCrawler(null)).toBe(false);
  });

  it("recognizes every sensei profile path for noindex", () => {
    expect(isSenseiProfilePath("/@someone")).toBe(true);
    expect(isSenseiProfilePath("/@someone/")).toBe(true);
    expect(isSenseiProfilePath("/@someone/timelines/example")).toBe(true);
    expect(isSenseiProfilePath("/%40someone/students")).toBe(true);
    expect(isSenseiProfilePath("/@someone/%E0%A4%A")).toBe(true);
    expect(isSenseiProfilePath("/%40someone/%E0%A4%A")).toBe(true);
    expect(isSenseiProfilePath("/%40some%ZZ/students")).toBe(true);
    expect(isSenseiProfilePath("/students/@someone")).toBe(false);
    expect(isSenseiProfilePath("/api/followerships")).toBe(false);
    expect(isSenseiProfilePath("/%E0%A4%A")).toBe(false);
  });

  it("removes executable scripts while preserving JSON-LD", () => {
    const html = [
      "<html><head>",
      '<script type="application/ld+json">{"name":"MolluLog"}</script>',
      '<script type="module" src="/assets/root.js"></script>',
      "</head><body><script>window.__router = true</script></body></html>",
    ].join("");

    const stripped = stripExecutableScripts(html);

    expect(stripped).toContain('type="application/ld+json"');
    expect(stripped).not.toContain("root.js");
    expect(stripped).not.toContain("window.__router");
  });

  it("materializes completed React Suspense boundaries without executing their scripts", () => {
    const html = [
      '<main><!--$?--><template id="B:0"></template><p>Loading</p><!--/$--></main>',
      '<div hidden id="S:0"><section><div>Resolved content</div></section></div>',
      '<script>$RC("B:0","S:0")</script>',
    ].join("");

    const materialized = stripExecutableScripts(materializeReactSuspenseBoundaries(html));

    expect(materialized).toBe("<main><!--$--><section><div>Resolved content</div></section><!--/$--></main>");
  });

  it("accepts a self-consistent static SSR document", () => {
    const html = validDocument();

    expect(
      validateSeoDocumentInvariant({
        html,
        statusCode: 200,
        requestPath: "/futures",
        routerPath: "/futures",
        renderId: "render-1",
        buildId: "build-1",
        expectedCanonical: "https://mollulog.net/futures",
      }),
    ).toEqual([]);
  });

  it("rejects route pollution, missing diagnostics, and application errors", () => {
    const html = validDocument()
      .replace('content="/futures"', 'content="/@ASDFASDF"')
      .replace('<meta name="mollulog:build-id" content="build-1">', "")
      .replace("</body>", "<p>Application Error!</p></body>");

    expect(
      validateSeoDocumentInvariant({
        html,
        statusCode: 200,
        requestPath: "/futures",
        routerPath: "/futures",
        renderId: "render-1",
        buildId: "build-1",
        expectedCanonical: "https://mollulog.net/futures",
      }),
    ).toEqual(["mollulog:request-path:/@ASDFASDF", "mollulog:build-id:missing", "application-error"]);
  });

  it("rejects unresolved React Suspense completion containers", () => {
    expect(
      validateSeoDocumentInvariant({
        html: `${validDocument()}<div hidden id="S:0">unresolved</div>`,
        statusCode: 200,
        requestPath: "/futures",
        routerPath: "/futures",
        renderId: "render-1",
        buildId: "build-1",
        expectedCanonical: "https://mollulog.net/futures",
      }),
    ).toContain("unresolved-suspense-boundary");
  });

  it("requires canonical validation only for public canonicalized routes", () => {
    expect(requiresSelfCanonical("/")).toBe(true);
    expect(requiresSelfCanonical("/events")).toBe(true);
    expect(requiresSelfCanonical("/raids/grand-assault/31")).toBe(true);
    expect(requiresSelfCanonical("/students/10000")).toBe(true);
    expect(requiresSelfCanonical("/timelines")).toBe(true);
    expect(requiresSelfCanonical("/utils/pyroxene")).toBe(true);
    expect(requiresSelfCanonical("/utils/raidscore")).toBe(true);
    expect(requiresSelfCanonical("/api/preference")).toBe(false);
    expect(requiresSelfCanonical("/@someone")).toBe(false);
  });
});

function validDocument() {
  return [
    "<html><head>",
    '<meta name="mollulog:render-id" content="render-1">',
    '<meta name="mollulog:request-path" content="/futures">',
    '<meta name="mollulog:render-path" content="/futures">',
    '<meta name="mollulog:build-id" content="build-1">',
    '<link href="https://mollulog.net/futures" rel="canonical">',
    "<title>미래시 | 몰루로그</title>",
    "</head><body></body></html>",
  ].join("");
}
