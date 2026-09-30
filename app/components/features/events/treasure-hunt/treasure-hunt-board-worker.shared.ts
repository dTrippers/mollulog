import type {
  TreasureHuntBoardAnalysis,
  TreasureHuntBoardObservation,
  TreasureHuntComposition,
} from "~/domain/treasure-hunt";

export type TreasureHuntBoardWorkerRequest = {
  type: "analyze";
  requestId: number;
  composition: TreasureHuntComposition;
  observation: TreasureHuntBoardObservation;
};

export type TreasureHuntBoardWorkerResponse =
  | ({ type: "result"; requestId: number } & TreasureHuntBoardAnalysis)
  | {
      type: "error";
      requestId: number;
      reason: "invalid-input" | "analysis-failure";
    };
