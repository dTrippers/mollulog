/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub, data } from "react-router";
import type { UtcIsoString } from "~/lib/date-time";
import PickupHistoryList from "~/routes/$username.pickups._components/PickupHistoryList";
import PickupStats from "~/routes/$username.pickups._components/PickupStats";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

const since = "2026-10-01T02:00:00.000Z" as UtcIsoString;
const earlier = "2026-09-01T02:00:00.000Z" as UtcIsoString;

const stats = {
  trial: 300,
  tier3Count: 12,
  tier3RateCount: 300,
  pickupCount: 2,
  pickupRateCount: 300,
  hasFesRecord: false,
};

const history = (uid: string, eventSince: UtcIsoString, overrides: Record<string, unknown> = {}) => ({
  uid,
  event: { events: [{ uid: `event-${uid}`, name: `이벤트 ${uid}` }], logoContentUid: null, type: "pickup", since: eventSince },
  recruitedStudents: [],
  exchangedStudents: [],
  stats: { totalTrial: 100, tier3Count: 0, pickupCount: 0 },
  comment: null,
  ...overrides,
});

function renderList(props: Partial<React.ComponentProps<typeof PickupHistoryList>> = {}, deleteAction?: () => unknown) {
  const Stub = createRoutesStub([
    {
      path: "/@sensei/pickups",
      HydrateFallback: () => null,
      action: deleteAction ?? (() => ({})),
      Component: () => (
        <PickupHistoryList username="sensei" histories={[]} unavailableRecords={[]} editable {...props} />
      ),
    },
  ]);
  return render(<Stub initialEntries={["/@sensei/pickups"]} />);
}

beforeEach(() => {
  installLayoutTestEnv();
});

describe("PickupStats", () => {
  it("shows dashes instead of zeros when there is no record", () => {
    render(<PickupStats stats={{ ...stats, trial: 0, tier3Count: 0, pickupCount: 0 }} recordCount={0} unavailableCount={0} />);

    expect(screen.getAllByText("기록 없음")).toHaveLength(3);
    expect(screen.queryByText(/0\.5배/)).toBeNull();
  });

  it("shows the Fes 0.5x notice only when a Fes record is included", () => {
    const { rerender } = render(<PickupStats stats={stats} recordCount={3} unavailableCount={0} />);
    expect(screen.queryByText("페스 기간에 모집한 ★3 학생은 확률을 0.5배로 계산했어요.")).toBeNull();

    rerender(<PickupStats stats={{ ...stats, hasFesRecord: true }} recordCount={3} unavailableCount={0} />);
    expect(screen.getByText("페스 기간에 모집한 ★3 학생은 확률을 0.5배로 계산했어요.")).toBeTruthy();
  });

  it("says how many records are left out of the totals", () => {
    render(<PickupStats stats={stats} recordCount={3} unavailableCount={2} />);

    expect(screen.getByText("불러오지 못한 기록 2건은 통계에 포함되지 않았어요.")).toBeTruthy();
  });
});

describe("PickupHistoryList", () => {
  it("shows the empty state with the add button for the owner", async () => {
    renderList();

    expect(await screen.findByText("아직 모집 기록이 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "모집 기록 추가" }).getAttribute("href")).toBe("/@sensei/pickups/edit/new");
  });

  it("hides the add and edit actions from a visitor", async () => {
    renderList({ histories: [history("a", since)] as never, editable: false });

    expect(await screen.findByText("이벤트 a")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "모집 기록 추가" })).toBeNull();
    expect(screen.queryByRole("link", { name: "편집" })).toBeNull();
  });

  it("puts a record that failed to load at its own place in the list", async () => {
    renderList({
      histories: [history("a", earlier)] as never,
      unavailableRecords: [{ uid: "broken", since }],
    });

    const unavailable = await screen.findByRole("alert");
    expect(unavailable.textContent).toContain("이 모집 기록을 불러오지 못했어요");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    const items = [unavailable, screen.getByText("이벤트 a")];
    expect(items[0].compareDocumentPosition(items[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("confirms before deleting and keeps the failure at the record's card", async () => {
    renderList(
      { histories: [history("a", since), history("b", earlier)] as never },
      () => data({ error: "pickup_history.delete_failed", uid: "a" }, { status: 500 }),
    );

    fireEvent.click((await screen.findAllByRole("button", { name: "삭제" }))[0]);
    expect(await screen.findByText("정말로 이 모집 기록을 삭제할까요?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1) as HTMLElement);

    await waitFor(() => expect(screen.getAllByText("모집 기록을 삭제하지 못했어요. 다시 시도해주세요.")).toHaveLength(1));
  });
});
