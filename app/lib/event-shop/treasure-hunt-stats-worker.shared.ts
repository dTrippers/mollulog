import type { OpenedCellHistogram, TreasureHuntComposition } from "~/domain/treasure-hunt";

export type TreasureHuntStatsScheduleItem = {
  signature: string;
  composition: TreasureHuntComposition;
};

export type TreasureHuntStatsWorkerRequest = {
  type: "schedule";
  items: TreasureHuntStatsScheduleItem[];
};

export type TreasureHuntStatsWorkerResponse =
  | {
      type: "progress";
      signature: string;
      completedGames: number;
      targetGames: number;
      histogram: OpenedCellHistogram;
    }
  | {
      type: "done";
      signature: string;
      histogram: OpenedCellHistogram;
      targetGames: number;
    }
  | {
      type: "error";
      signature: string;
      reason: "invalid-composition" | "engine-failure";
    };
