import "./lib/dayjs";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { captureClientError, initializeClientObservability } from "./lib/observability.client";

initializeClientObservability();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter
        onError={(error, errorInfo) => {
          captureClientError(error, {
            componentStack: errorInfo.errorInfo?.componentStack,
            location: errorInfo.location.pathname,
            params: errorInfo.params,
            pattern: errorInfo.unstable_pattern,
            source: "hydrated-router",
            url: window.location.href,
          });
        }}
      />
    </StrictMode>,
  );
});
