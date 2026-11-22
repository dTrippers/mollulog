/** @jest-environment jsdom */

import "../components/v2/layout/layout-test-polyfills";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useOutletContext } from "react-router";
import GrowthLayout from "~/routes/utils.growth";
import type { GrowthLayoutContext } from "~/routes/utils.growth._components/types";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/routes/utils.growth._components/growth-data.server", () => ({}));

function Positions() {
  const { managedStudents } = useOutletContext<GrowthLayoutContext>();
  return <p>{managedStudents.map((student) => `${student.uid}=${student.plannerPosition}`).join(",")}</p>;
}

describe("growth planner layout", () => {
  afterEach(cleanup);

  it("shows the stored order after a reload with the same students", async () => {
    let positions = [0, 1];
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth",
          loader: () => ({
            managedStudents: ["a", "b"].map((uid, index) => ({ uid, plannerPosition: positions[index] })),
            availableStudents: [],
            sortOrder: "manual",
            sortOrderStored: true,
            resourceRequirements: Promise.resolve({}),
          }),
          element: <GrowthLayout />,
          HydrateFallback: () => null,
          children: [{ path: "students", element: <Positions /> }],
        },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("a=0,b=1")).toBeTruthy();

    positions = [1, 0];
    await act(async () => {
      await router.revalidate();
    });

    expect(screen.getByText("a=1,b=0")).toBeTruthy();
  });
});
