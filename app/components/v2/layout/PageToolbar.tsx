import { type ReactNode, useEffect, useRef, useState } from "react";
import { useV2Page } from "./V2Page";

export type PageToolbarProps = {
  children: ReactNode;
  // Data tables keep the toolbar pinned on desktop too. Mobile is always pinned.
  stickyOnDesktop?: boolean;
  // A responsive navigation toolbar belongs only in stacked layouts.
  stackedOnly?: boolean;
};

export function PageToolbar({ children, stickyOnDesktop = false, stackedOnly = false }: PageToolbarProps) {
  useV2Page();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // Content that sticks inside the page offsets itself by --v2-toolbar-sticky-height, the toolbar's height while it can
  // pin (0 otherwise), so it settles below the toolbar instead of under it.
  useEffect(() => {
    const toolbar = toolbarRef.current;
    const layout = toolbar?.closest<HTMLElement>("[data-v2-layout]");
    if (!toolbar || !layout || typeof ResizeObserver === "undefined") {
      return;
    }
    const update = () => {
      const pinnable = getComputedStyle(toolbar).position === "sticky";
      layout.style.setProperty("--v2-toolbar-sticky-height", pinnable ? `${toolbar.offsetHeight}px` : "0px");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => {
      observer.disconnect();
      layout.style.removeProperty("--v2-toolbar-sticky-height");
    };
  }, []);

  // The sentinel sits at the toolbar's natural position in the same grid cell. It leaves the scroll area once the
  // toolbar pins, which marks the stuck state.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }
    const scrollContainer = document.querySelector<HTMLElement>(".mllg-content-area");
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      root: scrollContainer ?? null,
      threshold: 1,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="v2-toolbar-sentinel"
        data-stacked-only={stackedOnly ? "true" : undefined}
      />
      {/* Pinned, the toolbar floats over the content scrolling under it, so it turns translucent with a backdrop blur. */}
      <div
        ref={toolbarRef}
        className="v2-toolbar min-w-0 bg-v2-canvas data-[sticky=true]:bg-v2-canvas/94 data-[sticky=true]:backdrop-blur-md"
        data-sticky={stuck ? "true" : "false"}
        data-sticky-desktop={stickyOnDesktop ? "true" : undefined}
        data-stacked-only={stackedOnly ? "true" : undefined}
      >
        {children}
      </div>
    </>
  );
}
