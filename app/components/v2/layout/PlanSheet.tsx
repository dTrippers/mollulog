import type { ElementType, ReactNode } from "react";
import { Sheet } from "../primitives/Sheet";
import { useV2Page } from "./V2Page";

export const PLAN_SHEET_PANEL_ID = "plan";

// A section without a title has no header row, for a control that the sheet's own title already names.
type PlanSheetSection = {
  key: string;
  content: ReactNode;
} & ({ title: string; Icon: ElementType; headerAction?: ReactNode } | { title?: undefined });

// The stacked layout opens the Aside panels together in one sheet from a single bar button. The desktop Aside keeps its
// own panels; CSS hides them on stacked, so the sheet shows each body only once on screen.
export function PlanSheet({
  title,
  Icon,
  sections,
}: {
  title: string;
  Icon: ElementType;
  sections: PlanSheetSection[];
}) {
  const { stacked, sheetPanelId, closeSheet, onSheetExited } = useV2Page();

  return (
    <Sheet
      open={stacked && sheetPanelId === PLAN_SHEET_PANEL_ID}
      title={title}
      Icon={Icon}
      panelId={PLAN_SHEET_PANEL_ID}
      onClose={closeSheet}
      onExited={onSheetExited}
    >
      <div className="flex flex-col divide-y divide-v2-divider">
        {sections.map((section) => (
          <section key={section.key} aria-label={section.title} className="py-4 text-sm first:pt-1">
            {section.title !== undefined ? (
              <div className="mb-3 flex min-h-8 items-center gap-2">
                <h3 className="flex min-w-0 flex-1 items-center gap-3 pl-1 text-sm font-semibold text-v2-fg">
                  <section.Icon className="size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
                  {section.title}
                </h3>
                {section.headerAction ? <div className="shrink-0">{section.headerAction}</div> : null}
              </div>
            ) : null}
            {section.content}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
