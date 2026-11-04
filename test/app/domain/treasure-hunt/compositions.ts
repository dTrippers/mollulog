import type { TreasureHuntComposition } from "~/domain/treasure-hunt";

export const compositions = [
  {
    label: "1·4",
    composition: {
      boardWidth: 9,
      boardHeight: 5,
      pieces: [
        { width: 3, height: 2, count: 2 },
        { width: 3, height: 1, count: 5 },
        { width: 1, height: 2, count: 2 },
      ],
    },
    arrangements: 2_662_809_982,
    p10: 33,
    p50: 35,
    p90: 38,
  },
  {
    label: "2·5",
    composition: {
      boardWidth: 9,
      boardHeight: 5,
      pieces: [
        { width: 4, height: 2, count: 1 },
        { width: 1, height: 4, count: 2 },
        { width: 3, height: 1, count: 5 },
      ],
    },
    arrangements: 69_964_148,
    p10: 32,
    p50: 33,
    p90: 35,
  },
  {
    label: "3·6",
    composition: {
      boardWidth: 9,
      boardHeight: 5,
      pieces: [
        { width: 3, height: 3, count: 1 },
        { width: 2, height: 2, count: 4 },
        { width: 1, height: 2, count: 3 },
      ],
    },
    arrangements: 16_921_054,
    p10: 33,
    p50: 36,
    p90: 38,
  },
  {
    label: "7+",
    composition: {
      boardWidth: 9,
      boardHeight: 5,
      pieces: [
        { width: 4, height: 2, count: 2 },
        { width: 3, height: 1, count: 3 },
        { width: 1, height: 2, count: 6 },
      ],
    },
    arrangements: 2_532_321_650,
    p10: 38,
    p50: 40,
    p90: 41,
  },
] satisfies {
  label: string;
  composition: TreasureHuntComposition;
  arrangements: number;
  p10: number;
  p50: number;
  p90: number;
}[];
