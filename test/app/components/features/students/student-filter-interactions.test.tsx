/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, jest } from "@jest/globals";
jest.mock("react-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => React.createElement("a", { ...props, href: to }, children),
  };
});
import StudentFilter from "~/components/features/students/StudentFilter";
import { Attack, Defense } from "~/graphql/graphql";

describe("shared StudentFilter interaction", () => {
  it("adds a selected attribute filter and preserves the username screen's labels", async () => {
    const onFilterChange = jest.fn();
    render(
      <StudentFilter
        students={[
          { uid: "explosive", name: "폭발 학생", attackType: Attack.Explosive, defenseType: Defense.Light, role: "striker", position: "front", tacticRole: "attacker", order: 1 },
          { uid: "mystic", name: "신비 학생", attackType: Attack.Mystic, defenseType: Defense.Light, role: "striker", position: "front", tacticRole: "attacker", order: 2 },
        ]}
        onFilterChange={onFilterChange}
        useFilter
      />,
    );

    expect(screen.getByRole("button", { name: "FRONT" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "딜러" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "T.S." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "폭발" }));

    await waitFor(() => expect(onFilterChange).toHaveBeenLastCalledWith(["explosive"]));
  });
});
