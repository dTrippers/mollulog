import type { MetaDescriptor } from "react-router";

const SITE_URL = "https://mollulog.net";

/**
 * Returns a self-referencing canonical `<link>` meta descriptor for the given pathname.
 *
 * Query strings are intentionally dropped so URL variants (filters, tracking params,
 * pagination) collapse onto a single canonical URL. This resolves Google Search
 * Console's "Duplicate without user-selected canonical" by explicitly declaring the
 * preferred URL for each page.
 */
export function canonicalLink(pathname: string): MetaDescriptor {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return { tagName: "link", rel: "canonical", href: `${SITE_URL}${normalized}` };
}
