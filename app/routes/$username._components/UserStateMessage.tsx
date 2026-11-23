import type { ElementType } from "react";

// A whole-screen state of a profile screen: private, unknown, or not found.
export function UserStateMessage({ Icon, title, description }: { Icon: ElementType; title: string; description?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-v2-inset">
        <Icon className="size-5 text-v2-fg-secondary" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold text-v2-fg">{title}</p>
        {description ? <p className="mt-1 text-sm text-v2-fg-tertiary">{description}</p> : null}
      </div>
    </div>
  );
}
