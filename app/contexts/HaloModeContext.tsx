import { createContext, useContext } from "react";

type HaloModeContextValue = {
  haloMode: boolean;
  setHaloMode: (value: boolean) => void;
};

const HaloModeContext = createContext<HaloModeContextValue>({
  haloMode: false,
  setHaloMode: () => {},
});

export const HaloModeProvider = HaloModeContext.Provider;

export function useHaloMode() {
  return useContext(HaloModeContext);
}
