import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LinksFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
  useMatches,
  useNavigation,
  useNavigationType,
  useParams,
} from "react-router";
import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";
import type { Route } from "./+types/root";
import { getActiveSensei } from "./auth/authenticator.server";
import { getPreference } from "./auth/preference.server";
import { getDiscordSignInFeedback } from "./components/features/auth/discord-signin-feedback";
import {
  ErrorPage,
  Footer,
  ServerErrorPage,
} from "./components/features/layout";
import {
  NavigationBar,
  getPageSiteBannerSlot,
  shouldRenderGlobalSiteBanner,
  SiteBanner,
} from "./components/v2/layout/navigation";
import { SignInProvider, useSignIn } from "./contexts/SignInProvider";
import { HaloModeProvider } from "./contexts/HaloModeContext";
import { StudentCardPopupProvider } from "./contexts/StudentCardPopupProvider";
import { TimeZoneProvider } from "./contexts/TimeZoneProvider";
import { type MobileNavigationPair, normalizeMobileNavigationIds } from "./domain/mobile-navigation";
import { DEFAULT_TIME_ZONE, getBrowserTimeZone, normalizeTimeZone } from "./lib/date-time";
import { isRootIndependentSubmission } from "./lib/revalidation";
import {
  initializeGoogleAnalytics,
  setGoogleAnalyticsEnabled,
  setGoogleAnalyticsLoggedIn,
  setGoogleAnalyticsPageContext,
  trackCurrentGoogleAnalyticsPageView,
} from "./lib/google-analytics.client";
import {
  consumePendingAuthEvent,
  setGoogleAnalyticsPageKey,
  trackGoogleAnalyticsEvent,
} from "./lib/google-analytics-events.client";
import { useConsumeGoogleAnalyticsEventCookie } from "./lib/google-analytics-hooks";
import {
  getContentScrollContainer,
  getContentScrollEntryKey,
  readContentScrollPosition,
  restoreContentScrollPosition,
  saveContentScrollPosition,
} from "./lib/content-scroll-restoration";
import { captureClientError } from "./lib/observability.client";
import { createRequestDiagnostics } from "./lib/request-diagnostics";
import { isServerRouteError, normalizeRouteError } from "./lib/route-error";
import { getRoutePageMetadata, rememberRoutePattern } from "./lib/route-pattern";
import { DEFAULT_OPEN_GRAPH_IMAGE_URL, shouldRenderDefaultOpenGraphImage } from "./lib/seo";
import { isGoogleSearchCrawler, isSenseiProfilePath } from "./lib/seo-crawler";
import { initializeWebVitals } from "./lib/web-vitals.client";
import {
  clearNavigationDirection,
  consumeNavigationDirection,
  getBrowserStorage,
  readFutureVisitState,
} from "./routes/futures._components/futures-navigation";
import { shouldKeepNewsScrollOnNavigation } from "./routes/news._components/news-scroll-state";
import styles from "./tailwind.css?url";
import type { NavigationBarContents } from "./views/navigation";
import { getNavigationBarContents } from "./views/navigation";
import { getSiteBanner } from "./views/site-banner";
import { submitPreference } from "./lib/preference-submission.client";

const SignInBottomSheet = lazy(() => import("./components/features/auth/SignInBottomSheet"));
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const themeConfig = {
  dark: {
    backgroundColor: "#262626",
  },
  light: {
    backgroundColor: "#fafafa",
  },
};
const reportedServerRouteErrorKeys = new Set<string>();

