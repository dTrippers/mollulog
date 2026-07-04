import "./lib/dayjs";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { initializeClientObservability } from "./lib/observability.client";

initializeClientObservability();

const STALE_CHUNK_RELOAD_KEY = "mllg:stale-chunk-reloaded";
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) {
    return;
  }
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
  window.location.reload();
});
window.addEventListener("load", () => {
  sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
