import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { useEffect, useRef, useState } from "react";
import { useFetcher, useLocation, useRouteLoaderData } from "react-router";
import { Button } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";

type RootLoaderData = { currentUsername: string | null };

export default function SignInBottomSheet() {
  const location = useLocation();
  const fetcher = useFetcher<{ error?: string }>();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const currentUsername = rootData?.currentUsername ?? null;

  const { isSignInVisible, hideSignIn } = useSignIn();
  const [clientError, setClientError] = useState<string | null>(null);

  const prevUsernameRef = useRef(currentUsername);
  useEffect(() => {
    if (prevUsernameRef.current === null && currentUsername !== null) {
      hideSignIn();
    }
    prevUsernameRef.current = currentUsername;
  }, [currentUsername, hideSignIn]);

  if (!isSignInVisible) {
    return null;
  }

  const isSubmitting = fetcher.state !== "idle";
  const buttonDisabled = isSubmitting;
  const serverError = fetcher.data?.error ?? null;
  const displayError = clientError ?? serverError;

  const redirectToCookie = `redirectTo=${encodeURIComponent(location.pathname + location.search)}; path=/; max-age=300;`;

  const signInWithGoogle = () => {
    setClientError(null);
    document.cookie = redirectToCookie;
    fetcher.submit({}, { action: "/auth/google/signin", method: "post", encType: "application/json" });
  };

  const signInWithGithub = () => {
    setClientError(null);
    document.cookie = redirectToCookie;
    fetcher.submit({}, { action: "/auth/github/signin", method: "post", encType: "application/json" });
  };

  const signInWithPasskey = async () => {
    setClientError(null);
    if (!navigator.credentials) {
      setClientError("이 브라우저에서는 Passkey를 사용할 수 없어요. 다른 방법으로 로그인해주세요.");
      return;
    }

    let authenticationResponse: Awaited<ReturnType<typeof startAuthentication>>;
    try {
      const res = await fetch("/auth/passkey/signin");
      if (!res.ok) throw new Error(`status=${res.status}`);
      const authenticationOptions = await res.json<PublicKeyCredentialRequestOptionsJSON>();
      authenticationResponse = await startAuthentication({ optionsJSON: authenticationOptions });
    } catch {
      setClientError("Passkey 조회에 실패했어요. 다른 방법으로 로그인해주세요.");
      return;
    }

    document.cookie = redirectToCookie;
    fetcher.submit(JSON.stringify(authenticationResponse), {
      action: "/auth/passkey/signin",
      method: "post",
      encType: "application/json",
    });
  };

  return (
    <>
      <button
        type="button"
        className="w-screen h-full min-h-screen top-0 left-0 fixed bg-black opacity-50 z-layer-backdrop"
        onClick={hideSignIn}
        aria-label="로그인 창 닫기"
      />
      <div className="fixed bottom-0 w-full md:max-w-3xl mx-auto left-1/2 -translate-x-1/2 p-4 md:p-8 bg-white dark:bg-neutral-800 z-layer-modal rounded-t-2xl">
        <p className="mt-4 mb-4 md:mb-8 text-2xl md:text-4xl font-black">로그인</p>
        {displayError && <p className="my-4 text-sm md:text-base text-red-500">{displayError}</p>}
        <div className="space-y-3">
          <Button
            className="w-full py-2 cursor-pointer"
            type="submit"
            variant="primary"
            onClick={signInWithGoogle}
            disabled={buttonDisabled}
          >
            <p>Google 계정으로 로그인</p>
          </Button>
          <Button
            className="w-full py-2 cursor-pointer"
            type="button"
            variant="inverse"
            onClick={signInWithGithub}
            disabled={buttonDisabled}
          >
            <p>GitHub 계정으로 로그인</p>
          </Button>
          <Button
            className="w-full py-2 cursor-pointer"
            type="button"
            variant="inverse"
            onClick={signInWithPasskey}
            disabled={buttonDisabled}
          >
            <p>Passkey로 로그인</p>
          </Button>
        </div>
        <p className="my-4 text-sm text-neutral-500 text-center">로그인 후 학생 정보, 미래시 계획을 관리해보세요.</p>
      </div>
    </>
  );
}
