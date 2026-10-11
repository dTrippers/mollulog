import {
  BookOpenIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CommandLineIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import Page from "~/components/features/layout/Page";
import type { PageScreenSelectorItemProps } from "~/components/features/layout/PageScreenSelector";
import { Button } from "~/components/primitives";

const developerScreens: PageScreenSelectorItemProps[] = [
  { text: "소개", Icon: CommandLineIcon, link: "/developers" },
  { text: "API 문서", Icon: BookOpenIcon, link: "/developers/docs" },
  { text: "API 키", Icon: KeyIcon, link: "/developers/keys" },
];

export function DeveloperPage({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const screens = developerScreens.map((screen) => ({
    ...screen,
    active: location.pathname === screen.link,
  }));

  return (
    <Page
      title="몰루로그 API"
      screens={screens}
      links={[
        {
          title: "데이터 변경 이력",
          shortTitle: "변경 이력",
          description: "API로 변경한 데이터를 확인해요.",
          Icon: ClockIcon,
          to: "/data-history?filter=api",
        },
      ]}
      maxWidth="wide"
      contentWidth="full"
    >
      <div className="space-y-6">{children}</div>
    </Page>
  );
}

export type CopyStatus = "idle" | "copied" | "failed";

type CopyTextButtonProps = {
  value: string;
  label?: string;
  accessibleContext?: string;
  variant?: "icon" | "text";
  buttonVariant?: "primary" | "secondary";
  className?: string;
  onStatusChange: (status: CopyStatus) => void;
};

export function CopyTextButton({
  value,
  label = "복사하기",
  accessibleContext,
  variant = "text",
  buttonVariant = "secondary",
  className = "",
  onStatusChange,
}: CopyTextButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateStatus = (next: CopyStatus) => {
    setStatus(next);
    onStatusChange(next);
  };

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      updateStatus("copied");
      resetTimer.current = setTimeout(() => updateStatus("idle"), 1800);
    } catch {
      updateStatus("failed");
    }
  }

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      {variant === "icon" ? (
        <Button
          type="button"
          variant="default"
          size="xs"
          className={`border-0 bg-transparent p-1 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/30 ${className}`}
          onClick={copy}
        >
          <span className="sr-only">{accessibleContext ? `${accessibleContext} ` : ""}</span>
          {status === "copied" ? (
            <CheckCircleIcon className="size-4" aria-hidden="true" />
          ) : (
            <ClipboardDocumentIcon className="size-4" aria-hidden="true" />
          )}
          <span className="sr-only">{status === "copied" ? "복사됐어요" : label}</span>
        </Button>
      ) : (
        <Button type="button" variant={buttonVariant} size="sm" onClick={copy}>
          {accessibleContext ? <span className="sr-only">{accessibleContext} </span> : null}
          {status === "copied" ? (
            <>
              <CheckCircleIcon className="size-4" aria-hidden="true" /> 복사됨
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="size-4" aria-hidden="true" /> {label}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function CopyStatusMessage({ status }: { status: CopyStatus }) {
  return status === "failed" ? (
    <p aria-live="polite" className="mt-1 break-keep text-xs text-muted-foreground">
      복사하지 못했어요. 텍스트를 직접 선택해 복사해주세요.
    </p>
  ) : (
    <span aria-live="polite" className="sr-only">
      {status === "copied" ? "복사됐어요" : ""}
    </span>
  );
}

export function formatDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

export function DataTable({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section
      className="w-full overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
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
    <thead className="text-xs font-semibold text-muted-foreground">
      <tr>
        {columns.map((column, index) => (
          <th className={`pb-2 pr-3 ${index === 0 ? "sticky left-0 z-10 bg-card" : ""}`} key={column} scope="col">
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
    <td className={`py-2 pr-3 align-top ${firstColumn ? "sticky left-0 z-10 bg-card" : ""} ${className}`}>
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
    <details open={initiallyOpen} className="group border-b border-border last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[3.25rem_minmax(0,1fr)_1rem] items-center gap-x-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_1rem]">
        <span className="font-mono text-xs font-bold text-muted-foreground">{method}</span>
        <code className="min-w-0 overflow-x-auto font-mono text-sm">{path}</code>
        <span className="col-start-2 row-start-2 whitespace-normal text-sm text-muted-foreground sm:col-auto sm:row-auto sm:whitespace-nowrap">
          {summary}
        </span>
        <ChevronDownIcon
          className="col-start-3 row-start-1 size-4 text-muted-foreground transition-transform group-open:rotate-180 sm:col-auto sm:row-auto"
          aria-hidden="true"
        />
      </summary>
      <div className="mb-2 mt-1 space-y-4 rounded-md bg-muted p-4">{children}</div>
    </details>
  );
}

export function CodeBlock({
  children,
  label,
  tone = "muted",
  copyable = false,
}: {
  children: string;
  label?: string;
  tone?: "muted" | "card";
  copyable?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <div className="min-w-0">
      {label || copyable ? (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {label ? <p className="text-xs font-semibold text-muted-foreground">{label}</p> : <span />}
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
        className={`min-w-0 overflow-x-auto rounded-md p-3 text-foreground ${tone === "card" ? "bg-card" : "bg-muted"}`}
      >
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: A horizontally scrollable code sample needs keyboard scrolling.
          tabIndex={0}
          className="min-w-max whitespace-pre font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {children}
        </pre>
      </section>
      <CopyStatusMessage status={copyStatus} />
    </div>
  );
}
