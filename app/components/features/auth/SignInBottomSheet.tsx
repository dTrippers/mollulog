import { startAuthentication } from "@simplewebauthn/browser";
// @ts-ignore
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server/script/deps";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigation, useSubmit } from "react-router";
import { Button } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";

export default function SignInBottomSheet() {
  const navigation = useNavigation();
  const location = useLocation();
  const authFormAction = navigation.formAction;
  const isAuthSubmitting = authFormAction === "/auth/google/signin" || authFormAction === "/auth/passkey/signin";
  const buttonDisabled = authFormAction !== undefined;
  const hasStartedAuthRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const submit = useSubmit();

  const { isSignInVisible, hideSignIn } = useSignIn();
  const redirectToCookie = `redirectTo=${encodeURIComponent(location.pathname + location.search)}; path=/; max-age=300;`;

  useEffect(() => {
    if (isAuthSubmitting) {
      hasStartedAuthRef.current = true;
      return;
    }

    if (navigation.state === "idle" && hasStartedAuthRef.current) {
      hasStartedAuthRef.current = false;
      hideSignIn();
    }
  }, [hideSignIn, isAuthSubmitting, navigation.state]);

  if (!isSignInVisible) {
    return null;
  }

  const signInWithGoogle = () => {
    document.cookie = redirectToCookie;
    submit({}, { action: "/auth/google/signin", method: "post", encType: "application/json" });
  };

  const signInWithPasskey = async () => {
    if (!navigator.credentials) {
      setError("Passkey 조회에 실패했어요. 다른 방법으로 로그인해주세요.");
      return;
    }

    const authenticationOptions = await (
      await fetch("/auth/passkey/signin")
    ).json<PublicKeyCredentialRequestOptionsJSON>();
    let authenticationResponse: Awaited<ReturnType<typeof startAuthentication>>;
    try {
      authenticationResponse = await startAuthentication({ optionsJSON: authenticationOptions });
    } catch (e) {
      console.error(e);
      setError("Passkey 조회에 실패했어요. 다른 방법으로 로그인해주세요.");
      return;
    }

    document.cookie = redirectToCookie;
    submit(JSON.stringify(authenticationResponse), {
      action: "/auth/passkey/signin",
      method: "post",
      encType: "application/json",
    });
  };

  return (
    <>
      <button
        type="button"
        className="w-screen h-full min-h-screen top-0 left-0 fixed bg-black opacity-50 z-100"
        onClick={hideSignIn}
        aria-label="로그인 창 닫기"
      />
      <div className="fixed bottom-0 w-full md:max-w-3xl mx-auto left-1/2 -translate-x-1/2 p-4 md:p-8 bg-white dark:bg-neutral-800 z-200 rounded-t-2xl">
        <p className="mt-4 mb-4 md:mb-8 text-2xl md:text-4xl font-black">로그인</p>
        {error && <p className="my-4 text-sm md:text-base text-red-500">{error}</p>}
        <div className="space-y-3">
          <Button
            className="w-full py-2 cursor-pointer"
            type="submit"
            color="primary"
            onClick={signInWithGoogle}
            disabled={buttonDisabled}
          >
            <p>Google 계정으로 로그인</p>
          </Button>
          <Button
            className="w-full py-2 cursor-pointer"
            type="button"
            color="black"
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
