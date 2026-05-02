import type { ComponentProps } from "react";
import { useRouteError } from "react-router";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import ErrorPage from "./ErrorPage";
import Page from "./Page";
import ServerErrorPage from "./ServerErrorPage";

type PageRouteErrorBoundaryProps = Omit<ComponentProps<typeof Page>, "children">;

function NormalizedRouteErrorView({ page }: { page?: PageRouteErrorBoundaryProps }) {
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

  const errorPage = (
    <ErrorPage
      status={normalized.status}
      title={normalized.title}
      message={normalized.message}
    />
  );

  if (page) {
    return <Page {...page}>{errorPage}</Page>;
  }

  return errorPage;
}

export function createPageErrorBoundary(page: PageRouteErrorBoundaryProps) {
  return function PageRouteErrorBoundary() {
    return <NormalizedRouteErrorView page={page} />;
  };
}

export default function RouteErrorBoundary() {
  return <NormalizedRouteErrorView />;
}
