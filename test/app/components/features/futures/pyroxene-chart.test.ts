import { describe, expect, it } from "@jest/globals";
import { buildPyroxeneChartMarkers } from "~/components/features/futures/PyroxeneChart";
import dayjs from "~/lib/dayjs";

function eventEntry(name: string, studentName: string) {
  return {
    date: dayjs("2026-11-03T02:00:00.000Z"),
    source: {
      type: "event" as const,
      event: {
        name,
        recruitments: [{ pickup: true, favorited: true, student: { name: studentName } }],
      },
    },
    accumulatedResources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
    resourceDelta: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
  };
}

describe("buildPyroxeneChartMarkers", () => {
  it("merges favorited students from recruitment events on the same date", () => {
    const markers = buildPyroxeneChartMarkers([
      eventEntry("하이랜더 철도 폭주 사건", "히카리"),
      eventEntry("리콜렉트 모집", "와카모"),
    ]);

    expect(markers).toHaveLength(1);
    expect(markers[0].students).toEqual(["히카리", "와카모"]);
  });
});
