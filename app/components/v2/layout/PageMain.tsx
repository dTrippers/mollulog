import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { useV2Page } from "./V2Page";

export function PageMain({ children }: { children: ReactNode }) {
  const { width } = useV2Page();
  return <div className={cn("v2-main min-w-0", width === "reading" && "max-w-3xl")}>{children}</div>;
}
