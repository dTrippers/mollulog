/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { cn } from "~/lib/utils";

// 2.0 layout composes v2 tokens through cn. tailwind-merge must keep the size and token classes side by side.
describe("cn with 2.0 token classes", () => {
  it("keeps a font size next to a v2 text color", () => {
    expect(cn("text-sm", "text-v2-fg")).toBe("text-sm text-v2-fg");
    expect(cn("text-v2-fg", "text-sm")).toBe("text-v2-fg text-sm");
    expect(cn("text-xs tabular-nums", "text-v2-fg-tertiary")).toBe("text-xs tabular-nums text-v2-fg-tertiary");
  });

  it("keeps spacing and size tokens that do not conflict", () => {
    expect(cn("px-v2-row-x py-v2-row-y")).toBe("px-v2-row-x py-v2-row-y");
    expect(cn("gap-v2-block-gap gap-x-v2-column-gap")).toBe("gap-v2-block-gap gap-x-v2-column-gap");
    expect(cn("min-h-v2-row-min min-h-12")).toBe("min-h-v2-row-min min-h-12");
  });

  it("merges only a true same-group conflict and keeps the later class", () => {
    expect(cn("bg-v2-surface", "bg-v2-canvas")).toBe("bg-v2-canvas");
    expect(cn("text-v2-fg-secondary", "text-v2-fg-disabled")).toBe("text-v2-fg-disabled");
  });

  it("keeps motion utilities with v2 tokens", () => {
    expect(cn("duration-v2-base ease-v2-enter motion-safe:transition-transform")).toBe(
      "duration-v2-base ease-v2-enter motion-safe:transition-transform",
    );
  });
});
