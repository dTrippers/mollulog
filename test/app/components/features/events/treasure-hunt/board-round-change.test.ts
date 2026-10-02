import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ReactElement } from "react";
import type { PersistedTreasureHuntBoard } from "~/components/features/events/treasure-hunt/board-persistence";
import { TreasureHuntSimulator } from "~/components/features/events/treasure-hunt/TreasureHuntSimulator";
import type { TreasureHuntConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

let mockHookState: unknown[] = [];
let mockHookIndex = 0;

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: () => undefined,
    useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => {
      const index = mockHookIndex++;
      if (!(index in mockHookState)) {
        mockHookState[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      return [
        mockHookState[index],
        (next: unknown) => {
          mockHookState[index] =
            typeof next === "function" ? (next as (current: unknown) => unknown)(mockHookState[index]) : next;
        },
      ];
    },
  };
});

jest.mock("~/components/features/events/treasure-hunt/useTreasureHuntBoardAnalysis", () => ({
  useTreasureHuntBoardAnalysis: () => ({ status: "ok", result: null, showSpinner: false }),
}));

const config: TreasureHuntConfig = {
  loopRound: 4,
  rounds: [1, 2, 3, 4].map((round) => ({
    round,
    boardWidth: 9,
    boardHeight: 5,
    cellCost: { resourceType: ResourceTypeEnum.Item, resourceUid: "test-cost", quantity: 200 },
    openCellRewards: [],
    treasures: [{ uid: "test-treasure", width: round === 4 ? 3 : 2, height: 2, count: 4, rewards: [] }],
  })),
};

type RoundButton = { text: string; active: boolean; onToggle: (active: boolean) => void };
type TestProps = { children?: unknown; buttonProps?: RoundButton[]; text?: string; onClick?: () => void };

function findProps(node: unknown, matches: (props: TestProps) => boolean): TestProps | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps(child, matches);
      if (found) return found;
    }
  } else if (node && typeof node === "object" && "props" in node) {
    const { props } = node as ReactElement<TestProps>;
    return matches(props) ? props : findProps(props.children, matches);
  }
  return undefined;
}

function renderBoard() {
  mockHookIndex = 0;
  const element = TreasureHuntSimulator({ eventUid: "test-event", config });
  return (element.type as (props: unknown) => ReactElement)(element.props);
}

function selectRound(round: number, active = true) {
  const props = findProps(renderBoard(), (candidate) => candidate.buttonProps !== undefined);
  const button = props?.buttonProps?.[round - 1];
  expect(button).toBeDefined();
  button?.onToggle(active);
}

function currentState() {
  return mockHookState[0] as PersistedTreasureHuntBoard;
}

beforeEach(() => {
  const state: PersistedTreasureHuntBoard = {
    version: 1,
    board: {
      round: 3,
      knownEmpty: [{ x: 8, y: 4 }],
      foundTreasures: [{ id: 1, x: 0, y: 0, width: 2, height: 2, orientation: "horizontal" }],
    },
    undoStack: [],
    nextTreasureId: 2,
  };
  mockHookState = [state];
});

describe("treasure hunt round selection", () => {
  it.each([1, 4])("clears both records when selecting round %i, regardless of shape compatibility", (round) => {
    const previous = currentState();
    selectRound(round);

    expect(currentState()).toEqual({
      ...previous,
      board: { round, knownEmpty: [], foundTreasures: [] },
      undoStack: [previous.board],
    });
  });

  it("restores the previous round and both records when the change is undone", () => {
    const previous = currentState();
    selectRound(4);
    const undo = findProps(renderBoard(), (props) => props.text === "되돌리기");
    expect(undo?.onClick).toBeDefined();
    undo?.onClick?.();

    expect(currentState()).toEqual(previous);
  });

  it("keeps records when the current round is selected again", () => {
    const previous = currentState();
    selectRound(3);

    expect(currentState()).toBe(previous);
  });

  it("ignores a round button being deactivated", () => {
    const previous = currentState();
    selectRound(4, false);

    expect(currentState()).toBe(previous);
  });
});
