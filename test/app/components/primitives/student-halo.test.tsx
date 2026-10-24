/** @jest-environment jsdom */

import { describe, expect, it } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react";
import StudentHalo from "~/components/primitives/StudentHalo";
import V2StudentHalo from "~/components/v2/features/students/StudentHalo";

const haloRenderers = [
  ["1.x", StudentHalo],
  ["v2", V2StudentHalo],
] as const;

for (const [version, Halo] of haloRenderers) {
  describe(`${version} StudentHalo`, () => {
    it("keeps the scrim present while the halo is hidden, loaded, or failed", () => {
      const { container, unmount } = render(<Halo src="/halo.webp" aboveBand />);
      const image = container.querySelector("img")!;
      const positioningBox = image.parentElement!;
      const scrim = container.querySelector(".halo-contrast-scrim")!;

      expect(image.className).toContain("opacity-0");
      expect(scrim.className).toContain("halo-contrast-scrim");
      expect(scrim.className).toContain("absolute inset-0");
      expect(scrim.className).not.toContain("bottom-4");
      expect(positioningBox.className).toContain("bottom-4");
      expect(scrim.className).not.toMatch(/\btransition/);

      fireEvent.load(image);
      expect(image.className).toContain("opacity-100");
      expect(container.querySelector(".halo-contrast-scrim")?.className).toContain("absolute inset-0");

      unmount();
      const failed = render(<Halo src="/missing-halo.webp" aboveBand />);
      const failedImage = failed.container.querySelector("img")!;
      fireEvent.error(failedImage);

      expect(failedImage.className).toContain("opacity-0");
      expect(failed.container.querySelector('span[aria-hidden="true"]')?.className).toContain(
        "halo-contrast-scrim",
      );
      expect(failed.container.querySelector(".halo-contrast-scrim")?.className).toContain("absolute inset-0");
    });

    it("reveals an image that completed successfully before hydration", () => {
      const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
      const originalNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
      Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 72 });

      try {
        const { container } = render(<Halo src="/cached-halo.webp" aboveBand />);
        const image = container.querySelector("img")!;
        const scrim = container.querySelector(".halo-contrast-scrim")!;
        expect(image.className).toContain("opacity-100");
        expect(scrim.className).toContain("absolute inset-0");
        expect(image.parentElement?.className).toContain("bottom-4");
      } finally {
        if (originalComplete) Object.defineProperty(HTMLImageElement.prototype, "complete", originalComplete);
        else Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
        if (originalNaturalWidth) {
          Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", originalNaturalWidth);
        } else {
          Reflect.deleteProperty(HTMLImageElement.prototype, "naturalWidth");
        }
      }
    });

    it("keeps an already-complete broken image hidden", () => {
      const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
      const originalNaturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
      Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 });

      try {
        const { container } = render(<Halo src="/missing-halo.webp" />);
        const image = container.querySelector("img")!;
        expect(image.className).toContain("opacity-0");
        expect(container.querySelector('span[aria-hidden="true"]')?.className).toContain("halo-contrast-scrim");
      } finally {
        if (originalComplete) Object.defineProperty(HTMLImageElement.prototype, "complete", originalComplete);
        else Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
        if (originalNaturalWidth) {
          Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", originalNaturalWidth);
        } else {
          Reflect.deleteProperty(HTMLImageElement.prototype, "naturalWidth");
        }
      }
    });

    it("resets the reveal state when the source changes", () => {
      const { container, rerender } = render(<Halo src="/first-halo.webp" />);
      const firstImage = container.querySelector("img")!;
      fireEvent.load(firstImage);
      expect(firstImage.className).toContain("opacity-100");

      rerender(<Halo src="/second-halo.webp" />);
      const secondImage = container.querySelector("img")!;
      expect(secondImage.getAttribute("src")).toBe("/second-halo.webp");
      expect(secondImage.className).toContain("opacity-0");
      expect(container.querySelector('span[aria-hidden="true"]')?.className).toContain("halo-contrast-scrim");
    });

    it("does not reuse a loaded reveal after the source changes A to B to A", () => {
      const { container, rerender } = render(<Halo src="/first-halo.webp" />);
      fireEvent.load(container.querySelector("img")!);

      rerender(<Halo src="/second-halo.webp" />);
      expect(container.querySelector("img")?.className).toContain("opacity-0");
      rerender(<Halo src="/first-halo.webp" />);

      expect(container.querySelector("img")?.className).toContain("opacity-0");
    });

    it("retries a failed source after it changes A to B to A", () => {
      const { container, rerender } = render(<Halo src="/first-halo.webp" />);
      fireEvent.error(container.querySelector("img")!);
      expect(container.querySelector("img")?.className).toContain("opacity-0");

      rerender(<Halo src="/second-halo.webp" />);
      rerender(<Halo src="/first-halo.webp" />);

      const returnedImageA = container.querySelector<HTMLImageElement>("img");
      expect(returnedImageA).not.toBeNull();
      expect(returnedImageA?.className).toContain("opacity-0");
    });
  });
}
