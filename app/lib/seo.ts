import type { MetaDescriptor } from "react-router";

export const SITE_NAME = "몰루로그";
export const SITE_TAGLINE = "블루 아카이브의 미래시, 컨텐츠, 통계 정보 및 유틸리티 모음.";
export const HOME_TITLE = "몰루로그 - 블루 아카이브 미래시/컨텐츠 및 유틸 모음";
export const HOME_DESCRIPTION =
  "블루 아카이브의 컨텐츠 정보를 확인하고, 각종 유틸리티를 활용하여 다양한 계획을 관리해보세요.";

const SITE_URL = "https://mollulog.net";

export const DEFAULT_OPEN_GRAPH_IMAGE_URL = `${SITE_URL}/mollulog-og.png`;

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

export function canonicalUrl(pathname: string): string {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return `${SITE_URL}${normalized}`;
}
