/** @jest-environment jsdom */

import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import HaloModeNotice from "~/components/media/HaloModeNotice";

describe("HaloModeNotice", () => {
  it("keeps the full-frame layer click-through while the chip keeps its tooltip target", () => {
    const { container } = render(<HaloModeNotice />);
    const layer = container.querySelector(".halo-mode-notice-container");
    const chip = screen.getByTitle("헤일로 모드가 켜져있어요");

    expect(layer?.className).toContain("pointer-events-none");
    expect(chip.className).toContain("pointer-events-auto");
  });
});
