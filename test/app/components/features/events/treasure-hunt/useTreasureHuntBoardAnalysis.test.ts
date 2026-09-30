import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTreasureHuntBoardAnalysis } from "~/components/features/events/treasure-hunt/useTreasureHuntBoardAnalysis";
import type { TreasureHuntBoardObservation, TreasureHuntComposition } from "~/domain/treasure-hunt";

const composition: TreasureHuntComposition = { boardWidth: 1, boardHeight: 1, pieces: [] };
const observation: TreasureHuntBoardObservation = { knownEmpty: [], foundTreasures: [] };

function InitialAnalysisState() {
  const analysis = useTreasureHuntBoardAnalysis(composition, observation);
  return createElement("span", {
    "data-status": analysis.status,
    "data-show-spinner": String(analysis.showSpinner),
  });
}

describe("useTreasureHuntBoardAnalysis", () => {
  it("renders the initial calculation indicator in server markup", () => {
    const markup = renderToStaticMarkup(createElement(InitialAnalysisState));

    expect(markup).toContain('data-status="calculating"');
    expect(markup).toContain('data-show-spinner="true"');
  });
});
