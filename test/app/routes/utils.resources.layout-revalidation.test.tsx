/** @jest-environment jsdom */

import "../components/v2/layout/layout-test-polyfills";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useOutletContext } from "react-router";
import type { GrowthStudent } from "~/routes/utils.growth._components/types";
import ResourcePlannerLayout, { type ResourcePlannerOutletContext } from "~/routes/utils.resources";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/routes/utils.growth._components/growth-data.server", () => ({ loadGrowthPlannerData: jest.fn() }));

function studentNeedingCredit(credit: number): GrowthStudent {
  return {
    uid: "student-1",
    resourceRequirements: {
      items: [],
      characterExp: 0,
      equipmentExp: 0,
      weaponExp: {},
      credit,
      skillUnavailable: false,
    },
  } as unknown as GrowthStudent;
}

function CreditTotal() {
  const { managedStudents } = useOutletContext<ResourcePlannerOutletContext>();
  const credit = managedStudents.reduce((total, student) => total + (student.resourceRequirements?.credit ?? 0), 0);
  return <p>{`크레딧 ${credit}`}</p>;
}

describe("resource planner layout", () => {
  afterEach(() => {
    cleanup();
  });

  it("passes revalidated requirements of the same students to its pages", async () => {
    let credit = 100;
    const router = createMemoryRouter(
      [
        {
          path: "/utils/resources",
          loader: () => ({ managedStudents: [studentNeedingCredit(credit)], availableStudents: [] }),
          Component: ResourcePlannerLayout,
          HydrateFallback: () => null,
          children: [{ path: "inventory", Component: CreditTotal }],
        },
      ],
      { initialEntries: ["/utils/resources/inventory"] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("크레딧 100")).toBeTruthy();

    // A growth planner save that finishes after the Sensei moved here revalidates this route with the same students.
    credit = 250;
    await act(async () => {
      await router.revalidate();
    });

    expect(screen.getByText("크레딧 250")).toBeTruthy();
  });
});
