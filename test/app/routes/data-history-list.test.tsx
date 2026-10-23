/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";
import HistoryList from "~/routes/data-history._components/HistoryList";

describe("data history timestamps", () => {
  it("formats connection events and their original connection date in the display time zone", () => {
    const event = {
      kind: "connection",
      id: 7,
      action: "disconnected",
      source: "oauth_connection",
      createdAt: "2026-10-21T01:00:00.000Z",
      oauthApplicationUid: "app-uid",
      oauthApplicationName: "Roster Tool",
      scopes: ["profile"],
      grantCreatedAt: "2026-10-20T01:00:00.000Z",
      disconnectReason: "user",
    } as never;

    render(
      <TimeZoneProvider timeZone="America/Los_Angeles">
        <HistoryList events={[event]} studentsByUid={{}} itemNamesByUid={{}} apiKeysByUid={{}} />
      </TimeZoneProvider>,
    );

    expect(screen.getByRole("heading", { name: "2026/10/20" })).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
    expect(screen.getByText("프로필 보기 · 2026/10/19 연결")).toBeTruthy();
  });
});
