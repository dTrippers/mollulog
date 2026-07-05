import { describe, expect, it } from "@jest/globals";
import type { MainStoryVolume } from "~/models/main-story";
import { buildMainStoryRewardContents } from "~/views/pyroxene";

function mainStoryVolume(overrides: Partial<MainStoryVolume> = {}): MainStoryVolume {
  return {
    uid: "volume-1",
    name: "대책위원회 편",
    label: "Vol.1",
    season: 1,
    sortOrder: 1,
    chapters: [
      {
        uid: "chapter-1",
        name: "첫 번째 장",
        chapterNumber: 1,
        parts: [
          {
            uid: "part-1",
            name: null,
            episodeStart: 1,
            episodeEnd: 3,
            sortOrder: 1,
            schedules: [
              { region: "jp", releasedAt: new Date("2026-07-01T02:00:00.000Z"), confirmed: true },
              { region: "gl", releasedAt: new Date("2026-09-01T02:00:00.000Z"), confirmed: false },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("buildMainStoryRewardContents", () => {
  it("builds GL main story reward contents using 60 pyroxenes per episode", () => {
    const contents = buildMainStoryRewardContents([mainStoryVolume()]);

    expect(contents).toEqual([
      expect.objectContaining({
        kind: "event",
        uid: "main-story-reward:part-1",
        recruitmentGroupUid: null,
        name: "1부 Vol.1 대책위원회 편 제1장 첫 번째 장",
        since: "2026-09-01T02:00:00.000Z",
        rewardAt: "2026-09-01T02:00:00.000Z",
        earnablePyroxene: 180,
        tags: ["main_story_reward"],
        recruitments: [],
      }),
    ]);
    expect(contents[0].until).toBe("2026-09-02T02:00:00.000Z");
  });

  it("omits parts without a GL release schedule or complete episode range", () => {
    const contents = buildMainStoryRewardContents([
      mainStoryVolume({
        chapters: [
          {
            uid: "chapter-1",
            name: null,
            chapterNumber: 1,
            parts: [
              {
                uid: "jp-only",
                name: "JP only",
                episodeStart: 1,
                episodeEnd: 1,
                sortOrder: 1,
                schedules: [{ region: "jp", releasedAt: new Date("2026-07-01T02:00:00.000Z"), confirmed: true }],
              },
              {
                uid: "missing-episode",
                name: "No episode",
                episodeStart: null,
                episodeEnd: 1,
                sortOrder: 2,
                schedules: [{ region: "gl", releasedAt: new Date("2026-09-01T02:00:00.000Z"), confirmed: true }],
              },
            ],
          },
        ],
      }),
    ]);

    expect(contents).toEqual([]);
  });
});
