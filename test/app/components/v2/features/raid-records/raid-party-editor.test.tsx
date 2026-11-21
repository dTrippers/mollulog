/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import {
  RaidPartyCard,
  type RaidPartyEditorContext,
  type RaidPartyStudent,
} from "~/components/v2/features/raid-records/RaidPartyEditor";
import { V2Page } from "~/components/v2/layout/V2Page";
import { emptyRaidFormParty, type RaidFormParty } from "~/components/v2/features/raid-records/raid-record-form-state";

// jsdom has no ResizeObserver, which V2Page uses to measure its layout.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const students: RaidPartyStudent[] = [
  { uid: "10000", name: "아루", role: "striker", initialTier: 3, equipmentSlots: 3 },
  { uid: "10001", name: "무츠키", role: "striker", initialTier: 2, equipmentSlots: 3 },
  { uid: "10002", name: "아코", role: "special", initialTier: 3, equipmentSlots: 3 },
];

const context: RaidPartyEditorContext = {
  studentsByUid: new Map(students.map((student) => [student.uid, student])),
  pickableStudents: students,
  recruited: {},
};

function Harness({ onParty }: { onParty: (party: RaidFormParty) => void }) {
  const [party, setParty] = useState(() => emptyRaidFormParty("light"));
  return (
    <MemoryRouter>
      <V2Page width="wide">
        <RaidPartyCard
      party={party}
      title="1파티"
      expanded
      context={context}
      focusSearch
      onExpand={() => {}}
      onChange={(next) => {
        setParty(next);
        onParty(next);
      }}
      onRemove={() => {}}
        />
      </V2Page>
    </MemoryRouter>
  );
}

describe("RaidPartyCard slots", () => {
  it("fills the selected slot with Enter and moves to the next empty slot", () => {
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");
    expect(document.activeElement).toBe(search);
    expect(search.getAttribute("aria-label")).toBe("1파티 STRIKER 1 학생 찾기");

    fireEvent.change(search, { target: { value: "무츠" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(changed.latest?.slots[0]?.studentUid).toBe("10001");
    expect(search.getAttribute("aria-label")).toBe("1파티 STRIKER 2 학생 찾기");
    expect((search as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(search);
  });

  it("moves the active result with the arrow keys and leaves used students out", () => {
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "ㅇ" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    // "ㅇ" matches 아루 only among strikers, so ArrowDown wraps back to it.
    expect(changed.latest?.slots[0]?.studentUid).toBe("10000");

    fireEvent.change(search, { target: { value: "아루" } });
    expect(screen.getByText("검색 결과가 없어요")).toBeTruthy();
  });

  it("searches the role of the selected slot and empties a slot with Delete", () => {
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.click(screen.getByRole("button", { name: "1파티 SPECIAL 1, 비어 있음" }));
    fireEvent.change(search, { target: { value: "아" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["아코모집하지 않음"]);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(changed.latest?.slots[4]?.studentUid).toBe("10002");

    const slot = screen.getByRole("button", { name: "1파티 SPECIAL 1, 아코" });
    fireEvent.keyDown(slot, { key: "Delete" });
    expect(changed.latest?.slots[4]).toBeNull();
  });

  it("waits for a composing syllable to commit before picking on Enter", () => {
    jest.useFakeTimers();
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "아루" } });
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    expect(changed.latest).toBeNull();
    fireEvent.compositionEnd(search);
    act(() => {
      jest.runAllTimers();
    });
    expect(changed.latest?.slots[0]?.studentUid).toBe("10000");
    jest.useRealTimers();
  });
});
