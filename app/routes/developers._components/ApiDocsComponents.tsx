import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";

export function DocsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-v2-surface p-v2-block-p">
      <h4 className="text-base font-semibold">{title}</h4>
      <div className="mt-v2-group-gap space-y-v2-group-gap">{children}</div>
    </section>
  );
}

export function DataTable({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section
      className="w-full overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: A horizontally scrollable table needs keyboard scrolling.
      tabIndex={0}
    >
      <table className="w-full min-w-[34rem] text-left text-sm">{children}</table>
    </section>
  );
}

export function TableHeader({ columns }: { columns: string[] }) {
  return (
    <thead className="text-xs font-semibold text-v2-fg-tertiary">
      <tr>
        {columns.map((column, index) => (
          <th className={`pb-2 pr-3 ${index === 0 ? "sticky left-0 z-10 bg-v2-surface" : ""}`} key={column} scope="col">
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TableCell({
  children,
  className = "",
  firstColumn = false,
}: {
  children: React.ReactNode;
  className?: string;
  firstColumn?: boolean;
}) {
  return (
    <td className={`py-2 pr-3 align-top ${firstColumn ? "sticky left-0 z-10 bg-v2-surface" : ""} ${className}`}>
      {children}
    </td>
  );
}

export function EndpointRow({
  method,
  path,
  summary,
  children,
  initiallyOpen = false,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  return (
    <details open={initiallyOpen} className="group border-b border-v2-divider last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[3.25rem_minmax(0,1fr)_1rem] items-center gap-x-3 rounded-md px-2 py-v2-row-y hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_1rem]">
        <span className="font-mono text-xs font-bold text-v2-fg-tertiary">{method}</span>
        <code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-sm">{path}</code>
        <span className="col-start-2 row-start-2 whitespace-normal text-sm text-v2-fg-secondary sm:col-auto sm:row-auto sm:whitespace-nowrap">
          {summary}
        </span>
        <ChevronDownIcon
          className="col-start-3 row-start-1 size-4 text-v2-fg-tertiary motion-safe:transition-transform motion-safe:duration-v2-base motion-safe:ease-v2-standard group-open:rotate-180 sm:col-auto sm:row-auto"
          aria-hidden="true"
        />
      </summary>
      <div className="mb-2 mt-1 space-y-v2-group-gap rounded-lg bg-v2-inset p-v2-block-p">{children}</div>
    </details>
  );
}

export function CodeBlock({
  children,
  label,
  tone = "inset",
  copyable = false,
}: {
  children: string;
  label?: string;
  tone?: "inset" | "surface";
  copyable?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <div className="min-w-0">
      {label || copyable ? (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {label ? <p className="text-xs font-semibold text-v2-fg-tertiary">{label}</p> : <span />}
          {copyable ? (
            <CopyTextButton
              value={children}
              variant="text"
              accessibleContext={label ?? "코드 예시"}
              onStatusChange={setCopyStatus}
            />
          ) : null}
        </div>
      ) : null}
      <section
        aria-label={label ? `${label} 코드` : "코드 예시"}
        className={`min-w-0 overflow-x-auto rounded-md p-3 text-v2-fg ${tone === "surface" ? "bg-v2-surface" : "bg-v2-inset"}`}
      >
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: A horizontally scrollable code sample needs keyboard scrolling.
          tabIndex={0}
          className="min-w-max whitespace-pre font-mono text-xs leading-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
        >
          {children}
        </pre>
      </section>
      <CopyStatusMessage status={copyStatus} />
    </div>
  );
}
