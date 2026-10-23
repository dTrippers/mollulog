import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Squares2X2Icon } from "@heroicons/react/24/outline";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { PageMain } from "~/components/v2/layout/PageMain";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import { getDeveloperScopeSummary } from "~/domain/mollulog-api-spec";
import { getOAuthApplications } from "~/models/mollulog-oauth";
import { requireOAuthAppManager } from "./developers._components/requireOAuthAppManager";

export const meta: MetaFunction = () => [{ title: "애플리케이션 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const access = await requireOAuthAppManager(env, request, ctx);
  if (access instanceof Response) return access;

  try {
    const applications = await getOAuthApplications(env, access, { ctx });
    return data(
      {
        applications: applications.map(({ uid, name, scopes }) => ({ uid, name, scopes })),
        loadError: false,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("[developers/applications] failed to load OAuth applications", error);
    return data({ applications: [], loadError: true }, { headers: privateHeaders });
  }
}

export default function DeveloperApplications() {
  const { applications, loadError } = useLoaderData<typeof loader>();

  return (
    <PageMain>
      <div className="@container space-y-v2-block-gap">
        <header className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">애플리케이션</h2>
          <Link
            to="/developers/applications/new"
            className={v2ButtonClassName({ variant: "primary", className: "disabled:bg-v2-inset" })}
            {...getV2LinkTransitionProps("crossfade")}
          >
            새 애플리케이션
          </Link>
        </header>
        {loadError ? (
          <p role="alert" className="text-sm text-v2-danger">
            애플리케이션 목록을 불러오지 못했어요.
          </p>
        ) : applications.length === 0 ? (
            <section className="flex flex-col items-center justify-center gap-3 rounded-lg bg-v2-surface px-v2-block-p py-8 text-center">
            <Squares2X2Icon aria-hidden="true" className="size-8 text-v2-fg-tertiary" />
            <h3 className="text-base font-semibold">애플리케이션이 없어요</h3>
          </section>
        ) : (
          <nav aria-label="내 애플리케이션">
            <ul className="overflow-hidden rounded-lg bg-v2-surface">
              {applications.map((application) => (
                <li key={application.uid}>
                  <Link
                    to={`/developers/applications/${application.uid}`}
                    className="flex min-h-v2-row-min min-w-0 items-center gap-3 px-4 py-3 text-v2-fg transition-colors hover:bg-v2-filled-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                    {...getV2LinkTransitionProps("crossfade")}
                  >
                    <Squares2X2Icon aria-hidden="true" className="size-4 shrink-0 text-v2-fg-tertiary" />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="min-w-0 flex-[1_1_auto] break-words">{application.name}</span>
                      <span className="ml-auto max-w-full shrink-0 break-words text-right text-sm text-v2-fg-tertiary">
                        {getDeveloperScopeSummary(application.scopes)}
                      </span>
                    </span>
                    <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-v2-fg-tertiary" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </PageMain>
  );
}
