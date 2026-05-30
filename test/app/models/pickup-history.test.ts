import { describe, expect, it } from "@jest/globals";
import { type PickupHistory, parsePickupHistory } from "../../../app/models/pickup-history";

const students = [
  { name: "코코나", uid: "10050" },
  { name: "하루나(새해)", uid: "10057" },
  { name: "하루나(체육복)", uid: "20030" },
  { name: "코하루", uid: "10020" },
  { name: "온구레", uid: "10055" },
  { name: "카즈사(밴드)", uid: "10091" },
  { name: "아루(드레스)", uid: "10089" },
  { name: "마키", uid: "10007" },
  { name: "아츠코", uid: "10032" },
  { name: "체리노", uid: "10017" },
  { name: "미유", uid: "10039" },
  { name: "호시노(무장)", uid: "10098" },
];

const cases: [string, PickupHistory["result"]][] = [
  [
    `
      010 1 2 7 코코나
      020 1 2 7 체루나
      030 1 5 4 코하루
      040 0 1 9
      050 0 3 7
    `,
    [
      { trial: 10, tier1Count: 7, tier2Count: 2, tier3Count: 1, tier3StudentIds: ["10050"] },
      { trial: 20, tier1Count: 7, tier2Count: 2, tier3Count: 1, tier3StudentIds: ["20030"] },
      { trial: 30, tier1Count: 4, tier2Count: 5, tier3Count: 1, tier3StudentIds: ["10020"] },
      { trial: 40, tier1Count: 9, tier2Count: 1, tier3Count: 0, tier3StudentIds: [] },
      { trial: 50, tier1Count: 7, tier2Count: 3, tier3Count: 0, tier3StudentIds: [] },
    ],
  ],
  [
    `
      010 1/1/8 온구레
      020 1/0/9 밴즈사[N]
      030 0/3/7
    `,
    [
      { trial: 10, tier1Count: 8, tier2Count: 1, tier3Count: 1, tier3StudentIds: ["10055"] },
      { trial: 20, tier1Count: 9, tier2Count: 0, tier3Count: 1, tier3StudentIds: ["10091"] },
      { trial: 30, tier1Count: 7, tier2Count: 3, tier3Count: 0, tier3StudentIds: [] },
    ],
  ],
  [
    "100 2/3/5 드아루 새루나[N]",
    [{ trial: 10, tier1Count: 5, tier2Count: 3, tier3Count: 2, tier3StudentIds: ["10089", "10057"] }],
  ],
  [
    "180 4/3/3 마키 아츠코 체리노 미유",
    [{ trial: 10, tier1Count: 3, tier2Count: 3, tier3Count: 4, tier3StudentIds: ["10007", "10032", "10017", "10039"] }],
  ],
  [
    `
      010 0/2/8 (단차 10장)
      020 0/2/8 (단챠 10장)
    `,
    [
      { trial: 10, tier1Count: 8, tier2Count: 2, tier3Count: 0, tier3StudentIds: [] },
      { trial: 20, tier1Count: 8, tier2Count: 2, tier3Count: 0, tier3StudentIds: [] },
    ],
  ],
];

describe("parsePickupHistory", () => {
  it.each(cases)("parses %s", (raw, expected) => {
    expect(parsePickupHistory(raw, students)).toEqual(expected);
  });
});
