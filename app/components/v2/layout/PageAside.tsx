import type { ReactNode } from "react";

// Omit this component to render no Aside column. Side-by-side layout is CSS-only (see :has(> .v2-aside) in tailwind.css).
export function PageAside({ children }: { children: ReactNode }) {
  return (
    <aside aria-label="보조 도구" className="v2-aside">
      {children}
    </aside>
  );
}
