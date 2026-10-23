export function getGoogleAnalyticsPagePath(pathname: string, search: string, isOAuthAuthorizeRoute: boolean): string {
  return isOAuthAuthorizeRoute ? pathname : `${pathname}${search}`;
}
