/** @jest-environment jsdom */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TreasureHuntScreen } from "~/routes/events.$uid._components/TreasureHuntScreen";
import { useTreasureHuntBoardAnalysis } from "~/lib/treasure-hunt/useTreasureHuntBoardAnalysis";
import {
  loadTreasureHuntBoard,
  saveTreasureHuntBoard,
  type PersistedTreasureHuntBoard,
} from "~/lib/treasure-hunt/board-persistence";
import type { TreasureHuntConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

jest.mock("~/components/v2/layout", () => ({
  PageMain: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
jest.mock("~/lib/treasure-hunt/useTreasureHuntBoardAnalysis", () => ({
  useTreasureHuntBoardAnalysis: jest.fn(),
}));

const mockedAnalysis = jest.mocked(useTreasureHuntBoardAnalysis);
const config: TreasureHuntConfig = {
  loopRound: 4,
  rounds: [1, 2, 3, 4].map((round) => ({
    round,
    boardWidth: 9,
    boardHeight: 5,
    cellCost: { resourceType: ResourceTypeEnum.Item, resourceUid: "event-item", quantity: 1 },
    openCellRewards: [],
    treasures: [{ uid: "treasure", width: 2, height: 2, count: 4, rewards: [] }],
  })),
};

describe("treasure hunt v2 round selection", () => {
  it("starts a fresh board with the next-round button at the loop round", async () => {
    const previous: PersistedTreasureHuntBoard = {
      version: 1,
      board: {
        round: 4,
        knownEmpty: [{ x: 8, y: 4 }],
        foundTreasures: [{ id: 1, x: 0, y: 0, width: 2, height: 2, orientation: "horizontal" }],
      },
      undoStack: [],
      nextTreasureId: 2,
    };
    saveTreasureHuntBoard("event-1", previous);
    mockedAnalysis.mockReturnValue({ status: "ok", result: null, showSpinner: false, retry: jest.fn() });

    render(<TreasureHuntScreen eventUid="event-1" config={config} />);
    fireEvent.click(screen.getByRole("button", { name: "다음 회차" }));

    await waitFor(() => expect(loadTreasureHuntBoard("event-1")?.board).toEqual({
      round: 4,
      knownEmpty: [],
      foundTreasures: [],
    }));

    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(loadTreasureHuntBoard("event-1")?.board).toEqual(previous.board));
  });

  it("clears observations on round change and restores them with undo", async () => {
    const previous: PersistedTreasureHuntBoard = {
      version: 1,
      board: {
        round: 3,
        knownEmpty: [{ x: 8, y: 4 }],
        foundTreasures: [{ id: 1, x: 0, y: 0, width: 2, height: 2, orientation: "horizontal" }],
      },
      undoStack: [],
      nextTreasureId: 2,
    };
    saveTreasureHuntBoard("event-1", previous);
    mockedAnalysis.mockReturnValue({ status: "ok", result: null, showSpinner: false, retry: jest.fn() });

    render(<TreasureHuntScreen eventUid="event-1" config={config} />);
    const roundGroup = screen.getByRole("group", { name: "회차" });
    const thirdRoundButton = screen.getByRole("button", { name: "3회차" });
    expect(roundGroup.contains(thirdRoundButton)).toBe(true);
    expect(thirdRoundButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "4회차 이후" }));
    await waitFor(() => expect(loadTreasureHuntBoard("event-1")?.board).toEqual({
      round: 4,
      knownEmpty: [],
      foundTreasures: [],
    }));
    expect(screen.getByRole("button", { name: "4회차 이후" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(loadTreasureHuntBoard("event-1")?.board).toEqual(previous.board));
  });
});
