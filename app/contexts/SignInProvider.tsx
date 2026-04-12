import { createContext, useCallback, useContext, useMemo, useState } from "react";

type SignInContextType = {
  isSignInVisible: boolean;
  showSignIn: () => void;
  hideSignIn: () => void;
};

const SignInContext = createContext<SignInContextType>({
  isSignInVisible: false,
  showSignIn: () => {},
  hideSignIn: () => {},
});

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const [isSignInVisible, setIsSignInVisible] = useState(false);

  const showSignIn = useCallback(() => setIsSignInVisible(true), []);
  const hideSignIn = useCallback(() => setIsSignInVisible(false), []);

  const value = useMemo(
    () => ({ isSignInVisible, showSignIn, hideSignIn }),
    [isSignInVisible, showSignIn, hideSignIn],
  );

  return <SignInContext.Provider value={value}>{children}</SignInContext.Provider>;
}

export function useSignIn() {
  return useContext(SignInContext);
}
