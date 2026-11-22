import { useRouteError } from "react-router";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { normalizeRouteError } from "~/lib/route-error";

// The error page of the 공략/타임라인 screens: the route's public message, a way back to the list, and a reload.
export function WalkthroughRouteError() {
  const error = useRouteError();
  const normalized = normalizeRouteError(error);
  return (
    <V2Page width="reading">
      <PageHeader back={{ title: "공략/타임라인", to: "/timelines" }} title={normalized.title} />
      <PageMain>
        <section className="flex flex-col gap-v2-group-gap rounded-lg bg-v2-surface p-v2-block-p">
          <StatusNotice tone="danger">{normalized.message}</StatusNotice>
          <div>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              새로고침
            </Button>
          </div>
        </section>
      </PageMain>
    </V2Page>
  );
}
