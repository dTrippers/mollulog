import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const bottomSheetSource = readFileSync("app/components/primitives/BottomSheet.tsx", "utf8");

describe("BottomSheet accessibility and optional layout contract", () => {
  it("delegates modal semantics, keyboard focus trapping, escape-to-close, and focus restore to headlessui's Dialog", () => {
    expect(bottomSheetSource).toContain('from "@headlessui/react"');
    expect(bottomSheetSource).toMatch(/import\s*{[^}]*\bDialog\b[^}]*}\s*from\s*"@headlessui\/react"/);
    expect(bottomSheetSource).toMatch(/import\s*{[^}]*\bDialogPanel\b[^}]*}\s*from\s*"@headlessui\/react"/);
    expect(bottomSheetSource).toMatch(/import\s*{[^}]*\bDialogTitle\b[^}]*}\s*from\s*"@headlessui\/react"/);
    // Dialog itself owns role="dialog"/aria-modal, the focus trap, and Escape → onClose.
    expect(bottomSheetSource).toContain("<Dialog onClose={onClose}");
    // DialogTitle inside Dialog is what supplies the accessible name (no manual aria-labelledby).
    expect(bottomSheetSource).not.toContain("aria-labelledby");
    expect(bottomSheetSource).not.toContain('role="dialog"');
  });

  it("keeps the panel addressable by id and its title script-focusable for the planner's own view-transition focus management", () => {
    // id lands on the panel so callers like the integrated planner can query it
    // (e.g. document.getElementById(id)) to move focus between the sheet's internal views.
    expect(bottomSheetSource).toContain("<DialogPanel");
    expect(bottomSheetSource).toContain("id={id}");
    // tabIndex={-1} keeps the title out of the tab order but still focusable via script.
    expect(bottomSheetSource).toMatch(/<DialogTitle[^>]*tabIndex=\{-1\}/);
  });

  it("keeps icon, content sizing, and footer optional", () => {
    expect(bottomSheetSource).toContain("Icon?: React.ElementType");
    expect(bottomSheetSource).toContain("fitContent?: boolean");
    expect(bottomSheetSource).toContain("footer?: React.ReactNode");
    expect(bottomSheetSource).toContain("max-h-[85dvh]");
    expect(bottomSheetSource).toContain("{footer ?");
    expect(bottomSheetSource).toContain("overflow-y-auto overscroll-contain no-scrollbar");
  });
});
