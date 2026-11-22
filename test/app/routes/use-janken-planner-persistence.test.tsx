/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createDefaultJankenPlannerEntry } from "~/domain/event-shop/janken";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import type { GuestPlannerEnvelope } from "~/domain/guest-planner";
import type { GuestPlannerSnapshot } from "~/lib/guest-planner.client";

let mockFetcher: { state: string; data?: unknown; submit: jest.Mock };
let mockGuestEnvelope: GuestPlannerEnvelope;
const mockUpdateGuestPlanner = jest.fn<
  (update: (current: GuestPlannerEnvelope) => GuestPlannerEnvelope) => Promise<GuestPlannerSnapshot>
>();

jest.mock("react-router", () => ({ useFetcher: () => mockFetcher }));
jest.mock("~/lib/guest-planner.client", () => ({
  updateGuestPlanner: (update: (current: GuestPlannerEnvelope) => GuestPlannerEnvelope) =>
    mockUpdateGuestPlanner(update),
}));

import { useJankenPlannerPersistence } from "~/routes/events.$uid._components/useJankenPlannerPersistence";

const defaults = { currentTier: 2, heldEleph: 7 };
const makeEntry = (targetScore: number | null): JankenPlannerEntry => ({
  ...createDefaultJankenPlannerEntry(defaults),
  goals: { ...createDefaultJankenPlannerEntry(defaults).goals, targetScore },
});

type HostProps = {
  signedIn: boolean;
  savedEntry: JankenPlannerEntry | null;
  plannerMounted: boolean;
};

let latestPersistence!: ReturnType<typeof useJankenPlannerPersistence>;

function Host({ signedIn, savedEntry, plannerMounted }: HostProps) {
  latestPersistence = useJankenPlannerPersistence({
    shopStateUid: "shop-1",
    signedIn,
    defaultProgress: defaults,
    savedEntry,
  });
  return createElement(
    "div",
    null,
    createElement("output", { "data-testid": "entry" }, JSON.stringify(latestPersistence.entry)),
    createElement("output", { "data-testid": "conflict" }, String(latestPersistence.persistence.isConflict)),
    plannerMounted ? createElement("button", { type: "button" }, "planner") : createElement("span", null, "shop"),
  );
}

function readySnapshot(envelope: GuestPlannerEnvelope): GuestPlannerSnapshot {
  return { status: "ready", envelope, legacySources: {} } as GuestPlannerSnapshot;
}

afterEach(() => {
  jest.useRealTimers();
});

