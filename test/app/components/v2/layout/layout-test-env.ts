import { jest } from "@jest/globals";
import { act } from "@testing-library/react";

type ResizeRecord = { callback: ResizeObserverCallback; targets: Element[] };
type IntersectionRecord = { callback: IntersectionObserverCallback; targets: Element[] };

const resizeObservers = new Set<ResizeRecord>();
const intersectionObservers = new Set<IntersectionRecord>();
// Like a browser, a new ResizeObserver reports the current size once. The default is side-by-side.
let currentLayoutWidth = 1024;

class ResizeObserverStub {
  private record: ResizeRecord;

  constructor(callback: ResizeObserverCallback) {
    this.record = { callback, targets: [] };
  }

  observe(target: Element) {
    this.record.targets.push(target);
    resizeObservers.add(this.record);
    const entry = { target, contentRect: { width: currentLayoutWidth } } as unknown as ResizeObserverEntry;
    // Runs inside the render's act scope, so the update flushes with the mount.
    this.record.callback([entry], {} as ResizeObserver);
  }

  unobserve() {}

  disconnect() {
    resizeObservers.delete(this.record);
  }
}

class IntersectionObserverStub {
  private record: IntersectionRecord;

  constructor(callback: IntersectionObserverCallback) {
    this.record = { callback, targets: [] };
  }

  observe(target: Element) {
    this.record.targets.push(target);
    intersectionObservers.add(this.record);
  }

  unobserve() {}

  disconnect() {
    intersectionObservers.delete(this.record);
  }
}

function layoutRect(): DOMRect {
  return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}) } as DOMRect;
}

// Installs the browser APIs that jsdom lacks. Call from beforeEach.
export function installLayoutTestEnv() {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub, IntersectionObserver: IntersectionObserverStub });
  Element.prototype.scrollTo = jest.fn() as unknown as Element["scrollTo"];
  Element.prototype.scrollIntoView = jest.fn() as unknown as Element["scrollIntoView"];
  // jsdom reports an all-zero rect for every element. Headless UI treats that as a removed element and closes the
  // dialog, so give elements a real size. Tests that need a specific position stub it themselves.
  // The V2Page root reports the layout width, as the ResizeObserver stub does, so the first measurement matches later ones.
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.hasAttribute("data-v2-layout")) {
      return { ...layoutRect(), width: currentLayoutWidth, right: currentLayoutWidth } as DOMRect;
    }
    return layoutRect();
  };
  // Headless UI polyfills getAnimations with a warning. A stub with no running animations makes transitions finish at once.
  Element.prototype.getAnimations = () => [];
  resizeObservers.clear();
  intersectionObservers.clear();
  currentLayoutWidth = 1024;
}

// Reports a container content width to every observed V2Page root. 1024 is side-by-side, 390 is stacked.
export function setLayoutWidth(width: number) {
  currentLayoutWidth = width;
  for (const record of resizeObservers) {
    for (const target of record.targets) {
      const entry = { target, contentRect: { width } } as unknown as ResizeObserverEntry;
      act(() => record.callback([entry], {} as ResizeObserver));
    }
  }
}

// Reports whether the observed sentinel is inside the scroll area. false means the toolbar is pinned.
export function setSentinelIntersecting(isIntersecting: boolean) {
  for (const record of intersectionObservers) {
    for (const target of record.targets) {
      const entry = { target, isIntersecting } as unknown as IntersectionObserverEntry;
      act(() => record.callback([entry], {} as IntersectionObserver));
    }
  }
}