export type RootOutletContext = {
  currentUsername: string | null;
  isAdmin: boolean;
  darkMode: boolean;
  setDarkMode: (fn: (prev: boolean) => boolean) => void;
  mobileNavigationIds: MobileNavigationPair;
  setMobileNavigationIds: (ids: MobileNavigationPair) => void;
  navigationBarContents: NavigationBarContents;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env as Env & {
    FRONT_SENTRY_DSN?: string;
  };
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const colo = context.cloudflare.colo;
  const requestDiagnostics = context.cloudflare.requestDiagnostics ?? createRequestDiagnostics(request, "untracked");

  return ctx.tracing.enterSpan("root.loader", async (span) => {
    const sensei = await ctx.tracing.enterSpan("root_auth", () => getActiveSensei(env, request));
    const preference = await ctx.tracing.enterSpan("root_preference", () => getPreference(env, request));
    const publicReadEnv = env;
    const [navigationBarContents, siteBanner] = await Promise.all([
      ctx.tracing.enterSpan("root_nav", () => getNavigationBarContents(env, false, sensei?.id, ctx, publicReadEnv)),
      ctx.tracing.enterSpan("root_site_banner", () => getSiteBanner(publicReadEnv, new Date(), ctx)),
    ]);

    span.setAttribute("signedIn", sensei !== null);
    if (colo) {
      span.setAttribute("colo", colo);
    }

    return {
      currentUsername: sensei?.username ?? null,
      isLoggedIn: sensei !== null,
      isAdmin: sensei?.role === "admin",
      currentProfileStudentId: sensei?.profileStudentId ?? null,
      darkMode: preference.darkMode ?? true,
      haloMode: preference.haloMode ?? false,
      displayTimeZone: normalizeTimeZone(preference.timeZone ?? DEFAULT_TIME_ZONE),
      hasStoredTimeZone: preference.timeZone !== undefined,
      favoriteNavigationIds: preference.favoriteNavigationIds ?? [],
      mobileNavigationIds: preference.mobileNavigationIds ?? normalizeMobileNavigationIds(undefined),
      desktopNavigationCollapsed: preference.desktopNavigationCollapsed,
      desktopNavigationExpandedGroups: preference.desktopNavigationExpandedGroups,
      navigationBarContents,
      siteBanner,
      publicEnv: {
        STAGE: env.STAGE ?? "local",
        FRONT_SENTRY_DSN: env.FRONT_SENTRY_DSN ?? "",
      },
      staticCrawlerResponse: isGoogleSearchCrawler(request.headers.get("user-agent")),
      requestDiagnostics: {
        renderId: requestDiagnostics.renderId,
        requestPath: requestDiagnostics.requestPath,
        buildId: requestDiagnostics.buildId,
      },
    };
  });
};

// The root loader reads the session, preferences, and navigation badges on every page. Background submissions that
// cannot change any of them, such as likes or the event shop autosave, skip it.
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isRootIndependentSubmission(args) && args.defaultShouldRevalidate;

