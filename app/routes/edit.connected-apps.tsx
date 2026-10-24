import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { getUserScopeSummary } from "~/domain/mollulog-api-spec";
import { formatInstant } from "~/lib/date-time";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { disconnectOAuthGrant, getOAuthConnections, type OAuthConnection } from "~/models/mollulog-oauth";

export const meta: MetaFunction = () => [{ title: "연결된 애플리케이션 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

type ConnectionView = Omit<OAuthConnection, "connectedAt" | "lastUsedAt"> & {
  connectedAt: string;
  lastUsedAt: string | null;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized", { headers: privateHeaders });

  try {
    const connections = await getOAuthConnections(env, sensei.id, { ctx });
    return data(
      { connections: connections.map(toConnectionView), loadError: false },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("[edit/connected-apps] failed to load OAuth connections", sanitizeErrorForLogging(error));
    return data({ connections: [] as ConnectionView[], loadError: true }, { headers: privateHeaders });
  }
}

type ConnectedAppsActionData = { error?: string };

export async function action({ context, request }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized", { headers: privateHeaders });

  const form = await request.formData();
  if (form.get("intent") !== "disconnect") {
    return data<ConnectedAppsActionData>(
      { error: "요청을 확인할 수 없어요." },
      { status: 400, headers: privateHeaders },
    );
  }
  const grantId = Number(form.get("grantId"));
  if (!Number.isSafeInteger(grantId) || grantId <= 0) {
    return data<ConnectedAppsActionData>(
      { error: "연결된 애플리케이션을 찾지 못했어요." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const disconnected = await disconnectOAuthGrant(env, sensei.id, grantId, { ctx });
    if (!disconnected) {
      return data<ConnectedAppsActionData>(
        { error: "해제할 수 있는 연결을 찾지 못했어요." },
        { status: 404, headers: privateHeaders },
      );
    }
    return redirect("/edit/connected-apps", { headers: privateHeaders });
  } catch (error) {
    console.error("[edit/connected-apps] failed to disconnect OAuth connection", sanitizeErrorForLogging(error));
    return data<ConnectedAppsActionData>(
      { error: "연결을 해제하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500, headers: privateHeaders },
    );
  }
}

function toConnectionView(connection: OAuthConnection): ConnectionView {
  return {
    ...connection,
    connectedAt: connection.connectedAt.toISOString(),
    lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
  };
}

export default function ConnectedApps() {
  const { connections, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <V2Page width="wide">
      <PageHeader title="연결된 애플리케이션" back={{ title: "프로필 관리", to: "/edit" }} />
      <PageMain>
        <div className="@container space-y-v2-group-gap">
          {loadError ? (
            <StatusNotice tone="danger">연결된 애플리케이션을 불러오지 못했어요.</StatusNotice>
          ) : connections.length === 0 ? (
            <section className="flex flex-col items-center justify-center gap-3 rounded-lg bg-v2-surface px-v2-block-p py-8 text-center">
              <Squares2X2Icon aria-hidden="true" className="size-8 text-v2-fg-tertiary" />
              <h2 className="text-base font-semibold">연결된 애플리케이션이 없어요</h2>
            </section>
          ) : (
            <>
              {actionData?.error ? <StatusNotice tone="danger">{actionData.error}</StatusNotice> : null}
              <ul className="overflow-hidden rounded-lg bg-v2-surface">
                {connections.map((connection) => (
                  <ConnectedAppRow key={connection.id} connection={connection} />
                ))}
              </ul>
            </>
          )}
        </div>
      </PageMain>
    </V2Page>
  );
}

function ConnectedAppRow({ connection }: { connection: ConnectionView }) {
  const triggerId = `connected-app-disconnect-${connection.id}`;
  const displayTimeZone = useDisplayTimeZone();
  const confirmationRef = useRef<HTMLFieldSetElement>(null);
  const restoreTriggerFocusRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const userScopeSummary = getUserScopeSummary(connection.scopes);

  useEffect(() => {
    if (confirming) {
      confirmationRef.current?.focus();
    } else if (restoreTriggerFocusRef.current) {
      document.getElementById(triggerId)?.focus();
      restoreTriggerFocusRef.current = false;
    }
  }, [confirming, triggerId]);

  function cancelConfirmation() {
    restoreTriggerFocusRef.current = true;
    setConfirming(false);
  }

  return (
    <li className="p-v2-block-p">
      <article className="min-w-0">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
          <Squares2X2Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-v2-fg-tertiary" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="break-words text-base font-semibold">{connection.applicationName}</h2>
            <p className="break-words text-sm text-v2-fg-secondary">{userScopeSummary}</p>
            <p className="break-words text-xs text-v2-fg-tertiary tabular-nums">
              {formatInstant(connection.connectedAt, { timeZone: displayTimeZone })} 연결 · {connection.lastUsedAt ? `마지막 사용 ${formatInstant(connection.lastUsedAt, { timeZone: displayTimeZone })}` : "아직 사용하지 않음"}
            </p>
          </div>
          <Button
            id={triggerId}
            type="button"
            size="sm"
            variant="danger"
            disabled={isSubmitting || confirming}
            onClick={() => setConfirming(true)}
          >
            <span className="sr-only">{connection.applicationName} </span>
            연결 해제
          </Button>
        </div>
        {confirming ? (
          <fieldset ref={confirmationRef} tabIndex={-1} className="mt-v2-group-gap space-y-4 rounded-md bg-v2-inset p-4">
            <legend className="sr-only">{`${connection.applicationName} 연결 해제 확인`}</legend>
            <p className="break-keep text-sm">{connection.applicationName}에서 내 데이터에 더 이상 접근할 수 없어요.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="text" disabled={isSubmitting} onClick={cancelConfirmation}>
                취소
              </Button>
              <Form method="post">
                <input type="hidden" name="intent" value="disconnect" />
                <input type="hidden" name="grantId" value={connection.id} />
                <Button type="submit" variant="danger" disabled={isSubmitting}>
                  {isSubmitting ? "해제 중..." : "해제"}
                </Button>
              </Form>
            </div>
          </fieldset>
        ) : null}
      </article>
    </li>
  );
}
