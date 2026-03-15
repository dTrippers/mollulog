import type { ReactNode } from "react";

type CalloutProps = {
  children: ReactNode | ReactNode[];
  emoji?: string;
  className?: string;
};

export default function Callout({ className, emoji, children }: CalloutProps) {
  return (
    <div className={`${className ?? ""} flex p-4 bg-neutral-100 dark:bg-neutral-900 rounded-lg`}>
      {emoji && <span className="ml-1 mr-2">{emoji}</span>}
      {children}
    </div>
  )
}
