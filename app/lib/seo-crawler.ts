const GOOGLE_SEARCH_CRAWLER_PATTERN = /\b(?:Googlebot|Google-InspectionTool)\b/i;
const EXECUTABLE_SCRIPT_PATTERN =
  /<script\b(?![^>]*\btype\s*=\s*(?:["']application\/ld\+json["']|application\/ld\+json(?:\s|>)))[^>]*>[\s\S]*?<\/script\s*>/gi;

const SELF_CANONICAL_PATHS = new Set([
  "/",
  "/community",
  "/coupons",
  "/events",
  "/futures",
  "/mainstory",
  "/more",
  "/news",
  "/raids",
  "/students",
  "/timelines",
  "/utils/pyroxene",
  "/utils/raidscore",
  "/utils/relationship",
]);

export type SeoDocumentInvariantInput = {
  html: string;
  statusCode: number;
  requestPath: string;
  routerPath: string;
  renderId: string;
  buildId: string;
  expectedCanonical: string | null;
};

export function isGoogleSearchCrawler(userAgent: string | null): boolean {
  return GOOGLE_SEARCH_CRAWLER_PATTERN.test(userAgent ?? "");
}

export function isSenseiProfilePath(pathname: string): boolean {
  try {
    return /^\/@[^/]+(?:\/|$)/.test(decodeURIComponent(pathname));
  } catch {
    return false;
  }
}

/**
 * Google Search only needs the fully rendered server HTML. Removing executable
 * scripts prevents WRS from hydrating into a different route while preserving
 * JSON-LD data blocks for structured data.
 */
export function stripExecutableScripts(html: string): string {
  return html.replace(EXECUTABLE_SCRIPT_PATTERN, "");
}

/**
 * React streaming may emit completed Suspense content in a hidden S:n
 * container plus a small $RC script that moves it into the B:n boundary. The
 * crawler response cannot execute that script, so perform the same move on the
 * server before stripping scripts.
 */
export function materializeReactSuspenseBoundaries(html: string): string {
  const completions = [...html.matchAll(/\$RC\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)].map((match) => ({
    boundaryId: match[1],
    segmentId: match[2],
  }));
  let result = html;

  for (const completion of completions) {
    const segment = findElementById(result, completion.segmentId);
    const boundary = findSuspenseBoundary(result, completion.boundaryId);
    if (!segment || !boundary) {
      continue;
    }

    result = `${result.slice(0, boundary.start)}<!--$-->${segment.content}<!--/$-->${result.slice(boundary.end)}`;
    const relocatedSegment = findElementById(result, completion.segmentId);
    if (relocatedSegment) {
      result = `${result.slice(0, relocatedSegment.start)}${result.slice(relocatedSegment.end)}`;
    }
  }

  return result;
}

export function requiresSelfCanonical(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (
    SELF_CANONICAL_PATHS.has(normalized) ||
    /^\/events\/[^/]+$/.test(normalized) ||
    /^\/students\/[^/]+$/.test(normalized) ||
    /^\/raids\/[^/]+\/[^/]+$/.test(normalized)
  );
}

export function validateSeoDocumentInvariant(input: SeoDocumentInvariantInput): string[] {
  const failures: string[] = [];

  if (input.statusCode >= 500) {
    failures.push(`status:${input.statusCode}`);
  }
  if (input.requestPath !== input.routerPath) {
    failures.push(`router-path:${input.routerPath}`);
  }

  if (input.statusCode >= 200 && input.statusCode < 300) {
    validateMeta(input.html, "mollulog:render-id", input.renderId, failures);
    validateMeta(input.html, "mollulog:request-path", input.requestPath, failures);
    validateMeta(input.html, "mollulog:render-path", input.routerPath, failures);
    validateMeta(input.html, "mollulog:build-id", input.buildId, failures);

    if (input.expectedCanonical) {
      const canonical = findCanonical(input.html);
      if (canonical !== input.expectedCanonical) {
        failures.push(`canonical:${canonical ?? "missing"}`);
      }
    }
  }

  if (/Application Error!|Cannot read properties of undefined\s*\(reading ['"]renderId['"]\)/i.test(input.html)) {
    failures.push("application-error");
  }
  if (/\bhidden\b[^>]*\bid=["']S:[^"']+["']|\bid=["']S:[^"']+["'][^>]*\bhidden\b/i.test(input.html)) {
    failures.push("unresolved-suspense-boundary");
  }

  return failures;
}

function validateMeta(html: string, name: string, expected: string, failures: string[]) {
  const actual = findMetaContent(html, name);
  if (actual !== expected) {
    failures.push(`${name}:${actual ?? "missing"}`);
  }
}

function findMetaContent(html: string, expectedName: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (readAttribute(tag, "name") === expectedName) {
      return readAttribute(tag, "content");
    }
  }
  return null;
}

function findCanonical(html: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = readAttribute(tag, "rel");
    if (rel?.toLowerCase().split(/\s+/).includes("canonical")) {
      return readAttribute(tag, "href");
    }
  }
  return null;
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

type HtmlRange = {
  start: number;
  end: number;
};

type HtmlElementRange = HtmlRange & {
  content: string;
};

function findElementById(html: string, id: string): HtmlElementRange | null {
  const escapedId = escapeRegExp(id);
  const openingMatch = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\bid\\s*=\\s*(["'])${escapedId}\\2[^>]*>`, "i").exec(html);
  if (!openingMatch || openingMatch.index === undefined) {
    return null;
  }

  const tagName = openingMatch[1];
  const openingEnd = openingMatch.index + openingMatch[0].length;
  const tagPattern = new RegExp(`<(/?)${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openingEnd;
  let depth = 1;

  for (let tagMatch = tagPattern.exec(html); tagMatch; tagMatch = tagPattern.exec(html)) {
    if (tagMatch[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: openingMatch.index,
          end: tagPattern.lastIndex,
          content: html.slice(openingEnd, tagMatch.index),
        };
      }
    } else if (!tagMatch[0].endsWith("/>")) {
      depth += 1;
    }
  }

  return null;
}

function findSuspenseBoundary(html: string, boundaryId: string): HtmlRange | null {
  const escapedId = escapeRegExp(boundaryId);
  const templateMatch = new RegExp(`<template\\b[^>]*\\bid\\s*=\\s*(["'])${escapedId}\\1[^>]*><\\/template>`, "i").exec(
    html,
  );
  if (!templateMatch || templateMatch.index === undefined) {
    return null;
  }

  const comments = [...html.slice(0, templateMatch.index).matchAll(/<!--([\s\S]*?)-->/g)];
  const startComment = comments.at(-1);
  if (!startComment || startComment.index === undefined || !isSuspenseStart(startComment[1])) {
    return null;
  }

  const start = startComment.index;
  const commentPattern = /<!--([\s\S]*?)-->/g;
  commentPattern.lastIndex = start;
  let depth = 0;

  for (let match = commentPattern.exec(html); match; match = commentPattern.exec(html)) {
    const marker = match[1];
    if (isSuspenseStart(marker)) {
      depth += 1;
    } else if (marker === "/$" || marker === "/&") {
      depth -= 1;
      if (depth === 0) {
        return { start, end: commentPattern.lastIndex };
      }
    }
  }

  return null;
}

function isSuspenseStart(marker: string): boolean {
  return marker === "$" || marker === "$?" || marker === "$~" || marker === "$!" || marker === "&";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
