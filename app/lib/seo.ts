import type { MetaDescriptor } from "react-router";

export const SITE_NAME = "몰루로그";
export const SITE_TAGLINE = "블루 아카이브의 미래시, 컨텐츠, 통계 정보 및 유틸리티 모음.";
export const HOME_TITLE = "몰루로그 - 블루 아카이브 미래시/컨텐츠 및 유틸 모음";
export const HOME_DESCRIPTION =
  "블루 아카이브의 컨텐츠 정보를 확인하고, 각종 유틸리티를 활용하여 다양한 계획을 관리해보세요.";

const SITE_URL = "https://mollulog.net";

export const DEFAULT_OPEN_GRAPH_IMAGE_URL = `${SITE_URL}/mollulog-og-261121.png`;

export function shouldRenderDefaultOpenGraphImage(pathname: string, hasRouteSpecificOpenGraphImage: boolean): boolean {
  const isImageExcludedPath = pathname === "/security-campaign" || pathname.startsWith("/letter/");
  return !isImageExcludedPath && !hasRouteSpecificOpenGraphImage;
}

/**
 * Returns a self-referencing canonical `<link>` meta descriptor for the given pathname.
 *
 * Query strings are intentionally dropped so URL variants (filters, tracking params,
 * pagination) collapse onto a single canonical URL. This resolves Google Search
 * Console's "Duplicate without user-selected canonical" by explicitly declaring the
 * preferred URL for each page.
 */
export function canonicalLink(pathname: string): MetaDescriptor {
  return { tagName: "link", rel: "canonical", href: canonicalUrl(pathname) };
}

export type SocialMetaOptions = {
  /** The card title, without the trailing site name; `og:site_name` carries it. */
  title: string;
  /** Leave it out for a page without a description of its own. */
  description?: string;
  /** The page's own path. It becomes `og:url`, so pass the same path as the canonical link. */
  pathname: string;
  type?: "website" | "article";
};

/**
 * Open Graph and X (Twitter) card tags for a page, except the image.
 *
 * X reads `twitter:*` first and falls back to Open Graph, and Open Graph tags must use `property`. A page without a
 * title here shows no title on X or in other link previews. The image comes from the root layout's default, or from
 * the route itself when it sets `handle.ownsOpenGraphImage`.
 */
export function socialMeta({ title, description, pathname, type = "website" }: SocialMetaOptions): MetaDescriptor[] {
  const descriptors: MetaDescriptor[] = [
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "ko_KR" },
    { property: "og:title", content: title },
    { property: "og:url", content: canonicalUrl(pathname) },
    { name: "twitter:title", content: title },
  ];
  if (description) {
    descriptors.push(
      { property: "og:description", content: description },
      { name: "twitter:description", content: description },
    );
  }
  return descriptors;
}

export function canonicalUrl(pathname: string): string {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return `${SITE_URL}${normalized}`;
}
