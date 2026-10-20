import { Fragment, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";
import { PageMain } from "~/components/v2/layout/PageMain";
import { API_GUIDE_COPY, getApiEndpointGuide } from "~/domain/mollulog-api-guide";
import {
  API_PUBLIC_ERRORS,
  API_READ_ROUTE_GROUP,
  API_ROUTES,
  API_STUDENT_STATE_FIELD_SPECS,
  API_WRITE_ROUTE_GROUP,
  type ApiPublicErrorCode,
  type ApiRouteSpec,
  formatApiCurlCommand,
  formatApiErrorExampleJson,
  resolveApiDocumentUrls,
} from "~/domain/mollulog-api-spec";
import {
  CodeBlock,
  DataTable,
  DocsSection,
  EndpointRow,
  TableCell,
  TableHeader,
} from "./developers._components/ApiDocsComponents";

export const meta: MetaFunction = () => [{ title: "API 문서 | 몰루로그" }];

export function loader({ request }: LoaderFunctionArgs) {
  return {
    urls: resolveApiDocumentUrls("api.mollulog.net", request.url),
    siteHost: "https://mollulog.net",
  };
}

export default function DevelopersDocs() {
  const { urls, siteHost } = useLoaderData<typeof loader>();
  const [baseUrlCopyStatus, setBaseUrlCopyStatus] = useState<CopyStatus>("idle");
  const [authCopyStatus, setAuthCopyStatus] = useState<CopyStatus>("idle");

  const prompt = API_GUIDE_COPY.agentPromptTemplate.replace("{llmsUrl}", urls.llmsUrl);
  const documentUrls = {
    llmsFull: urls.llmsFullUrl,
    llms: urls.llmsUrl,
    openApi: urls.openApiUrl,
  };
  const errorExample = formatApiErrorExampleJson({
    error: {
      ...API_GUIDE_COPY.errorExample,
      docs: `${siteHost.replace(/\/+$/, "")}/developers/docs#error-${API_GUIDE_COPY.errorExample.code}`,
    },
  });

  return (
    <PageMain>
      <div className="space-y-v2-block-gap">
        <header>
          <h2 className="mb-v2-group-gap text-lg font-semibold">{API_GUIDE_COPY.pageTitle}</h2>
        </header>

        <DocsSection title={API_GUIDE_COPY.sections.agent}>
          <AgentPromptBlock label={API_GUIDE_COPY.agentPromptLabel} prompt={prompt} />
          <dl className="grid grid-cols-1 items-start gap-x-4 gap-y-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
            {API_GUIDE_COPY.documentLinks.map((documentLink) => (
              <DocumentUrlRow
                key={documentLink.key}
                label={documentLink.label}
                url={documentUrls[documentLink.key]}
                copyLabel={documentLink.copyLabel}
              />
            ))}
          </dl>
        </DocsSection>

        <DocsSection title={API_GUIDE_COPY.sections.connection}>
          <dl className="grid grid-cols-1 items-start gap-x-4 gap-y-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="text-v2-fg-secondary sm:pt-1.5">{API_GUIDE_COPY.connection.baseUrl}</dt>
            <dd className="min-w-0">
              <div className="flex min-w-0 items-start justify-between gap-2 font-mono text-sm">
                <code className="min-w-0 break-all pt-1.5">{urls.baseUrl}</code>
                <CopyTextButton
                  value={urls.baseUrl}
                  variant="icon"
                  label={API_GUIDE_COPY.connection.baseUrlCopyLabel}
                  onStatusChange={setBaseUrlCopyStatus}
                />
              </div>
              <CopyStatusMessage status={baseUrlCopyStatus} />
            </dd>
            <dt className="text-v2-fg-secondary sm:pt-1.5">{API_GUIDE_COPY.connection.authorization}</dt>
            <dd>
              <div className="flex items-start justify-between gap-2">
                <code className="break-all pt-1.5">{API_GUIDE_COPY.connection.authorizationValue}</code>
                <CopyTextButton
                  value={API_GUIDE_COPY.connection.authorizationValue}
                  variant="icon"
                  label={API_GUIDE_COPY.connection.authorizationCopyLabel}
                  onStatusChange={setAuthCopyStatus}
                />
              </div>
              <CopyStatusMessage status={authCopyStatus} />
            </dd>
          </dl>
        </DocsSection>

        <DocsSection title={API_GUIDE_COPY.sections.endpoints}>
          <EndpointGroup title={API_READ_ROUTE_GROUP.title}>
            {API_ROUTES.filter((route) => route.permission === API_READ_ROUTE_GROUP.permission).map((route, index) => (
              <ApiEndpoint key={route.id} route={route} baseUrl={urls.baseUrl} initiallyOpen={index === 0} />
            ))}
          </EndpointGroup>
          <EndpointGroup title={API_WRITE_ROUTE_GROUP.title}>
            {API_ROUTES.filter((route) => route.permission === API_WRITE_ROUTE_GROUP.permission).map((route) => (
              <ApiEndpoint key={route.id} route={route} baseUrl={urls.baseUrl} />
            ))}
          </EndpointGroup>
        </DocsSection>

        <DocsSection title={API_GUIDE_COPY.sections.fields}>
          <DataTable label={API_GUIDE_COPY.sections.fields}>
            <TableHeader columns={[...API_GUIDE_COPY.fieldTable.columns]} />
            <tbody>
              {API_GUIDE_COPY.fieldGroups.map((group) => {
                const firstField =
                  API_STUDENT_STATE_FIELD_SPECS[group.fields[0] as keyof typeof API_STUDENT_STATE_FIELD_SPECS];
                return (
                  <tr className="border-t border-v2-divider" key={group.fields[0]}>
                    <TableCell firstColumn>
                      {group.fields.map((field) => (
                        <code className="block whitespace-nowrap font-mono text-sm" key={field}>
                          {field}
                        </code>
                      ))}
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap">{group.meaning}</span>
                      {"detail" in group ? (
                        <span className="block text-xs text-v2-fg-secondary">{group.detail}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatFieldRange(firstField.min, firstField.max)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-v2-fg-secondary">
                      {firstField.nullable
                        ? API_GUIDE_COPY.fieldTable.nullAllowed
                        : API_GUIDE_COPY.fieldTable.nullForbidden}
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <ul className="space-y-2 text-sm">
            {API_GUIDE_COPY.pageFieldRules.map((rule) => (
              <RuleItem key={rule}>{rule}</RuleItem>
            ))}
          </ul>
        </DocsSection>

        <DocsSection title={API_GUIDE_COPY.sections.errors}>
          <ApiErrorTable />
          <CodeBlock label={API_GUIDE_COPY.errorExampleLabel} copyable>
            {errorExample}
          </CodeBlock>
        </DocsSection>

        <DocsSection title={API_GUIDE_COPY.sections.limits}>
          <dl className="grid grid-cols-1 items-start gap-x-4 gap-y-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
            {API_GUIDE_COPY.pageLimits.map(({ label, value }) => (
              <LimitRow key={label} label={label} value={value} />
            ))}
          </dl>
        </DocsSection>
      </div>
    </PageMain>
  );
}

function AgentPromptBlock({ label, prompt }: { label: string; prompt: string }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-v2-fg-tertiary">{label}</p>
        <CopyTextButton
          value={prompt}
          label="복사하기"
          accessibleContext={label}
          variant="text"
          onStatusChange={setCopyStatus}
        />
      </div>
      <p className="rounded-md bg-v2-inset p-3 text-sm leading-6 whitespace-pre-wrap break-keep">
        {renderPrompt(prompt)}
      </p>
      <CopyStatusMessage status={copyStatus} />
    </div>
  );
}

function renderPrompt(prompt: string) {
  const urlStart = prompt.indexOf("https://");
  const urlEnd = prompt.indexOf(" ", urlStart);
  if (urlStart < 0 || urlEnd < 0) return prompt;
  const before = prompt.slice(0, urlStart);
  const url = prompt.slice(urlStart, urlEnd);
  const after = prompt.slice(urlEnd);
  return (
    <>
      {before}
      <SlashBreakUrl url={url} />
      {after}
    </>
  );
}

function DocumentUrlRow({ label, url, copyLabel }: { label: string; url: string; copyLabel: string }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  return (
    <>
      <dt className="text-v2-fg-secondary sm:pt-1.5">{label}</dt>
      <dd className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <a
            className="min-w-0 break-keep pt-1.5 text-v2-link underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <code className="break-keep">
              <SlashBreakUrl url={url} />
            </code>
          </a>
          <CopyTextButton value={url} variant="icon" label={copyLabel} onStatusChange={setCopyStatus} />
        </div>
        <CopyStatusMessage status={copyStatus} />
      </dd>
    </>
  );
}

function SlashBreakUrl({ url }: { url: string }) {
  const parts = url.split("/");
  let prefix = "";
  const segments = parts.map((part) => {
    prefix = prefix ? `${prefix}/${part}` : part;
    return { key: prefix, part };
  });
  return (
    <>
      {segments.map(({ key, part }, index) => (
        <Fragment key={key}>
          <span className="whitespace-nowrap">
            {part}
            {index < parts.length - 1 ? "/" : null}
          </span>
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}

function ApiEndpoint({
  route,
  baseUrl,
  initiallyOpen = false,
}: {
  route: (typeof API_ROUTES)[number];
  baseUrl: string;
  initiallyOpen?: boolean;
}) {
  const guide = getApiEndpointGuide(route.id);
  const curl = formatApiCurlCommand(baseUrl, route);
  const responseJson = JSON.stringify(route.responseExample.body);
  return (
    <EndpointRow method={route.method} path={route.displayPath} summary={route.summary} initiallyOpen={initiallyOpen}>
      {route.parameters.length > 0 ? <ParameterTable route={route} /> : null}
      {"required" in guide ? <p className="text-sm">{guide.required}</p> : null}
      <CodeBlock label={API_GUIDE_COPY.requestExampleLabel} tone="surface" copyable>
        {curl}
      </CodeBlock>
      {"response" in guide ? (
        <p className="text-sm text-v2-fg-secondary">
          {API_GUIDE_COPY.responseLabel}: {guide.response}
        </p>
      ) : (
        <CodeBlock label={`${API_GUIDE_COPY.responseLabel} ${route.responseExample.status}`} tone="surface">
          {responseJson}
        </CodeBlock>
      )}
      {"note" in guide && "error" in guide ? (
        <p className="text-sm text-v2-fg-secondary">
          {guide.note} <EndpointErrorLink code={guide.error} />
        </p>
      ) : null}
      {"readPermission" in guide && "error" in guide ? (
        <p className="text-sm text-v2-fg-secondary">
          {guide.readPermission} · 이미 등록한 학생이면 <EndpointErrorLink code={guide.error} />
        </p>
      ) : null}
      {"note" in guide && !("error" in guide) ? <p className="text-sm text-v2-fg-secondary">{guide.note}</p> : null}
    </EndpointRow>
  );
}

function ParameterTable({ route }: { route: ApiRouteSpec }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold text-v2-fg-tertiary">
          <th className="pb-1 pr-3" scope="col">
            {API_GUIDE_COPY.parameterTable.name}
          </th>
          <th className="pb-1" scope="col">
            {API_GUIDE_COPY.parameterTable.description}
          </th>
        </tr>
      </thead>
      <tbody>
        {route.parameters.map((parameter) => (
          <tr key={parameter.name}>
            <td className="py-1 pr-3 align-top">
              <code className="font-mono">{parameter.name}</code>
            </td>
            <td className="py-1 align-top">{parameter.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EndpointErrorLink({ code }: { code: ApiPublicErrorCode }) {
  const error = API_PUBLIC_ERRORS[code];
  return (
    <a
      className="whitespace-nowrap text-v2-link underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      href={`#error-${code}`}
    >
      <code>
        {error.status} {code}
      </code>
    </a>
  );
}

function ApiErrorTable() {
  const groups = new Map<number, Array<[ApiPublicErrorCode, (typeof API_PUBLIC_ERRORS)[ApiPublicErrorCode]]>>();
  for (const code of Object.keys(API_PUBLIC_ERRORS) as ApiPublicErrorCode[]) {
    const error = API_PUBLIC_ERRORS[code];
    const group = groups.get(error.status) ?? [];
    group.push([code, error]);
    groups.set(error.status, group);
  }

  return (
    <table className="w-full text-left text-sm" aria-label={API_GUIDE_COPY.sections.errors}>
      <TableHeader columns={["상태", "코드 · 의미"]} />
      {Array.from(groups.entries()).map(([status, errors]) => (
        <tbody className="border-t border-v2-divider" key={status}>
          {errors.map(([code, error], rowIndex) => (
            <tr
              className="scroll-mt-[calc(var(--mobile-header-height)+4.5rem)] target:bg-v2-inset @min-[48rem]/page-available:scroll-mt-4"
              id={`error-${code}`}
              key={code}
            >
              {rowIndex === 0 ? (
                <th
                  className="w-14 py-2 align-top whitespace-nowrap font-semibold"
                  rowSpan={errors.length}
                  scope="rowgroup"
                >
                  <code>{status}</code>
                </th>
              ) : null}
              <td className="py-2 pr-3 align-top break-keep">
                <code className="block font-mono text-sm font-medium">{renderBreakableCode(code)}</code>
                <span className="font-medium">{error.title}</span>
                <span className="text-v2-fg-secondary"> · {error.description}</span>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function renderBreakableCode(code: string) {
  const parts = code.split("_");
  let prefix = "";
  return parts.map((part, index) => {
    prefix = prefix ? `${prefix}_${part}` : part;
    return (
      <span key={prefix}>
        {index > 0 ? "_" : null}
        {index > 0 ? <wbr /> : null}
        {part}
      </span>
    );
  });
}

function EndpointGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="mb-1 text-xs font-semibold text-v2-fg-tertiary">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="leading-7 text-v2-fg-secondary">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function RuleItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true">·</span>
      <span>{children}</span>
    </li>
  );
}

function formatFieldRange(min: number, max: number) {
  return `${min.toLocaleString("ko-KR")}–${max.toLocaleString("ko-KR")}`;
}
