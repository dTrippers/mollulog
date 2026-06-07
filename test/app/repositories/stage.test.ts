import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "~/models/base";
import { getCampaignFarmingStages } from "../../../app/repositories/stage";

jest.mock("~/models/base", () => ({
  DEFAULT_KV_EXPIRATION_TTL: 60,
  fetchCached: jest.fn((_env: unknown, _key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;
const mockedFetchCached = fetchCached as jest.MockedFunction<typeof fetchCached>;

afterEach(() => {
  jest.clearAllMocks();
});

describe("getCampaignFarmingStages", () => {
  it("expands equipment rewards from gacha groups", async () => {
    mockedRunQuery.mockResolvedValue({
      data: {
        stages: [
          {
            uid: "1291101",
            name: "프론티어 차량정비소",
            stageNumber: 1,
            area: 29,
            difficulty: 0,
            terrain: "street",
            entryCosts: [{ amount: 10, resource: { uid: "2", name: "AP", type: "currency" } }],
            rewards: [
              {
                rewardType: "equipment",
                rewardTag: null,
                probability: 0.344,
                resource: {
                  __typename: "Equipment",
                  uid: "107009",
                  name: "키캡 토이 설계도면",
                  type: "equipment",
                  rarity: 1,
                  category: "charm",
                },
                gachaGroup: null,
              },
              {
                rewardType: "gacha_group",
                rewardTag: null,
                probability: 0.3,
                resource: null,
                gachaGroup: {
                  items: [
                    {
                      chance: 0.3333,
                      resource: {
                        __typename: "Equipment",
                        uid: "107006",
                        name: "휴대용 탈취제 설계도면",
                        type: "equipment",
                        rarity: 1,
                        category: "charm",
                      },
                    },
                    {
                      chance: 0.6667,
                      resource: {
                        __typename: "Equipment",
                        uid: "107007",
                        name: "드림캐쳐 설계도면",
                        type: "equipment",
                        rarity: 1,
                        category: "charm",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      error: undefined,
      extensions: undefined,
      operation: {} as never,
      stale: false,
      hasNext: false,
    } as Awaited<ReturnType<typeof runQuery>>);

    const stages = await getCampaignFarmingStages({} as Env);

    expect(mockedFetchCached).toHaveBeenCalledWith(
      expect.anything(),
      "farming-stages::campaign::v2",
      expect.any(Function),
      expect.any(Number),
      false,
    );
    expect(stages[0].rewards).toEqual([
      {
        uid: "107009",
        name: "키캡 토이 설계도면",
        rewardType: "equipment",
        rewardTag: null,
        probability: 0.344,
      },
      {
        uid: "107006",
        name: "휴대용 탈취제 설계도면",
        rewardType: "equipment",
        rewardTag: null,
        probability: 0.09999,
      },
      {
        uid: "107007",
        name: "드림캐쳐 설계도면",
        rewardType: "equipment",
        rewardTag: null,
        probability: 0.20001,
      },
    ]);
  });
});
