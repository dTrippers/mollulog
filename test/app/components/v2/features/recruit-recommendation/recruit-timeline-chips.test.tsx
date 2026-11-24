/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RecruitTimeline } from "~/components/v2/features/recruit-recommendation/RecruitTimeline";
import type { RecruitContentView, RecruitPickupView } from "~/components/v2/features/recruit-recommendation/types";
import type { UtcIsoString } from "~/lib/date-time";
import type { RecruitRecommendationStudent } from "~/models/recruit-recommendation-contract";

const now = "2026-11-24T00:00:00.000Z" as UtcIsoString;
const since = "2026-11-25T02:00:00.000Z" as UtcIsoString;
const until = "2026-12-02T02:00:00.000Z" as UtcIsoString;

function pickup(studentUid: string, name: string, variant: string | null): RecruitPickupView {
  return {
    favoriteKey: studentUid,
    studentUid,
    name,
    variant,
    recruitmentLabel: "복각",
    isNew: false,
    since,
    until,
    favorite: { count: null, favorited: false, ownState: "guest", onToggle: () => {} },
  };
}

function judged(studentUid: string): RecruitRecommendationStudent {
  return {
    studentUid,
    tags: [],
    recommendation: {
      verdict: { kind: null, level: 0, evidence: null },
      tileBosses: [],
      bosses: [],
      communityLevel: null,
      growth: null,
      newbie: null,
    },
  };
}

const juri = pickup("10001", "주리", "아르바이트");
const nagusa = pickup("10002", "나구사", null);
const niya = pickup("10003", "니야", null);

const content: RecruitContentView = {
  uid: "event-1",
  name: "이벤트",
  contentType: "event",
  runType: "rerun",
  since,
  until,
  endless: false,
  typeLabel: "복각 이벤트",
  mediaSource: { kind: "type" },
  link: "/futures/event-1",
  linkable: false,
  cautionText: null,
  hidden: false,
  pickups: [juri, nagusa, niya],
};

// jsdom lacks matchMedia, which the evidence panel reads to choose between a popover and a sheet.
function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function renderTimeline() {
  stubMatchMedia();
  return render(
    <MemoryRouter>
      <RecruitTimeline
        goal="platinum"
        contents={[
          {
            content,
            recommended: [],
            notRecommended: [{ pickup: juri, student: judged("10001") }],
            pending: [],
            // 니야 was recruited after the last daily computation, so the answer does not have her yet.
            recruited: [
              { pickup: nagusa, student: judged("10002") },
              { pickup: niya, student: null },
            ],
          },
        ]}
        substituteNames={new Map()}
        now={now}
        timeZone="Asia/Seoul"
        onRevealSpoiler={() => {}}
      />
    </MemoryRouter>,
  );
}

function chipOf(name: string): HTMLElement {
  const chip = screen.getByText(name).closest("li");
  if (!chip) throw new Error(`no chip for ${name}`);
  return chip;
}

describe("RecruitTimeline student chips", () => {
  it("puts the variant and the recruitment label on lines of their own, and the label right under a name without a variant", () => {
    renderTimeline();
    const juriLines = [...chipOf("주리").querySelectorAll("span.truncate")].map((line) => line.textContent);
    expect(juriLines).toEqual(["주리", "아르바이트", "복각"]);
    const nagusaLines = [...chipOf("나구사").querySelectorAll("span.truncate")].map((line) => line.textContent);
    expect(nagusaLines).toEqual(["나구사", "복각"]);
  });

  it("marks a chip that opens its evidence with a chevron, and keeps only the chevron's space on one without evidence", () => {
    renderTimeline();
    for (const name of ["주리", "나구사"]) {
      const chip = chipOf(name);
      expect(within(chip).getByRole("button", { name: new RegExp(`${name}.* 근거`) })).toBeTruthy();
      const chevron = chip.querySelector("svg.text-v2-fg-tertiary");
      expect(chevron?.classList.contains("invisible")).toBe(false);
    }
    const niyaChip = chipOf("니야");
    expect(within(niyaChip).queryByRole("button", { name: /근거/ })).toBeNull();
    expect(niyaChip.querySelector("svg.text-v2-fg-tertiary")?.classList.contains("invisible")).toBe(true);
  });
});
