import type { ElementType, ReactNode } from "react";
import { cn } from "~/lib/utils";

type CalloutTone = "default" | "info" | "success" | "warning" | "destructive";

type CalloutProps = {
  children?: ReactNode | ReactNode[];
  emoji?: string;
  title?: string;
  description?: ReactNode;
  Icon?: ElementType;
  tone?: CalloutTone;
  className?: string;
};

export default function Callout({
  className,
  emoji,
  children,
  title,
  description,
  Icon,
  tone = "default",
}: CalloutProps) {
  const toneClass = {
    default: "border-border bg-muted/40 text-foreground",
    info: "border-primary/20 bg-primary/5 text-foreground",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive",
  }[tone];

  const structured = title || description || Icon;

  return (
    <div className={cn("rounded-xl border p-4", toneClass, className)}>
      {structured ? (
        <div className="flex items-start gap-3">
          {Icon ? <Icon className="mt-0.5 size-5 shrink-0" /> : emoji ? <span className="text-base">{emoji}</span> : null}
          <div className="min-w-0 space-y-1">
            {title ? <p className="font-semibold">{title}</p> : null}
            {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
            {children ? <div className="text-sm">{children}</div> : null}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          {emoji ? <span className="text-base">{emoji}</span> : null}
          <div className="text-sm">{children}</div>
        </div>
      )}
    </div>
  );
}
