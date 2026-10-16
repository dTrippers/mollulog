// jsdom lacks matchMedia. The composer reads "(pointer: coarse)" to decide whether to show the keyboard shortcut hint.
export function stubCoarsePointer(coarse: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === "(pointer: coarse)" ? coarse : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}
