import type { ElementType, ReactNode } from "react";
import { useV2Page } from "../../layout/V2Page";
import { Sheet } from "../../primitives/Sheet";

export const PLAN_SHEET_PANEL_ID = "plan";

type PlanSheetSection = {
  key: string;
  title: string;
  Icon: ElementType;
  headerAction?: ReactNode;
  content: ReactNode;
};

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
        {sections.map(({ key, title: sectionTitle, Icon: SectionIcon, headerAction, content }) => (
          <section key={key} aria-label={sectionTitle} className="py-4 text-sm first:pt-1">
            <div className="mb-3 flex min-h-8 items-center gap-2">
              <h3 className="flex min-w-0 flex-1 items-center gap-3 pl-1 text-sm font-semibold text-v2-fg">
                <SectionIcon className="size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
                {sectionTitle}
              </h3>
              {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
            </div>
            {content}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
