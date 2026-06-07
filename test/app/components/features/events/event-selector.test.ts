import { describe, expect, it, jest } from "@jest/globals";
import {
  type SelectableEvent,
  filterSelectableEvents,
  shouldConfirmSelectableEventNavigation,
} from "~/components/features/events/EventSelector";

jest.mock("~/components/features/students", () => ({
  StudentCards: () => null,
}));

function createEvent(index: number, overrides: Partial<SelectableEvent> = {}): SelectableEvent {
  return {
    uid: `pickup-${index}`,
    name: `마법소녀 픽업 ${index}`,
    since: `2026-05-${String(27 - index).padStart(2, "0")}T02:00:00.000Z`,
    until: null,
    isSpoiler: false,
    recruitments: [
      {
        pickup: true,
        student: {
          uid: `student-${index}`,
          name: `픽업학생${index}`,
        },
      },
    ],
    ...overrides,
  } as SelectableEvent;
}

describe("filterSelectableEvents", () => {
  it("limits matching dropdown options to the most recent visible events", () => {
    const events = Array.from({ length: 25 }, (_, index) => createEvent(index));

    const filteredEvents = filterSelectableEvents(events, "마법소녀", 20);

    expect(filteredEvents).toHaveLength(20);
    expect(filteredEvents.map((event) => event.uid)).toEqual(events.slice(0, 20).map((event) => event.uid));
  });

  it("searches the full historical list before applying the visible limit", () => {
    const events = Array.from({ length: 25 }, (_, index) =>
      index === 24 ? createEvent(index, { name: "오래된 특별 픽업" }) : createEvent(index),
    );

    const filteredEvents = filterSelectableEvents(events, "특별", 20);

    expect(filteredEvents.map((event) => event.uid)).toEqual(["pickup-24"]);
  });

  it("matches pickup student names while filtering", () => {
    const events = Array.from({ length: 25 }, (_, index) => createEvent(index));

    const filteredEvents = filterSelectableEvents(events, "픽업학생24", 20);

    expect(filteredEvents.map((event) => event.uid)).toEqual(["pickup-24"]);
  });

  it("does not match hidden spoiler event names or pickup student names", () => {
    const events = [
      createEvent(1, {
        uid: "spoiler-event",
        name: "비밀 이벤트",
        isSpoiler: true,
        recruitments: [{ pickup: true, student: { uid: "secret-student", name: "비밀학생" } }],
      }),
    ];

    expect(filterSelectableEvents(events, "비밀", 20)).toEqual([]);
    expect(filterSelectableEvents(events, "비밀학생", 20)).toEqual([]);
    expect(filterSelectableEvents(events, "???", 20).map((event) => event.uid)).toEqual(["spoiler-event"]);
  });

  it("matches revealed spoiler event names", () => {
    const events = [
      createEvent(1, {
        uid: "spoiler-event",
        name: "비밀 이벤트",
        isSpoiler: true,
      }),
    ];

    const filteredEvents = filterSelectableEvents(events, "비밀", 20, ["spoiler-event"]);

    expect(filteredEvents.map((event) => event.uid)).toEqual(["spoiler-event"]);
  });
});

describe("shouldConfirmSelectableEventNavigation", () => {
  it("requires confirmation for spoiler events", () => {
    expect(shouldConfirmSelectableEventNavigation(createEvent(1, { isSpoiler: true }))).toBe(true);
  });

  it("does not require confirmation for non-spoiler events", () => {
    expect(shouldConfirmSelectableEventNavigation(createEvent(1, { isSpoiler: false }))).toBe(false);
  });
});
