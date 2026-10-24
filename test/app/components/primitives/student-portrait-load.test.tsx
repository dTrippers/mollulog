/** @jest-environment jsdom */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { HaloModeProvider } from "~/contexts/HaloModeContext";
import StudentPortrait from "~/components/primitives/StudentPortrait";
import V2StudentPortrait from "~/components/v2/features/students/StudentPortrait";

afterEach(cleanup);

const portraitRenderers = [
  ["1.x", StudentPortrait],
  ["v2", V2StudentPortrait],
] as const;

function portraitTree(Component: (typeof portraitRenderers)[number][1], uid = "fixture-student") {
  return (
    <HaloModeProvider value={{ haloMode: true, setHaloMode: () => {} }}>
      <Component uid={uid} className="size-12" />
    </HaloModeProvider>
  );
}

function renderPortrait(Component: (typeof portraitRenderers)[number][1], uid?: string) {
  return render(portraitTree(Component, uid));
}

describe.each(portraitRenderers)("%s StudentPortrait image loading", (_version, Component) => {
  it("starts hidden and reveals the pre-blurred image after load", () => {
    const { container } = renderPortrait(Component);
    const image = container.querySelector<HTMLImageElement>("img.absolute.inset-0");

    expect(image).not.toBeNull();
    expect(image?.className).toContain("opacity-0");
    fireEvent.load(image as HTMLImageElement);
    expect(image?.className).toContain("opacity-100");
  });

  it("keeps the neutral frame after image failure and does not fall back", () => {
    const { container } = renderPortrait(Component);
    const frame = container.querySelector("span.relative");
    const image = container.querySelector<HTMLImageElement>("img.absolute.inset-0");

    fireEvent.error(image as HTMLImageElement);
    expect(frame).not.toBeNull();
    expect(frame?.className).toMatch(/bg-(?:muted|v2-inset)/);
    expect(container.querySelector(".halo-contrast-scrim")?.className).toContain("absolute inset-0");
    expect(container.querySelector("img.absolute.inset-0")).toBeNull();
    expect(container.querySelector("img.relative.z-10")).not.toBeNull();
    expect(container.querySelector('img[src*="collection"]')).toBeNull();
  });

  it("resets a successful image when its source changes A to B to A", () => {
    const { container, rerender } = renderPortrait(Component, "fixture-student-a");
    const imageA = container.querySelector<HTMLImageElement>("img.absolute.inset-0")!;
    fireEvent.load(imageA);
    expect(imageA.className).toContain("opacity-100");

    rerender(portraitTree(Component, "fixture-student-b"));
    const imageB = container.querySelector<HTMLImageElement>("img.absolute.inset-0")!;
    expect(imageB.className).toContain("opacity-0");

    rerender(portraitTree(Component, "fixture-student-a"));
    const returnedImageA = container.querySelector<HTMLImageElement>("img.absolute.inset-0");
    expect(returnedImageA).not.toBeNull();
    expect(returnedImageA?.className).toContain("opacity-0");
  });

  it("recreates a failed image when its source changes A to B to A", () => {
    const { container, rerender } = renderPortrait(Component, "fixture-student-a");
    fireEvent.error(container.querySelector("img.absolute.inset-0")!);
    expect(container.querySelector("img.absolute.inset-0")).toBeNull();

    rerender(portraitTree(Component, "fixture-student-b"));
    expect(container.querySelector("img.absolute.inset-0")).not.toBeNull();
    rerender(portraitTree(Component, "fixture-student-a"));

    const returnedImageA = container.querySelector<HTMLImageElement>("img.absolute.inset-0");
    expect(returnedImageA).not.toBeNull();
    expect(returnedImageA?.className).toContain("opacity-0");
  });

  it("reveals an image that completed successfully before hydration", async () => {
    const completeDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    const naturalWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 100 });

    try {
      const { container } = renderPortrait(Component);
      const image = container.querySelector<HTMLImageElement>("img.absolute.inset-0");
      await waitFor(() => expect(image?.className).toContain("opacity-100"));
    } finally {
      if (completeDescriptor) Object.defineProperty(HTMLImageElement.prototype, "complete", completeDescriptor);
      else Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
      if (naturalWidthDescriptor) {
        Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", naturalWidthDescriptor);
      } else {
        Reflect.deleteProperty(HTMLImageElement.prototype, "naturalWidth");
      }
    }
  });
});

describe("1.x StudentPortrait error callback", () => {
  it("keeps concealed failures internal while preserving the halo", () => {
    const onError = jest.fn();
    const { container } = render(
      <HaloModeProvider value={{ haloMode: true, setHaloMode: () => {} }}>
        <StudentPortrait uid="fixture-student" className="size-12" onError={onError} />
      </HaloModeProvider>,
    );

    fireEvent.error(container.querySelector("img.absolute.inset-0")!);

    expect(onError).not.toHaveBeenCalled();
    expect(container.querySelector("img.absolute.inset-0")).toBeNull();
    expect(container.querySelector("img.relative.z-10")).not.toBeNull();
  });

  it("still forwards collection-image failures when halo mode is off", () => {
    const onError = jest.fn();
    const { container } = render(
      <HaloModeProvider value={{ haloMode: false, setHaloMode: () => {} }}>
        <StudentPortrait uid="fixture-student" className="size-12" onError={onError} />
      </HaloModeProvider>,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
