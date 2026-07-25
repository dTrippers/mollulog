import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";
import type { Route } from "./+types/root";
import { getActiveSensei } from "./auth/authenticator.server";
import { getPreference } from "./auth/preference.server";
import { ErrorPage, Footer, NavigationBar, ServerErrorPage } from "./components/features/layout";
import { SignInProvider, useSignIn } from "./contexts/SignInProvider";
import { StudentCardPopupProvider } from "./contexts/StudentCardPopupProvider";
import { TimeZoneProvider } from "./contexts/TimeZoneProvider";
import { withD1Session } from "./lib/d1-session";
import { DEFAULT_TIME_ZONE, getBrowserTimeZone, normalizeTimeZone } from "./lib/date-time";
import { initializeGoogleAnalytics, trackCurrentGoogleAnalyticsPageView } from "./lib/google-analytics.client";
import { captureClientError } from "./lib/observability.client";
import { createRequestDiagnostics } from "./lib/request-diagnostics";
import { isServerRouteError, normalizeRouteError } from "./lib/route-error";
import { isGoogleSearchCrawler, isSenseiProfilePath } from "./lib/seo-crawler";
import styles from "./tailwind.css?url";
import { getNavigationBarContents } from "./views/navigation";

const SignInBottomSheet = lazy(() => import("./components/features/auth/SignInBottomSheet"));
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
  darkMode: boolean;
  setDarkMode: (fn: (prev: boolean) => boolean) => void;
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env as Env & {
    FRONT_BETTER_STACK_SENTRY_DSN?: string;
  };
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const colo = context.cloudflare.colo;
  const requestDiagnostics = context.cloudflare.requestDiagnostics ?? createRequestDiagnostics(request, "untracked");

  return ctx.tracing.enterSpan("root.loader", async (span) => {
    const sensei = await ctx.tracing.enterSpan("root_auth", () => getActiveSensei(env, request));
    const preference = await ctx.tracing.enterSpan("root_preference", () => getPreference(env, request));
    const publicReadEnv = withD1Session(env, "first-unconstrained");
    const navigationBarContents = await ctx.tracing.enterSpan("root_nav", () =>
      getNavigationBarContents(env, false, sensei?.id, ctx, publicReadEnv),
    );

    span.setAttribute("signedIn", sensei !== null);
    if (colo) {
      span.setAttribute("colo", colo);
    }

    return {
      currentUsername: sensei?.username ?? null,
      currentProfileStudentId: sensei?.profileStudentId ?? null,
      darkMode: preference.darkMode ?? true,
      displayTimeZone: normalizeTimeZone(preference.timeZone ?? DEFAULT_TIME_ZONE),
      navigationBarContents,
      publicEnv: {
        STAGE: env.STAGE ?? "local",
        FRONT_BETTER_STACK_SENTRY_DSN: env.FRONT_BETTER_STACK_SENTRY_DSN ?? "",
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
  {
    rel: "stylesheet",
    href: "https://cdnjs.cloudflare.com/ajax/libs/pretendard/1.3.8/static/pretendard.css",
  },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/Nyannnnnng/GyeonggiTitleWoff/stylesheet.css",
  },
  { rel: "stylesheet", href: styles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData<typeof loader>();
  const location = useLocation();
  const darkMode = loaderData?.darkMode ?? true;
  const theme = darkMode ? themeConfig.dark : themeConfig.light;
  return (
    <html lang="ko" className={darkMode ? "dark" : undefined}>
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
        <meta
          name="mollulog:front-better-stack-sentry-dsn"
          content={loaderData?.publicEnv?.FRONT_BETTER_STACK_SENTRY_DSN ?? ""}
        />
        <Meta />
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
  const { currentUsername, currentProfileStudentId, navigationBarContents } = loaderData;

  const [darkMode, setDarkMode] = useState(loaderData.darkMode);
  const [displayTimeZone, setDisplayTimeZone] = useState(loaderData.displayTimeZone);
  const loadingBarRef = useRef<LoadingBarRef>(null);
  const submittedTimeZoneRef = useRef<string | null>(null);
  const preferenceFetcher = useFetcher();

  const navigate = useNavigation();
  useEffect(() => {
    if (navigate.state === "loading") {
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
    if (
      !browserTimeZone ||
      browserTimeZone === loaderData.displayTimeZone ||
      browserTimeZone === submittedTimeZoneRef.current
    ) {
      return;
    }

    setDisplayTimeZone(browserTimeZone);
    submittedTimeZoneRef.current = browserTimeZone;
    preferenceFetcher.submit(
      { darkMode, timeZone: browserTimeZone },
      { method: "post", action: "/api/preference", encType: "application/json" },
    );
  }, [darkMode, loaderData.displayTimeZone, preferenceFetcher]);

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
  const pathname = location.pathname;
  const pagePath = `${location.pathname}${location.search}`;
  const analyticsEnabled = loaderData.publicEnv.STAGE === "prod";
  const routeKey = location.key;

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
    trackCurrentGoogleAnalyticsPageView(pagePath);
  }, [analyticsEnabled, pagePath]);

  useEffect(() => {
    void routeKey;
    const scrollableContainer = document.querySelector(".mllg-content-area") as HTMLElement;
    if (scrollableContainer) {
      scrollableContainer.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [routeKey]);

  return (
    <div className="min-h-dvh bg-background text-foreground transition-colors">
      <LoadingBar ref={loadingBarRef} color="#3b82f6" height={3} waitingTime={300} />
      <SignInProvider>
        <div className="flex flex-col lg:flex-row h-dvh">
          <NavigationBar
            currentUsername={currentUsername}
            currentProfileStudentId={currentProfileStudentId}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            upcomingEvent={navigationBarContents.upcomingEvent}
            hasRecentNews={navigationBarContents.hasRecentNews}
            hasOngoingRaid={navigationBarContents.hasOngoingRaid}
            hasUnconsumedCoupons={navigationBarContents.hasUnconsumedCoupons}
            hasUnreadFeedbackReplies={navigationBarContents.hasUnreadFeedbackReplies}
          />
          <div className="mllg-content-area w-full overflow-y-scroll pt-[var(--mobile-header-height)] lg:pt-0">
            <div className="mx-auto w-full max-w-7xl px-4 pt-2 pb-6 transition-all duration-300 ease-out has-[[data-page-max-width=wide]]:max-w-screen-2xl motion-reduce:transition-none md:px-8 lg:min-h-screen lg:py-6">
              <TimeZoneProvider timeZone={displayTimeZone}>
                <StudentCardPopupProvider key={pathname}>
                  <Outlet context={{ darkMode, setDarkMode } satisfies RootOutletContext} />
                </StudentCardPopupProvider>
              </TimeZoneProvider>
              <Footer />
            </div>
          </div>
        </div>
        <SignInBottomSheetHost />
      </SignInProvider>
    </div>
  );
}

function SignInBottomSheetHost() {
  const { isSignInVisible } = useSignIn();

  if (!isSignInVisible) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <SignInBottomSheet />
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
