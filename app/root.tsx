import { ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";
import type { Route } from "./+types/root";
import { getAuthenticator } from "./auth/authenticator.server";
import { getPreference } from "./auth/preference.server";
import { Footer, NavigationBar } from "./components/features/layout";
import { SignInProvider } from "./contexts/SignInProvider";
import { useSignIn } from "./contexts/SignInProvider";
import { StudentCardPopupProvider } from "./contexts/StudentCardPopupProvider";
import { getNavigationBarContents } from "./models/content";
import styles from "./tailwind.css?url";

const SignInBottomSheet = lazy(() => import("./components/features/auth/SignInBottomSheet"));

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env as Env & {
    FRONT_BETTER_STACK_SENTRY_DSN?: string;
  };

  const sensei = await getAuthenticator(env).isAuthenticated(request);
  const preference = await getPreference(env, request);

  const navigationBarContents = await getNavigationBarContents(env);
  return {
    currentUsername: sensei?.username ?? null,
    darkMode: preference.darkMode ?? false,
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
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0,viewport-fit=cover"
        />
        <meta name="theme-color" content={loaderData?.darkMode ? "#262626" : "#ffffff"} />
        <meta name="background-color" content={loaderData?.darkMode ? "#262626" : "#ffffff"} />
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
  const { currentUsername, navigationBarContents } = loaderData;

  const [darkMode, setDarkMode] = useState(loaderData.darkMode);
  const loadingBarRef = useRef<LoadingBarRef>(null);

  const navigate = useNavigation();
  useEffect(() => {
    if (navigate.state === "loading") {
      loadingBarRef.current?.continuousStart();
    } else {
      loadingBarRef.current?.complete();
    }
  }, [navigate.state]);

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
    <div className={`${darkMode ? "dark " : ""}text-neutral-900 dark:bg-neutral-800 dark:text-neutral-200 transition`}>
      <LoadingBar ref={loadingBarRef} color="#0ea5e9" height={3} waitingTime={300} />
      <SignInProvider>
        <div className="flex flex-col xl:flex-row h-dvh">
          <NavigationBar
            currentUsername={currentUsername}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            upcomingEvent={navigationBarContents.upcomingEvent}
            hasRecentNews={navigationBarContents.hasRecentNews}
            hasActiveCoupons={navigationBarContents.hasActiveCoupons}
          />
          <div className="mllg-content-area w-full pt-10 xl:pt-0 overflow-y-scroll">
            <div className="xl:h-screen mx-auto w-full px-4 md:px-8 py-6">
              <div className="pb-32">
                <StudentCardPopupProvider key={pathname}>
                  <Outlet />
                </StudentCardPopupProvider>
              </div>
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
  const message = error instanceof Error ? error.message : "알 수 없는 오류";

  return (
    <div className="bg-neutral-900 text-neutral-200 min-h-dvh w-screen flex flex-col items-center justify-center">
      <ExclamationCircleIcon className="size-16" />
      <p className="my-2 text-2xl font-bold">알 수 없는 오류가 발생했어요</p>
      <p className="text-sm">{message}</p>

      <div className="my-4 flex gap-2">
        <Link
          to="/"
          className="px-4 py-2 bg-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors"
        >
          첫 화면으로
        </Link>
        <button
          type="button"
          className="px-4 py-2 bg-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors"
          onClick={() => window.location.reload()}
        >
          새로고침
        </button>
      </div>

      <video
        className="my-4 w-full max-w-lg aspect-video"
        src="https://assets.mollulog.net/assets/videos/site/aropla-sorry.mp4"
        autoPlay
        muted
        loop
      />

      <p className="mt-4 text-sm">
        <Link to="/contact" className="underline text-blue-300">
          문의 메일
        </Link>
        을 통해 상황을 알려주시면 빠르게 해결할 수 있어요.
      </p>
    </div>
  );
}
