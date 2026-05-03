import { Suspense, lazy, useEffect, useRef, useState } from "react";
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
import { SignInProvider } from "./contexts/SignInProvider";
import { useSignIn } from "./contexts/SignInProvider";
import { StudentCardPopupProvider } from "./contexts/StudentCardPopupProvider";
import { TimeZoneProvider } from "./contexts/TimeZoneProvider";
import { DEFAULT_TIME_ZONE, getBrowserTimeZone, normalizeTimeZone } from "./lib/date-time";
import { isServerRouteError, normalizeRouteError } from "./lib/route-error";
import { getNavigationBarContents } from "./models/content";
import styles from "./tailwind.css?url";

const SignInBottomSheet = lazy(() => import("./components/features/auth/SignInBottomSheet"));
const themeConfig = {
  dark: {
    backgroundColor: "#262626",
  },
  light: {
    backgroundColor: "#ffffff",
  },
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env as Env & {
    FRONT_BETTER_STACK_SENTRY_DSN?: string;
  };

  const sensei = await getActiveSensei(env, request);
  const preference = await getPreference(env, request);

  const navigationBarContents = await getNavigationBarContents(env);
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
  };
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
        <meta name="mollulog:stage" content={loaderData?.publicEnv.STAGE ?? "local"} />
        <meta
          name="mollulog:front-better-stack-sentry-dsn"
          content={loaderData?.publicEnv.FRONT_BETTER_STACK_SENTRY_DSN ?? ""}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
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
  const routeKey = location.key;
  useEffect(() => {
    void routeKey;
    const scrollableContainer = document.querySelector(".mllg-content-area") as HTMLElement;
    if (scrollableContainer) {
      scrollableContainer.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [routeKey]);

  return (
    <div className="text-neutral-900 transition dark:bg-neutral-800 dark:text-neutral-200">
      <LoadingBar ref={loadingBarRef} color="#0ea5e9" height={3} waitingTime={300} />
      <SignInProvider>
        <div className="flex flex-col lg:flex-row h-dvh">
          <NavigationBar
            currentUsername={currentUsername}
            currentProfileStudentId={currentProfileStudentId}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            upcomingEvent={navigationBarContents.upcomingEvent}
            hasRecentNews={navigationBarContents.hasRecentNews}
            hasActiveCoupons={navigationBarContents.hasActiveCoupons}
          />
          <div className="mllg-content-area w-full overflow-y-scroll pt-[var(--mobile-header-height)] lg:pt-0">
            <div className="lg:h-screen mx-auto w-full px-4 md:px-8 pt-2 pb-6 lg:py-6">
              <div>
                <TimeZoneProvider timeZone={displayTimeZone}>
                  <StudentCardPopupProvider key={pathname}>
                    <Outlet />
                  </StudentCardPopupProvider>
                </TimeZoneProvider>
                <Footer />
              </div>
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

  if (!isServerRouteError(normalized)) {
    return (
      <div className="min-h-dvh w-screen bg-white text-neutral-950 dark:bg-neutral-900 dark:text-neutral-100 flex items-center justify-center px-4">
        <ErrorPage status={normalized.status} title={normalized.title} message={normalized.message} />
      </div>
    );
  }

  return <ServerErrorPage status={normalized.status} title={normalized.title} message={normalized.message} />;
}
