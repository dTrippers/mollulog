import type { ElementType, ReactNode } from "react";

/** A centered state of a connect screen: an empty list, a missing draft, a failed load. */
export function ConnectStateMessage({
  Icon,
  title,
  description,
  action,
  role = "status",
}: {
  Icon: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-v2-inset">
        <Icon className="size-5 text-v2-fg-secondary" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold text-v2-fg">{title}</p>
        {description ? <p className="mt-1 whitespace-pre-line text-sm text-v2-fg-tertiary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
