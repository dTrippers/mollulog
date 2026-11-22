import type { ReactNode } from "react";

export type PageAsideProps = {
  // "extra-wide" shows the Aside only from 96rem of page-available width, for a screen whose main column needs the
  // width more, such as a wide data table. Below that the page is one column, as without an Aside, and the screen
  // places the Aside's links elsewhere (the header's trailing block and the MobileActionBar).
  revealAt?: "side-by-side" | "extra-wide";
  children: ReactNode;
};

// Omit this component to render no Aside column. Side-by-side layout is CSS-only (see :has(> .v2-aside) in tailwind.css).
export function PageAside({ revealAt = "side-by-side", children }: PageAsideProps) {
  return (
    <aside
      aria-label="보조 도구"
      className="v2-aside"
      data-reveal={revealAt === "extra-wide" ? "extra-wide" : undefined}
    >
      {children}
    </aside>
  );
}
