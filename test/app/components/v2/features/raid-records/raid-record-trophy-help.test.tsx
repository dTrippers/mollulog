/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { RaidRecordTrophyHelp } from "~/components/v2/features/raid-records/RaidRecordTrophyHelp";

describe("RaidRecordTrophyHelp", () => {
  it("opens the trophy cabinet steps in a sheet on demand", async () => {
    render(<RaidRecordTrophyHelp />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "지난 기록 찾는 법" }));

    const dialog = await screen.findByRole("dialog", { name: "게임에서 지난 기록 찾기" });
    expect(dialog.querySelectorAll("ol > li")).toHaveLength(4);
    expect(dialog.textContent).toContain("트로피 진열장");
  });
});
