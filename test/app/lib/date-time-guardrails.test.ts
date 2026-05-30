import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const root = process.cwd();

const migratedViewFiles = [
  "app/components/features/community/CommunityFeed.tsx",
  "app/components/features/students/StudentGradingTimeline.tsx",
  "app/components/features/contents/CommentView.tsx",
  "app/components/features/contents/ContentTimeline.tsx",
  "app/components/features/contents/ContentTimelineItem.tsx",
  "app/components/features/events/EventHeader.tsx",
  "app/components/features/events/EventList.tsx",
  "app/components/features/events/EventSelector.tsx",
  "app/components/features/events/Recruitments.tsx",
  "app/components/features/forms/ContentSelectForm.tsx",
  "app/components/features/raids/RaidCard.tsx",
  "app/components/features/raids/RaidSelector.tsx",
  "app/components/features/raids/RaidStatisticsSlotCount.tsx",
  "app/components/features/raids/RaidVideosScreen.tsx",
  "app/components/features/students/RecruitmentHistories.tsx",
  "app/routes/$username.futures._components/FuturePlan.tsx",
  "app/routes/$username.pickups._components/PickupHistoryView.tsx",
];

const migratedModelFiles = [
  "app/models/timeline-content.ts",
  "app/models/event-content.ts",
  "app/models/raid.ts",
  "app/models/content.ts",
  "app/models/future-content.ts",
];

describe("date-time guardrails", () => {
  it.each(migratedViewFiles)("keeps migrated views on the date-time display helper: %s", (file) => {
    const source = readFileSync(join(root, file), "utf8");

    expect(source).not.toContain('from "dayjs"');
    expect(source).not.toContain(".toLocaleDateString(");
    if (
      file !== "app/components/features/raids/RaidVideosScreen.tsx" &&
      file !== "app/components/features/raids/RaidSelector.tsx"
    ) {
      expect(source).toContain("formatInstant");
    }
  });

  it.each(migratedModelFiles)("keeps migrated model payloads off Date instances: %s", (file) => {
    const source = readFileSync(join(root, file), "utf8");

    expect(source).not.toContain("toDate()");
    expect(source).not.toMatch(/return\s+new Date\(/);
    expect(source).not.toMatch(/startAt:\s*new Date\(/);
    expect(source).not.toMatch(/endAt:\s*new Date\(/);
    expect(source).not.toMatch(/since:\s*new Date\(/);
    expect(source).not.toMatch(/until:\s*new Date\(/);
  });
});