export const links: LinksFunction = () => [
  {
    rel: "icon",
    type: "image/png",
    sizes: "32x32",
    href: "/favicon-32x32.png",
  },
  {
    rel: "icon",
    type: "image/png",
    sizes: "16x16",
    href: "/favicon-16x16.png",
  },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
  // Student, event, and resource images come from assets.baql.net; UI and boss images from assets.mollulog.net.
  { rel: "preconnect", href: "https://assets.baql.net" },
  { rel: "preconnect", href: "https://assets.mollulog.net" },
  { rel: "preconnect", href: "https://cdnjs.cloudflare.com", crossOrigin: "anonymous" },
  // `precedence` makes React emit these stylesheets ahead of the ~100 module preloads it hoists into the head. Listed after
  // them, the CSS that gates the first paint shared a slow connection with all of that JavaScript.
  // Full files rather than the dynamic subset: the subset swaps glyph ranges in one by one as new text appears, so text
  // visibly flickers on every page, while full files swap once and are cached afterwards.
  {
    rel: "stylesheet",
    href: "https://cdnjs.cloudflare.com/ajax/libs/pretendard/1.3.8/static/pretendard.css",
    precedence: "default",
  },
  { rel: "stylesheet", href: styles, precedence: "default" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData<typeof loader>();
  const location = useLocation();
  const darkMode = loaderData?.darkMode ?? true;
  const theme = darkMode ? themeConfig.dark : themeConfig.light;
  const reserveMobileSiteBanner = Boolean(
    loaderData?.siteBanner && shouldRenderGlobalSiteBanner(loaderData.siteBanner, "mobile_header", location.pathname),
  );
  const hasRouteSpecificOpenGraphImage = useMatches().some((match) => {
    const routeHandle = match.handle;
    return (
      match.data !== undefined &&
      match.data !== null &&
      typeof routeHandle === "object" &&
      routeHandle !== null &&
      "ownsOpenGraphImage" in routeHandle &&
      routeHandle.ownsOpenGraphImage === true
    );
  });
  const renderDefaultOpenGraphImage = shouldRenderDefaultOpenGraphImage(
    location.pathname,
    hasRouteSpecificOpenGraphImage,
  );
  return (
    <html
      lang="ko"
      className={darkMode ? "dark" : undefined}
      style={
        {
          "--mobile-site-banner-estimated-height": reserveMobileSiteBanner ? "4rem" : "0px",
        } as React.CSSProperties
      }
    >
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0,viewport-fit=cover"
        />
        <meta name="theme-color" content={theme.backgroundColor} />
        <meta name="background-color" content={theme.backgroundColor} />
        <meta name="mollulog:stage" content={loaderData?.publicEnv?.STAGE ?? "local"} />
        <meta name="mollulog:render-id" content={loaderData?.requestDiagnostics?.renderId ?? ""} />
        <meta name="mollulog:request-path" content={loaderData?.requestDiagnostics?.requestPath ?? ""} />
        <meta name="mollulog:render-path" content={location.pathname} />
        <meta name="mollulog:build-id" content={loaderData?.requestDiagnostics?.buildId ?? ""} />
        {isSenseiProfilePath(location.pathname) ? <meta name="robots" content="noindex" /> : null}
        <meta name="mollulog:front-sentry-dsn" content={loaderData?.publicEnv?.FRONT_SENTRY_DSN ?? ""} />
        <Meta />
        {/* Routes with a custom image or summary card supply their own metadata. */}
        {renderDefaultOpenGraphImage ? (
          <>
            <meta name="twitter:card" content="summary_large_image" />
            <meta property="og:image" content={DEFAULT_OPEN_GRAPH_IMAGE_URL} />
          </>
        ) : null}
        <Links />
      </head>
      <body>
        {children}
        {!loaderData?.staticCrawlerResponse && (
          <>
            <ScrollRestoration />
            <Scripts />
          </>
        )}
      </body>
    </html>
  );
}

export default function App() {
  const loaderData = useLoaderData<typeof loader>();
  const {
    currentUsername,
    isAdmin,
    currentProfileStudentId,
    favoriteNavigationIds,
    mobileNavigationIds: initialMobileNavigationIds,
    desktopNavigationCollapsed,
    desktopNavigationExpandedGroups,
    navigationBarContents,
    siteBanner,
  } = loaderData;

  const [darkMode, setDarkMode] = useState(loaderData.darkMode);
  const [haloMode, setHaloMode] = useState(loaderData.haloMode);
  const [displayTimeZone, setDisplayTimeZone] = useState(loaderData.displayTimeZone);
  const [displayTimeZoneResolved, setDisplayTimeZoneResolved] = useState(loaderData.hasStoredTimeZone);
  const [mobileNavigationIds, setMobileNavigationIds] = useState<MobileNavigationPair>(() =>
    normalizeMobileNavigationIds(initialMobileNavigationIds),
  );
  const loadingBarRef = useRef<LoadingBarRef>(null);
  const submittedTimeZoneRef = useRef<string | null>(null);

  const navigate = useNavigation();
  useEffect(() => {
    // "submitting" counts too, so a slow form submission shows progress instead of looking ignored.
    if (navigate.state !== "idle") {
      loadingBarRef.current?.continuousStart();
    } else {
      loadingBarRef.current?.complete();
    }
  }, [navigate.state]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const browserTimeZone = getBrowserTimeZone();
    if (!browserTimeZone) {
      return;
    }

    if (browserTimeZone === loaderData.displayTimeZone || browserTimeZone === submittedTimeZoneRef.current) {
      setDisplayTimeZoneResolved(true);
      return;
    }

    setDisplayTimeZone(browserTimeZone);
    setDisplayTimeZoneResolved(true);
    submittedTimeZoneRef.current = browserTimeZone;
    void submitPreference({ timeZone: browserTimeZone }).catch(() => undefined);
  }, [loaderData.displayTimeZone]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const location = useLocation();
  const matches = useMatches();
  const navigationType = useNavigationType();
  const pathname = location.pathname;
  // Pages are remounted when the URL params change (another student, event, user, ...) so their local state starts
  // fresh, but not when only a static segment changes, so a layout keeps its state and images across its tabs.
  const routeParamsKey = JSON.stringify(useParams());
  const isOAuthAuthorizeRoute = matches.some((match) => match.id === "routes/oauth.authorize");
  const routePage = getRoutePageMetadata(matches);
  const previousRoutePatternRef = useRef<string | undefined>(undefined);
  const pageViewLocationKeyRef = useRef<string | undefined>(undefined);
  const analyticsPageContext = useMemo(
    () => ({
      routePattern: routePage.routePattern,
      contentGroup: routePage.contentGroup,
      ...(routePage.contentId ? { contentId: routePage.contentId } : {}),
      referrer: typeof document === "undefined" ? undefined : document.referrer,
      previousRoutePattern: previousRoutePatternRef.current,
    }),
    [routePage.contentGroup, routePage.contentId, routePage.routePattern],
  );
  const analyticsEnabled = loaderData.publicEnv.STAGE === "prod";
  // `.client` exports are empty during SSR; set the analytics state before child effects read it.
  if (typeof window !== "undefined") {
    setGoogleAnalyticsLoggedIn(loaderData.isLoggedIn);
    setGoogleAnalyticsPageKey(location.key);
    setGoogleAnalyticsPageContext(analyticsPageContext);
    setGoogleAnalyticsEnabled(analyticsEnabled);
  }
  rememberRoutePattern(location.pathname, routePage.routePattern);
  const pageBannerSlot = getPageSiteBannerSlot(pathname, siteBanner);
  const routeKey = location.key;
  const isContentTransitionRoute =
    pathname === "/futures" || pathname.startsWith("/events/") || pathname.startsWith("/raids/");

  useEffect(() => {
    if (!analyticsEnabled) {
      return;
    }
    initializeGoogleAnalytics();
  }, [analyticsEnabled]);

  useEffect(() => {
    if (!analyticsEnabled) {
      return;
    }
    if (pageViewLocationKeyRef.current === location.key) return;
    pageViewLocationKeyRef.current = location.key;
    trackCurrentGoogleAnalyticsPageView({
      ...analyticsPageContext,
    });
    previousRoutePatternRef.current = analyticsPageContext.routePattern;
  }, [analyticsEnabled, location.key, analyticsPageContext]);

  useEffect(() => {
    if (analyticsEnabled) initializeWebVitals();
  }, [analyticsEnabled]);

  useEffect(() => {
    if (!loaderData.isLoggedIn) return;
    const pendingAuthEvent = consumePendingAuthEvent();
    if (!pendingAuthEvent) return;
    if (pendingAuthEvent.eventName === "login") {
      trackGoogleAnalyticsEvent("login", { method: pendingAuthEvent.method });
    } else {
      trackGoogleAnalyticsEvent("sign_up", { method: pendingAuthEvent.method });
    }
  }, [loaderData.isLoggedIn]);

  useConsumeGoogleAnalyticsEventCookie();

  // The offset of the current history entry, kept up to date by a scroll listener. It is read when the entry changes,
  // because by then the container already holds the next page and may have clamped its scrollTop.
  const contentScrollRef = useRef<{ entryKey: string; scrollTop: number } | null>(null);

  useEffect(() => {
    const container = getContentScrollContainer();
    if (!container) {
      return;
    }
    const handleScroll = () => {
      if (contentScrollRef.current) {
        contentScrollRef.current.scrollTop = container.scrollTop;
      }
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const storage = getBrowserStorage("sessionStorage");
    const scrollableContainer = getContentScrollContainer();
    const scrollEntryKey = getContentScrollEntryKey(location);
    const previousEntry = contentScrollRef.current;
    if (previousEntry && previousEntry.entryKey !== scrollEntryKey) {
      saveContentScrollPosition(storage, previousEntry.entryKey, previousEntry.scrollTop);
    }
    // Child layout effects run first, so a route that restores its own offset has already done so here.
    const keepCurrentScroll = () => {
      contentScrollRef.current = { entryKey: scrollEntryKey, scrollTop: scrollableContainer?.scrollTop ?? 0 };
    };

    const restoredFutureVisit =
      navigationType === "POP" && location.pathname === "/futures"
        ? readFutureVisitState(storage, routeKey)
        : null;
    if (restoredFutureVisit) {
      keepCurrentScroll();
      return;
    }
    // A back navigation to the news list restores its own saved offset (news route), so root must not reset it.
    if (
      shouldKeepNewsScrollOnNavigation({
        pathname: location.pathname,
        navigationType,
        entryKey: routeKey,
        storage,
      })
    ) {
      keepCurrentScroll();
      return;
    }

    let stopRestoring: (() => void) | undefined;
    if (scrollableContainer) {
      // Only a back/forward navigation inside the app restores; the first render of a visit or reload starts at the top.
      const savedScrollTop =
        previousEntry && navigationType === "POP" ? readContentScrollPosition(storage, scrollEntryKey) : null;
      if (savedScrollTop === null) {
        scrollableContainer.scrollTop = 0;
      } else {
        stopRestoring = restoreContentScrollPosition(scrollableContainer, savedScrollTop);
      }
    }
    keepCurrentScroll();
    return stopRestoring;
  }, [location, navigationType, routeKey]);

  useIsomorphicLayoutEffect(() => {
    const direction = consumeNavigationDirection();
    if (!direction) {
      clearNavigationDirection();
      return;
    }

    const timeoutId = window.setTimeout(clearNavigationDirection, 300);
    return () => window.clearTimeout(timeoutId);
  }, [routeKey]);

  return (
    <div className="min-h-dvh bg-background text-foreground transition-colors">
      <LoadingBar ref={loadingBarRef} color="#3b82f6" height={3} waitingTime={300} />
      <HaloModeProvider value={{ haloMode, setHaloMode }}>
      <SignInProvider>
        <div className="flex flex-col lg:flex-row h-dvh">
          {isOAuthAuthorizeRoute ? null : (
            <NavigationBar
              currentUsername={currentUsername}
              isAdmin={isAdmin}
              currentProfileStudentId={currentProfileStudentId}
              favoriteNavigationIds={favoriteNavigationIds}
              mobileNavigationIds={mobileNavigationIds}
              desktopNavigationCollapsed={desktopNavigationCollapsed}
              desktopNavigationExpandedGroups={desktopNavigationExpandedGroups}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              upcomingEvent={navigationBarContents.upcomingEvent}
              hasRecentNews={navigationBarContents.hasRecentNews}
              hasOngoingRaid={navigationBarContents.hasOngoingRaid}
              hasUnconsumedCoupons={navigationBarContents.hasUnconsumedCoupons}
              hasUnreadFeedbackReplies={navigationBarContents.hasUnreadFeedbackReplies}
              unreadNotificationCount={navigationBarContents.unreadNotificationCount}
              menuBadgeOverrides={navigationBarContents.menuBadgeOverrides}
              siteBanner={siteBanner}
            />
          )}
          <div
            className={`mllg-content-area flex min-h-0 w-full flex-1 flex-col overflow-y-scroll ${
              isOAuthAuthorizeRoute ? "" : "pt-[var(--mobile-header-height)] lg:min-w-0 lg:pt-0"
            } ${
              isContentTransitionRoute && !isOAuthAuthorizeRoute ? "mllg-view-transition-content" : ""
            }`}
          >
            <div
              className={`page-available-width-container @container/page-available mx-auto flex w-full shrink-0 grow flex-col transition-all duration-300 ease-out motion-reduce:transition-none ${
                isOAuthAuthorizeRoute
                  ? "min-h-dvh max-w-none p-0"
                  : "max-w-7xl px-4 pt-2 pb-6 has-[[data-page-max-width=wide]]:max-w-screen-2xl has-[[data-page-max-width=full]]:max-w-none md:px-8 lg:py-6"
              }`}
            >
              <div className="grow">
                <TimeZoneProvider timeZone={displayTimeZone} resolved={displayTimeZoneResolved}>
                  <StudentCardPopupProvider key={routeParamsKey}>
                    {pageBannerSlot && siteBanner ? <SiteBanner banner={siteBanner} slot={pageBannerSlot} /> : null}
                    <Outlet
                      context={
                        {
                          darkMode,
                          setDarkMode,
                          mobileNavigationIds,
                          setMobileNavigationIds,
                          currentUsername,
                          isAdmin,
                          navigationBarContents,
                        } satisfies RootOutletContext
                      }
                    />
                  </StudentCardPopupProvider>
                </TimeZoneProvider>
              </div>
              {isOAuthAuthorizeRoute ? null : <Footer />}
            </div>
          </div>
        </div>
        <SignInBottomSheetHost />
      </SignInProvider>
      </HaloModeProvider>
    </div>
  );
}

function SignInBottomSheetHost() {
  const { isSignInVisible, showSignIn } = useSignIn();
  const location = useLocation();
  const discordSignInFeedback =
    location.pathname === "/" ? getDiscordSignInFeedback(new URLSearchParams(location.search)) : null;
  const discordSignInError = discordSignInFeedback?.text ?? null;

  useEffect(() => {
    if (discordSignInError) {
      showSignIn();
    }
  }, [discordSignInError, showSignIn]);

  if (!isSignInVisible) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <SignInBottomSheet initialError={discordSignInError} />
    </Suspense>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const normalized = normalizeRouteError(error);
  const isServerError = isServerRouteError(normalized);
  const location = useLocation();

  useEffect(() => {
    if (!isServerError || typeof window === "undefined") {
      return;
    }

    const reportKey = [
      location.key,
      location.pathname,
      normalized.status,
      normalized.code ?? "",
      normalized.title,
      normalized.message,
    ].join(":");
    if (reportedServerRouteErrorKeys.has(reportKey)) {
      return;
    }
    reportedServerRouteErrorKeys.add(reportKey);

    const reportError =
      error instanceof Error ? error : new Error(`${normalized.status} ${normalized.title}: ${normalized.message}`);
    captureClientError(reportError, {
      code: normalized.code,
      currentUrl: window.location.href,
      details: normalized.details,
      location: location.pathname,
      source: "root.error_boundary.server_error",
      status: normalized.status,
    });
  }, [
    error,
    isServerError,
    location.key,
    location.pathname,
    normalized.code,
    normalized.details,
    normalized.message,
    normalized.status,
    normalized.title,
  ]);

  if (!isServerError) {
    return (
      <div className="min-h-dvh w-screen bg-white text-neutral-950 dark:bg-neutral-900 dark:text-neutral-100 flex items-center justify-center px-4">
        <ErrorPage status={normalized.status} title={normalized.title} message={normalized.message} />
      </div>
    );
  }

  return <ServerErrorPage status={normalized.status} title={normalized.title} message={normalized.message} />;
}
