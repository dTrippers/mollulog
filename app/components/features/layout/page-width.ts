export type PageWidth = "default" | "wide";

export type PageLayoutHandle = {
  pageWidth?: PageWidth;
};

export function pageWidthClassName(pageWidth: PageWidth) {
  return pageWidth === "wide" ? "max-w-7xl" : "max-w-5xl";
}
