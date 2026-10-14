import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import RaidPartyCard, { type RaidPartyRow } from "~/components/features/raids/RaidPartyCard";

function renderCard({
  rows,
  showStartingSkillOrder = false,
  compactLevel = false,
}: {
  rows: RaidPartyRow[];
  showStartingSkillOrder?: boolean;
  compactLevel?: boolean;
}) {
  return renderToStaticMarkup(
    <RaidPartyCard
      rows={rows}
      summaryItems={[]}
      popupIdPrefix="rank-test"
      showStartingSkillOrder={showStartingSkillOrder}
      compactLevel={compactLevel}
    />,
  );
}

function makeRow(orders: Array<number | null>) {
  return {
    key: "party-0",
    label: "1편성",
    slots: orders.map((startingSkillOrder, index) => ({
      uid: "1008" + index,
      name: "학생 " + index,
      tier: 5,
      level: 85,
      startingSkillOrder,
      grayscale: index === 0,
      unrecruited: index === 0,
    })),
  } satisfies RaidPartyRow;
}

describe("rank party card student overlays", () => {
  it("shows skill order tags with subdued colors and card outline", () => {
    const markup = renderCard({
      rows: [makeRow([1, 2, 3, 4, 5, null])],
      showStartingSkillOrder: true,
      compactLevel: true,
    });

    const tags = markup.match(/<span role="img" aria-label="개시 스킬 [1-5]번" title="개시 스킬 [1-5]번" class="[^"]*">[1-5]<\/span>/g) ?? [];
    expect(tags).toHaveLength(5);
    expect(tags[0]).toContain("absolute top-0 -left-[3px]");
    expect(tags[0]).toContain("size-3.5");
    expect(tags[0]).toContain("rounded");
    expect(tags[0]).toContain("ring-[1.5px] ring-card shadow-sm");
    for (const tag of tags.slice(0, 3)) {
      expect(tag).toContain("bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200");
      expect(tag).toContain("ring-[1.5px] ring-card");
    }
    for (const tag of tags.slice(3)) {
      expect(tag).toContain("bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200");
      expect(tag).toContain("ring-[1.5px] ring-card");
    }
    expect(markup).not.toContain("개시 스킬 6번");
  });

  it("uses a compact level chip and stacks the unrecruited badge beneath it", () => {
    const markup = renderCard({
      rows: [makeRow([1, null, null, null, null, null])],
      showStartingSkillOrder: true,
      compactLevel: true,
    });

    expect(markup).toContain('aria-label="레벨 85"');
    expect(markup).toContain(">Lv.85</span>");
    expect(markup.indexOf(">Lv.85</span>")).toBeLessThan(markup.indexOf(">미모집</span>"));
    expect(markup).toContain("scale-75");
    expect(markup).toContain("absolute top-1.5 right-0.5 z-10 flex origin-top-right scale-75 flex-col items-end gap-0.5 text-xs font-bold");
    expect(markup).toContain("rounded-lg bg-neutral-900/90 px-1 leading-4");
    expect(markup).toContain("whitespace-nowrap rounded px-1 py-0.5 text-xs leading-none font-bold");
    expect(markup).toContain("bg-neutral-900/80 text-white");
    expect(markup).toContain("dark:bg-neutral-50/90");
    expect(markup).toContain("grayscale opacity-75");
  });

  it("puts an unrecruited badge at the top of the stack when the slot has no level", () => {
    const markup = renderCard({
      rows: [
        {
          key: "party-0",
          label: "1편성",
          slots: [{ uid: "10085", name: "학생", level: null, unrecruited: true, grayscale: true }],
        },
      ],
      compactLevel: true,
    });

    expect(markup).not.toContain('aria-label="레벨');
    expect(markup).toContain("absolute top-1.5 right-0.5 z-10 flex origin-top-right scale-75");
    expect(markup).toContain(">미모집</span>");
  });

  it("keeps the default card level and overlay rendering unchanged", () => {
    const markup = renderCard({ rows: [makeRow([1, null, null, null, null, null])] });

    expect(markup).toContain(">Lv. 85</span>");
    expect(markup).not.toContain("Lv.85");
    expect(markup).not.toContain("개시 스킬");
  });
});
