import { expect, it, jest } from "@jest/globals";

type TestElement = { type: unknown; props: Record<string, unknown> };

const mockHookState = new Map<string, unknown[]>();
const mockEffects = new Map<string, Array<() => void>>();
let mockOwner = "parent";
let mockHookIndex = 0;
const mockCachedImage = { complete: true, naturalWidth: 128 } as HTMLImageElement;
let mockHaloMode = false;
const TIMELINE_IMAGE_BLURHASH = "YEB:Ny3VWp-pA==|A==|@BEla|rxSMrxN]w5dxeqfQeqfQeqfQeq_LF_a|t7SMt7N]xa";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void) => {
      mockEffects.set(mockOwner, [...(mockEffects.get(mockOwner) ?? []), effect]);
    },
    useRef: () => ({ current: mockCachedImage }),
    useState: (initialValue: unknown) => {
      const owner = mockOwner;
      const index = mockHookIndex++;
      const state = mockHookState.get(owner) ?? [];
      if (!(index in state)) state[index] = initialValue;
      mockHookState.set(owner, state);
      return [
        state[index],
        (nextValue: unknown) => {
          state[index] = typeof nextValue === "function" ? (nextValue as (value: unknown) => unknown)(state[index]) : nextValue;
        },
      ];
    },
  };
});

jest.mock("~/contexts/HaloModeContext", () => ({
  useHaloMode: () => ({ haloMode: mockHaloMode, setHaloMode: jest.fn() }),
}));

import PlannerEventThumbnail from "~/components/features/planner/PlannerEventThumbnail";

function findImageComponent(node: unknown): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findImageComponent(child);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as TestElement;
  if (element.props.imageUrl === "/cached.jpg" && typeof element.props.onImageLoaded === "function") return element;
  return findImageComponent(element.props.children);
}

function hasSurface(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasSurface);
  if (!node || typeof node !== "object" || !("props" in node)) return false;
  const element = node as TestElement;
  if (element.props["aria-hidden"] === true && String(element.props.className).includes("bg-muted")) return true;
  return hasSurface(element.props.children);
}

function findComponent(node: unknown, name: string): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findComponent(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as TestElement;
  if (typeof element.type === "function" && element.type.name === name) return element;
  return findComponent(element.props.children, name);
}

it("hides the AP icon surface when the image is already complete at mount", () => {
  mockHaloMode = false;
  mockHookState.clear();
  mockEffects.clear();
  mockOwner = "parent";
  mockHookIndex = 0;
  const props = {
    imageUrl: "/cached.jpg",
    showSurfaceUntilLoaded: true,
    recoverPreloadedFailure: true,
  };

  const initialTree = PlannerEventThumbnail(props) as unknown as TestElement;
  const imageComponent = findImageComponent(initialTree.props.children);
  expect(imageComponent).not.toBeNull();

  mockOwner = "child";
  mockHookIndex = 0;
  const imageTree = (imageComponent!.type as (props: Record<string, unknown>) => unknown)(imageComponent!.props);
  void imageTree;
  for (const effect of mockEffects.get("child") ?? []) effect();
  // React runs child mount effects before parent mount effects.
  for (const effect of mockEffects.get("parent") ?? []) effect();

  mockOwner = "parent";
  mockHookIndex = 0;
  const loadedTree = PlannerEventThumbnail(props) as unknown as TestElement;

  expect(hasSurface(loadedTree.props.children)).toBe(false);
});

it("uses a blurhash for timeline images in halo mode, while keeping catalog images", () => {
  mockHookState.clear();
  mockEffects.clear();
  mockOwner = "parent";
  mockHookIndex = 0;
  mockHaloMode = true;

  const timelineTree = PlannerEventThumbnail({
    imageUrl: "/timeline.jpg",
    imageBlurhash: TIMELINE_IMAGE_BLURHASH,
    imageIsTimeline: true,
  }) as unknown as TestElement;
  expect(findComponent(timelineTree.props.children, "BlurhashPlaceholder")).not.toBeNull();
  expect(findComponent(timelineTree.props.children, "PlannerEventThumbnailImage")).toBeNull();
  expect(findComponent(timelineTree.props.children, "HaloModeNotice")?.props.className).toBe("p-0");

  mockHookState.clear();
  mockEffects.clear();
  mockOwner = "parent";
  mockHookIndex = 0;
  const catalogTree = PlannerEventThumbnail({
    imageUrl: "/catalog.jpg",
    imageIsTimeline: false,
  }) as unknown as TestElement;
  expect(findComponent(catalogTree.props.children, "BlurhashPlaceholder")).toBeNull();
  expect(findComponent(catalogTree.props.children, "PlannerEventThumbnailImage")).not.toBeNull();
  mockHaloMode = false;
});
