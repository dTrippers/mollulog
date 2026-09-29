import { expect, it, jest } from "@jest/globals";

type TestElement = { type: unknown; props: Record<string, unknown> };

const mockHookState = new Map<string, unknown[]>();
const mockEffects = new Map<string, Array<() => void>>();
let mockOwner = "parent";
let mockHookIndex = 0;
const mockCachedImage = { complete: true, naturalWidth: 128 } as HTMLImageElement;

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

it("hides the AP icon surface when the image is already complete at mount", () => {
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
