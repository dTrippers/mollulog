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
    default: "bg-muted/50 text-foreground",
    info: "bg-primary/10 text-foreground",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];

  const structured = title || description || Icon;

  return (
    <div className={cn("rounded-lg p-4", toneClass, className)}>
      {structured ? (
        <div className="flex items-start gap-3">
          {Icon ? (
            <Icon className="mt-0.5 size-5 shrink-0" />
          ) : emoji ? (
            <span className="text-base">{emoji}</span>
          ) : null}
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
