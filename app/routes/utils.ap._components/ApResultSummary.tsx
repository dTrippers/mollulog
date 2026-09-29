import { BoltIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";

type Props =
  | { kind: "required"; requiredAp: number }
  | { kind: "result"; resultAp: number; message?: string | null }
  | { kind: "error" | "loading-error" | "pending"; message?: string | null };

function formatAp(value: number) {
  return Math.abs(value).toLocaleString();
}

export default function ApResultSummary(props: Props) {
  const { kind } = props;
  if (kind === "error") {
    return (
      <p className="flex min-w-0 items-start gap-2 break-keep text-sm text-amber-700 dark:text-amber-300">
        <ExclamationTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>계산할 수 없어요. {props.message}</span>
      </p>
    );
  }
  if (kind === "pending") {
    return <p className="break-keep text-sm text-muted-foreground">{props.message}</p>;
  }
  if (kind === "loading-error") {
    return (
      <div className="space-y-1 break-keep">
        <p className="text-xl font-bold text-destructive">불러오지 못했어요</p>
        {props.message ? <p className="text-sm text-muted-foreground">{props.message}</p> : null}
      </div>
    );
  }

  if (kind === "required") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-5 place-items-center rounded-sm bg-green-700/10 text-green-800 dark:bg-green-400/15 dark:text-green-300">
          <BoltIcon aria-hidden="true" className="size-3" />
        </span>
        <p className="text-2xl font-bold tabular-nums">{formatAp(props.requiredAp)} AP</p>
        <p className="text-sm text-muted-foreground">필요</p>
      </div>
    );
  }

  if (props.kind === "result") {
    const result = props.resultAp;
    const isShort = result < 0;
    return (
      <div className="space-y-1 break-keep">
        <p
          className={`text-2xl font-bold tabular-nums md:text-2xl ${isShort ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}
        >
          {props.message ? `${props.message} ` : ""}
          {formatAp(result)} AP {isShort ? "부족" : "여유"}
        </p>
      </div>
    );
  }
  return null;
}
