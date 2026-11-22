/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
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
  { uid: "10000", name: "아루", altNames: ["사장"], role: "striker", initialTier: 3, equipmentSlots: 3 },
  { uid: "10001", name: "무츠키", altNames: [], role: "striker", initialTier: 2, equipmentSlots: 3 },
  { uid: "10002", name: "아코", altNames: [], role: "special", initialTier: 3, equipmentSlots: 3 },
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

  it("keeps the only result active and leaves used students out", () => {
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "ㅇ" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    // "ㅇ" matches 아루 only among strikers, so ArrowDown has no row to move to and 아루 stays active.
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
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual(["아코, 미모집"]);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(changed.latest?.slots[4]?.studentUid).toBe("10002");

    const slot = screen.getByRole("button", { name: "1파티 SPECIAL 1, 아코" });
    fireEvent.keyDown(slot, { key: "Delete" });
    expect(changed.latest?.slots[4]).toBeNull();
  });

  it("finds a student by another name", () => {
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "사장" } });
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual(["아루, 미모집"]);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(changed.latest?.slots[0]?.studentUid).toBe("10000");
  });

  it("moves the active result with the left and right arrow keys", () => {
    const changed: { latest: RaidFormParty | null } = { latest: null };
    render(<Harness onParty={(party) => {
      changed.latest = party;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "ㅜ" } });
    const options = () => screen.getAllByRole("option");
    expect(options().map((option) => option.getAttribute("aria-label"))).toEqual(["아루, 미모집", "무츠키, 미모집"]);
    fireEvent.keyDown(search, { key: "ArrowRight" });
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    // The last result stays active rather than wrapping around.
    fireEvent.keyDown(search, { key: "ArrowRight" });
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "ArrowLeft" });
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "ArrowRight" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(changed.latest?.slots[0]?.studentUid).toBe("10001");
  });

  it("picks once, on the Enter that follows a composing syllable's commit", () => {
    const changed: { latest: RaidFormParty | null; count: number } = { latest: null, count: 0 };
    render(<Harness onParty={(party) => {
      changed.latest = party;
      changed.count += 1;
    }} />);
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "아루" } });
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    expect(changed.latest).toBeNull();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(changed.latest?.slots[0]?.studentUid).toBe("10000");
    expect(changed.count).toBe(1);
  });
});
