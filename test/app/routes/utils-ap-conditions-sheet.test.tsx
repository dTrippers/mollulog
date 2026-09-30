import { expect, it, jest } from "@jest/globals";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

type TestElement = { type: unknown; props: Record<string, unknown> };

const mockHookState: unknown[] = [];
let mockHookIndex = 0;

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: () => {},
    useId: () => "condition-sheet",
    useRef: (initialValue: unknown) => ({ current: initialValue }),
    useState: (initialValue: unknown) => {
      const index = mockHookIndex++;
      if (!(index in mockHookState)) {
        mockHookState[index] = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      }
      return [
        mockHookState[index],
        (nextValue: unknown) => {
          mockHookState[index] =
            typeof nextValue === "function"
              ? (nextValue as (current: unknown) => unknown)(mockHookState[index])
              : nextValue;
        },
      ];
    },
  };
});

import ApPlannerConditionsSheet from "~/routes/utils.ap._components/ApPlannerConditionsSheet";

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
  return findElement(element.props.children, predicate) ?? findElement(element.props.footer, predicate);
}

it("shows an alert and handles an onSave rejection without rejecting the save handler", async () => {
  mockHookState.length = 0;
  mockHookIndex = 0;
  const onClose = jest.fn();
  const sheetProps = {
    open: true,
    state: { accountLevel: null, cafeRank: null, comfort: null, tacticalApShopCount: 0, eventPlans: {} },
    options: defaultPyroxenePlannerOptions,
    onClose,
    onSave: async () => {
      throw new Error("private storage failure");
    },
  };
  const initialTree = ApPlannerConditionsSheet(sheetProps) as unknown as TestElement;
  const saveButton = findElement(initialTree, (element) => element.props.text === "저장");
  expect(saveButton).not.toBeNull();

  const save = saveButton?.props.onClick as (() => Promise<void>) | undefined;
  expect(save).toBeDefined();
  mockHookIndex = 0;
  await expect(save?.()).resolves.toBeUndefined();

  mockHookIndex = 0;
  const updatedTree = ApPlannerConditionsSheet(sheetProps) as unknown as TestElement;
  const alert = findElement(updatedTree, (element) => element.props.role === "alert");
  expect(alert?.props.children).toBe("플레이 조건을 저장하지 못했어요. 입력값은 유지돼요. 다시 시도해주세요.");
  expect(onClose).not.toHaveBeenCalled();
});
