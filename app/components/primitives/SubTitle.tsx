import type { ReactNode } from "react";

export default function SubTitle({
  text,
  description,
  aside,
}: {
  text: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="space-y-1 pt-6 pb-3 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-lg font-semibold text-foreground">{text}</h2>
        {aside}
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}
