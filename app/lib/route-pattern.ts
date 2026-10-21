export type RouteMatchLike = {
  id: string;
  params: Record<string, unknown>;
};

export type RoutePageMetadata = {
  routePattern: string;
  contentGroup: string;
  contentId?: string;
};

const LITERAL_DELIMITER = "\uE000";

function splitRouteId(routeId: string) {
  const routeName = routeId.replace(/^routes\//, "").replace(/\.(?:tsx?|jsx?)$/, "");
  const segments: string[] = [];
  let segment = "";
  for (let index = 0; index < routeName.length; index += 1) {
    const character = routeName[index];
    if (character === "[") {
      const end = routeName.indexOf("]", index + 1);
      if (end !== -1) {
        segment += `${LITERAL_DELIMITER}${routeName.slice(index + 1, end)}${LITERAL_DELIMITER}`;
        index = end;
        continue;
      }
    }
    if (character === ".") {
      segments.push(segment);
      segment = "";
      continue;
    }
    segment += character;
  }
  if (segment) segments.push(segment);
  return segments;
}

function restoreLiterals(segment: string) {
  return segment.replace(/\uE000([^\uE000]*)\uE000/g, "$1");
}

export function routeIdToPattern(routeId: string): string {
  if (routeId === "root" || routeId === "routes/root") return "/";

  const routeSegments = splitRouteId(routeId);
  const pathSegments = routeSegments
    .filter((segment, index) => segment !== "_index" && !(segment.startsWith("_") && index < routeSegments.length - 1))
    .map((segment) => {
      const withoutTrailingUnderscore = segment.endsWith("_") ? segment.slice(0, -1) : segment;
      if (withoutTrailingUnderscore.startsWith("$") && !withoutTrailingUnderscore.includes(LITERAL_DELIMITER)) {
        const paramName = withoutTrailingUnderscore.slice(1);
        return `:${paramName}`;
      }
      return restoreLiterals(withoutTrailingUnderscore);
    })
    .filter(Boolean);

  return pathSegments.length === 0 ? "/" : `/${pathSegments.join("/")}`;
}

function validContentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

export function getRoutePageMetadata(matches: RouteMatchLike[]): RoutePageMetadata {
  const activeMatch = matches.at(-1);
  const routePattern = activeMatch ? routeIdToPattern(activeMatch.id) : "/";
  const firstSegment = routePattern.split("/").filter(Boolean)[0];
  const isProfileRoute = activeMatch?.id.startsWith("routes/$username.") ?? false;
  const contentGroup = !firstSegment ? "home" : isProfileRoute ? "profile" : firstSegment.replace(/^:/, "");

  let contentId: string | undefined;
  for (const match of [...matches].reverse()) {
    if (/^routes\/students\.\$id(?:\.|$)/.test(match.id) && validContentId(match.params.id)) {
      contentId = match.params.id;
      break;
    }
    if (/^routes\/events\.\$uid(?:\.|$)/.test(match.id) && validContentId(match.params.uid)) {
      contentId = match.params.uid;
      break;
    }
    if (/^routes\/raids\.\$raidType\.\$seasonIndex(?:\.|$)/.test(match.id)) {
      const raidType = match.params.raidType;
      const seasonIndex = match.params.seasonIndex;
      if (validContentId(raidType) && validContentId(seasonIndex)) {
        contentId = `${raidType}-${seasonIndex}`;
        break;
      }
    }
  }

  return { routePattern, contentGroup, ...(contentId ? { contentId } : {}) };
}

const routePatternsByPath = new Map<string, string>();

/** Keeps path-to-pattern mappings in memory so Sentry can scrub navigation breadcrumbs. */
export function rememberRoutePattern(pathname: string, routePattern: string) {
  routePatternsByPath.set(pathname, routePattern);
  if (routePatternsByPath.size > 100) {
    const oldestPath = routePatternsByPath.keys().next().value;
    if (oldestPath) routePatternsByPath.delete(oldestPath);
  }
}

export function getRememberedRoutePattern(value: string | undefined) {
  if (!value || typeof window === "undefined") return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    return routePatternsByPath.get(url.pathname);
  } catch {
    return undefined;
  }
}
