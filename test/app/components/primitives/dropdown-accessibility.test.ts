import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const dropdownSource = readFileSync("app/components/primitives/Dropdown.tsx", "utf8");

describe("Dropdown accessibility contract", () => {
  it("keeps the menu-radio keyboard and focus recovery behavior", () => {
    expect(dropdownSource).toContain('aria-haspopup="menu"');
    expect(dropdownSource).toContain('role="menu"');
    expect(dropdownSource).toContain('role="menuitemradio"');
    expect(dropdownSource).toContain("aria-labelledby={controlId}");
    expect(dropdownSource).toContain('event.key === "ArrowDown"');
    expect(dropdownSource).toContain('event.key === "ArrowUp"');
    expect(dropdownSource).toContain('event.key === "Home"');
    expect(dropdownSource).toContain('event.key === "End"');
    expect(dropdownSource).toContain('event.key === "Tab"');
    expect(dropdownSource).toContain('event.key === "Escape"');
    expect(dropdownSource).toContain("window.setTimeout(() => setIsOpen(false), 0)");
    expect(dropdownSource).toContain("focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30");
    expect(dropdownSource).toContain("optionRefs.current[nextIndex]?.focus()");
    expect(dropdownSource).toContain("triggerRef.current?.focus()");
    expect(dropdownSource).toContain("tabIndex={index === activeIndex ? 0 : -1}");
    expect(dropdownSource).toContain("const menuOpen = isOpen && !disabled");
    expect(dropdownSource).toContain("if (disabled && isOpen)");
  });
});
