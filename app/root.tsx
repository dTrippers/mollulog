import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useNavigation,
  useLocation,
  Link,
} from "react-router";
import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";
import { ExclamationCircleIcon } from "@heroicons/react/16/solid";
import type { Route } from "./+types/root";
import styles from "./tailwind.css?url";
import { getAuthenticator } from "./auth/authenticator.server";
import { Footer, Sidebar } from "./components/organisms/base";
import { getPreference } from "./auth/preference.server";
import { useEffect, useRef, useState } from "react";
import { SignInProvider } from "./contexts/SignInProvider";
import { SignInBottomSheet } from "./components/molecules/auth";
import { getLatestPostTime } from "./models/post";
import { StudentCardPopupProvider } from "./contexts/StudentCardPopupProvider";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;

  const sensei = await getAuthenticator(env).isAuthenticated(request);
  const preference = await getPreference(env, request);
  const latestNewsTime = await getLatestPostTime(env, "news");

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  return {
    currentUsername: sensei?.username ?? null,
    darkMode: preference.darkMode ?? false,
    hasRecentNews: latestNewsTime ? latestNewsTime > threeDaysAgo : false,
  };
};

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "stylesheet", href: "https://cdnjs.cloudflare.com/ajax/libs/pretendard/1.3.8/static/pretendard.css" },
  { rel: "stylesheet", href: "https://cdn.jsdelivr.net/gh/Nyannnnnng/GyeonggiTitleWoff/stylesheet.css" },
  { rel: "stylesheet", href: styles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0,viewport-fit=cover" />
        <meta name="theme-color" content={loaderData?.darkMode ? "#262626" : "#ffffff"} />
        <meta name="background-color" content={loaderData?.darkMode ? "#262626" : "#ffffff"} />
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

const wideLayout = ["/utils/relationship"];
const fullLayout = ["^/raids", "^/futures", "^/utils/pyroxene", "^/students$", "^/@"];

type Banner = {
  message: string;
  linkText: string;
  linkTo: string;
  storageKey: string;
} | null;

const banner: Banner = null;

export default function App() {
  const loaderData = useLoaderData<typeof loader>();
  const { currentUsername, hasRecentNews } = loaderData;

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

  const location = useLocation();
  useEffect(() => {
    const scrollableContainer = document.querySelector('.mllg-content-area') as HTMLElement;
    if (scrollableContainer) {
      scrollableContainer.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname]);

  let widthClass = "max-w-3xl";
  if (fullLayout.find((path) => location.pathname.match(path))) {
    widthClass = "w-full";
  } else if (wideLayout.find((path) => location.pathname.startsWith(path))) {
    widthClass = "max-w-6xl";
  }

  const [bannerHidden, setBannerHidden] = useState(banner === null);
  useEffect(() => {
    if (banner !== null) {
      setBannerHidden(localStorage.getItem(banner.storageKey) === "true");
    }
  }, [navigate.location]);

  return (
    <div className={`${darkMode ? "dark " : ""}text-neutral-900 dark:bg-neutral-800 dark:text-neutral-200 transition`}>
      <LoadingBar
        ref={loadingBarRef}
        color="#0ea5e9"
        height={3}
        waitingTime={300}
      />
      <SignInProvider>
        <StudentCardPopupProvider>
          <div className="flex flex-col xl:flex-row">
            <div className="fixed xl:relative w-full xl:w-96 xl:h-screen bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-b xl:border-b-0 xl:border-r border-neutral-200 dark:border-neutral-700 shadow-xl shadow-neutral-200/30 dark:shadow-neutral-900/30 z-100">
              <Sidebar
                currentUsername={currentUsername} 
                darkMode={darkMode} 
                setDarkMode={setDarkMode}
                hasRecentNews={hasRecentNews}
                banner={banner}
              />
            </div>
            <div className={`mllg-content-area w-full ${bannerHidden ? "pt-10" : "pt-20"} xl:pt-0 overflow-y-scroll`}>
              <div className={`xl:h-screen mx-auto ${widthClass} px-4 md:px-8 py-6`}>
                <div className="pb-32">
                  <Outlet />
                </div>
                <Footer />
              </div>
            </div>
          </div>
          <SignInBottomSheet />
        </StudentCardPopupProvider>
      </SignInProvider>
    </div>
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
        <Link to="/" className="px-4 py-2 bg-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors">
          첫 화면으로
        </Link>
        <div className="px-4 py-2 bg-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors" onClick={() => window.location.reload()}>
          새로고침
        </div>
      </div>

      <video
        className="my-4 w-full max-w-lg aspect-video"
        src="https://assets.mollulog.net/assets/videos/site/aropla-sorry.mp4"
        autoPlay muted loop
      />

      <p className="mt-4 text-sm">
        <Link to="/contact" className="underline text-blue-300">문의 메일</Link>을 통해 상황을 알려주시면 빠르게 해결할 수 있어요.
      </p>
    </div>
  );
}
