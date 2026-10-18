import { Link, useLocation, useRouteError } from "react-router";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { normalizeRouteError } from "~/lib/route-error";

export function ContactRouteError() {
  const error = useRouteError();
  const location = useLocation();
  const normalized = normalizeRouteError(error);
  const isContactIndex = location.pathname === "/contact" || location.pathname === "/contact/";
  const destination = isContactIndex ? "/" : "/contact";
  const linkLabel = isContactIndex ? "홈으로 돌아가기" : "제안/문의로 돌아가기";

  return (
    <V2Page width="reading">
      <PageHeader title={normalized.title} />
      <PageMain>
        <section className="rounded-lg bg-v2-surface p-v2-block-p">
          <StatusNotice tone="danger">{normalized.message}</StatusNotice>
          <Link
            to={destination}
            className={`${v2FocusRing} mt-v2-group-gap inline-flex min-h-v2-control-min items-center rounded-md text-sm font-medium text-v2-fg underline underline-offset-4 hover:text-v2-fg-secondary`}
          >
            {linkLabel}
          </Link>
        </section>
      </PageMain>
    </V2Page>
  );
}
