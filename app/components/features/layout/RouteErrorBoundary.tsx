import { useRouteError } from "react-router";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import ErrorPage from "./ErrorPage";
import ServerErrorPage from "./ServerErrorPage";

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const normalized = normalizeRouteError(error);

  if (isServerRouteError(normalized)) {
    return (
      <ServerErrorPage
        status={normalized.status}
        title={normalized.title}
        message={normalized.message}
      />
    );
  }

  return (
    <ErrorPage
      status={normalized.status}
      title={normalized.title}
      message={normalized.message}
    />
  );
}