describe("parent-owned janken planner persistence", () => {
  beforeEach(() => {
    mockFetcher = { state: "idle", data: undefined, submit: jest.fn() };
    mockGuestEnvelope = { document: { jankenProgress: {} } } as GuestPlannerEnvelope;
    mockUpdateGuestPlanner.mockReset();
    mockUpdateGuestPlanner.mockImplementation(async (update) => {
      mockGuestEnvelope = update(mockGuestEnvelope);
      return readySnapshot(mockGuestEnvelope);
    });
  });

  it.each([true, false])("saves a planner edit after its screen is gone (%s signed in)", async (signedIn) => {
    jest.useFakeTimers();
    const view = render(createElement(Host, { signedIn, savedEntry: null, plannerMounted: true }));
    const draft = makeEntry(1_000_000);
    act(() => latestPersistence.setEntry(draft));
    view.rerender(createElement(Host, { signedIn, savedEntry: null, plannerMounted: false }));

    await act(async () => {
      jest.advanceTimersByTime(800);
      await Promise.resolve();
    });

    if (signedIn) {
      expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
      expect(mockFetcher.submit.mock.calls[0]?.[0]).toMatchObject({ entry: draft, base: null });
      expect(mockUpdateGuestPlanner).not.toHaveBeenCalled();
    } else {
      expect(mockUpdateGuestPlanner).toHaveBeenCalledTimes(1);
      expect(mockGuestEnvelope.document.jankenProgress["shop-1"]).toEqual(draft);
      expect(mockFetcher.submit).not.toHaveBeenCalled();
    }
    expect(screen.getByText("shop")).toBeTruthy();
  });

  it("keeps the original baseline and blocks autosave when saved data refreshes over a draft", () => {
    jest.useFakeTimers();
    const original = makeEntry(500_000);
    const latest = makeEntry(700_000);
    const view = render(createElement(Host, { signedIn: true, savedEntry: original, plannerMounted: true }));
    act(() => latestPersistence.setEntry(makeEntry(600_000)));
    view.rerender(createElement(Host, { signedIn: true, savedEntry: latest, plannerMounted: true }));

    expect(screen.getByTestId("conflict").textContent).toBe("true");
    act(() => jest.advanceTimersByTime(800));
    expect(mockFetcher.submit).not.toHaveBeenCalled();

    act(() => latestPersistence.persistence.reloadLatest());
    expect(JSON.parse(screen.getByTestId("entry").textContent ?? "null")).toEqual(latest);
    act(() => latestPersistence.setEntry(makeEntry(800_000)));
    act(() => jest.advanceTimersByTime(800));

    expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
    expect(mockFetcher.submit.mock.calls[0]?.[0]).toMatchObject({ base: latest });
  });

  it("overwrites a guest conflict against the latest envelope and clears the conflict on success", async () => {
    jest.useFakeTimers();
    const original = makeEntry(500_000);
    const latest = makeEntry(700_000);
    const draft = makeEntry(600_000);
    mockGuestEnvelope.document.jankenProgress["shop-1"] = latest;
    const view = render(createElement(Host, { signedIn: false, savedEntry: original, plannerMounted: true }));
    act(() => latestPersistence.setEntry(draft));
    view.rerender(createElement(Host, { signedIn: false, savedEntry: latest, plannerMounted: true }));
    expect(screen.getByTestId("conflict").textContent).toBe("true");

    await act(async () => {
      latestPersistence.persistence.overwrite();
      await Promise.resolve();
    });

    expect(mockUpdateGuestPlanner).toHaveBeenCalledTimes(1);
    expect(mockGuestEnvelope.document.jankenProgress["shop-1"]).toEqual(draft);
    expect(screen.getByTestId("conflict").textContent).toBe("false");
    expect(latestPersistence.persistence.saveError).toBeNull();
  });

  it("keeps a guest conflict visible and reports the save error when overwrite fails", async () => {
    const original = makeEntry(500_000);
    const latest = makeEntry(700_000);
    const draft = makeEntry(600_000);
    mockGuestEnvelope.document.jankenProgress["shop-1"] = latest;
    mockUpdateGuestPlanner.mockResolvedValue({ status: "unavailable" } as GuestPlannerSnapshot);
    const view = render(createElement(Host, { signedIn: false, savedEntry: original, plannerMounted: true }));
    act(() => latestPersistence.setEntry(draft));
    view.rerender(createElement(Host, { signedIn: false, savedEntry: latest, plannerMounted: true }));

    await act(async () => {
      latestPersistence.persistence.overwrite();
      await Promise.resolve();
    });

    expect(screen.getByTestId("conflict").textContent).toBe("true");
    expect(latestPersistence.persistence.saveError).not.toBeNull();
    expect(mockGuestEnvelope.document.jankenProgress["shop-1"]).toEqual(latest);

    mockUpdateGuestPlanner.mockImplementation(async (update) => {
      mockGuestEnvelope = update(mockGuestEnvelope);
      return readySnapshot(mockGuestEnvelope);
    });
    await act(async () => {
      latestPersistence.persistence.retrySave();
      await Promise.resolve();
    });

    expect(mockGuestEnvelope.document.jankenProgress["shop-1"]).toEqual(draft);
    expect(screen.getByTestId("conflict").textContent).toBe("false");
  });

  it("discards a guest draft to the latest entry and saves later edits from that baseline", async () => {
    jest.useFakeTimers();
    const original = makeEntry(500_000);
    const latest = makeEntry(700_000);
    const nextDraft = makeEntry(800_000);
    mockGuestEnvelope.document.jankenProgress["shop-1"] = latest;
    const view = render(createElement(Host, { signedIn: false, savedEntry: original, plannerMounted: true }));
    act(() => latestPersistence.setEntry(makeEntry(600_000)));
    view.rerender(createElement(Host, { signedIn: false, savedEntry: latest, plannerMounted: true }));

    act(() => latestPersistence.persistence.reloadLatest());
    expect(JSON.parse(screen.getByTestId("entry").textContent ?? "null")).toEqual(latest);
    expect(screen.getByTestId("conflict").textContent).toBe("false");
    act(() => latestPersistence.setEntry(nextDraft));
    await act(async () => {
      jest.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(mockGuestEnvelope.document.jankenProgress["shop-1"]).toEqual(nextDraft);
  });
});
