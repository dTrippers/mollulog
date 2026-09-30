import { expect, it, jest } from "@jest/globals";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

type TestElement = { type: unknown; props: Record<string, unknown> };

const mockHookState = new Map<number, unknown>();
let mockHookIndex = 0;
let mockLoaderData: unknown;

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initialValue: unknown) => ({ current: initialValue }),
    useState: (initialValue: unknown) => {
      const index = mockHookIndex++;
      if (!mockHookState.has(index)) {
        mockHookState.set(index, typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue);
      }
      return [
        mockHookState.get(index),
        (nextValue: unknown) => {
          mockHookState.set(
            index,
            typeof nextValue === "function"
              ? (nextValue as (current: unknown) => unknown)(mockHookState.get(index))
              : nextValue,
          );
        },
      ];
    },
  };
});
jest.mock("react-router", () => ({
  useFetcher: () => ({ state: "idle", data: undefined, submit: jest.fn() }),
  useLoaderData: () => mockLoaderData,
  useSearchParams: () => [new URLSearchParams()],
}));
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/components/features/futures", () => ({ useGuestPlanner: () => ({ snapshot: null, update: jest.fn() }) }));
jest.mock("~/components/features/layout/Page", () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));
jest.mock("~/routes/utils.ap._components/ApTimelineEvent", () => ({ __esModule: true, default: () => null }));

import ApPlannerRoute from "~/routes/utils.ap";

function findElement(node: unknown, predicate: (element: TestElement) => boolean): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as TestElement;
  if (predicate(element)) return element;
  return findElement(element.props.children, predicate);
}

function renderRoute() {
  mockHookIndex = 0;
  return ApPlannerRoute() as unknown as TestElement;
}

function getConditionsSheet(tree: TestElement) {
  return findElement(tree, (element) => typeof element.props.onSave === "function");
}

it("clears the conditions-save error when the sheet opens and closes", () => {
  mockHookState.clear();
  mockHookState.set(3, "previous save failure");
  mockLoaderData = {
    signedIn: true,
    now: "2026-09-30T10:30:00+09:00",
    accountStateStatus: "available",
    timelineEventsStatus: "available",
    shopEventsStatus: "available",
    timelineEvents: [],
    shopEvents: [],
    accountState: {
      apPlanner: { accountLevel: null, cafeRank: null, comfort: null, eventPlans: {} },
      options: defaultPyroxenePlannerOptions,
      timelineItems: [],
    },
  };

  const closedTree = renderRoute();
  expect(getConditionsSheet(closedTree)?.props).toMatchObject({ open: false, error: "previous save failure" });
  const page = findElement(closedTree, (element) => Array.isArray(element.props.panels));
  const panels = page?.props.panels as Array<{ headerAction: unknown }> | undefined;
  const editButton = findElement(panels?.[0]?.headerAction, (element) => element.props.text === "수정");
  const onEdit = editButton?.props.onClick as (() => void) | undefined;
  const onPanelCloseRequestHandled = page?.props.onPanelCloseRequestHandled as (() => void) | undefined;
  onEdit?.();
  onPanelCloseRequestHandled?.();

  const openedTree = renderRoute();
  expect(getConditionsSheet(openedTree)?.props).toMatchObject({ open: true, error: null });

  mockHookState.set(3, "previous save failure");
  const reopenedTree = renderRoute();
  const conditionsSheet = getConditionsSheet(reopenedTree);
  expect(conditionsSheet?.props).toMatchObject({ open: true, error: "previous save failure" });
  const onClose = conditionsSheet?.props.onClose as (() => void) | undefined;
  onClose?.();

  const closedAgainTree = renderRoute();
  expect(getConditionsSheet(closedAgainTree)?.props).toMatchObject({ open: false, error: null });
});
