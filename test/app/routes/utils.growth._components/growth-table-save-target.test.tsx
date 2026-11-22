/** @jest-environment jsdom */

import "../../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import GrowthTable from "~/routes/utils.growth._components/GrowthTable";
import type { GrowthStudent } from "~/routes/utils.growth._components/types";

// The shared polyfill's Request stub has no body. The router builds a JSON submission with Headers, which jsdom lacks.
class HeadersStub {
  private readonly values = new Map<string, string>();

  constructor(init?: Record<string, string>) {
    for (const [name, value] of Object.entries(init ?? {})) this.values.set(name.toLowerCase(), value);
  }

  get(name: string) {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string) {
    this.values.set(name.toLowerCase(), value);
  }

  has(name: string) {
    return this.values.has(name.toLowerCase());
  }
}

if (typeof globalThis.Headers === "undefined") {
  Object.assign(globalThis, { Headers: HeadersStub });
}

const student: GrowthStudent = {
  uid: "student-1",
  name: "테스트 학생",
  order: 1,
  plannerCreatedAt: null,
  isRecruited: true,
  released: true,
  hasGear: false,
  equipments: ["hat", "gloves", "shoes"],
  tier: 3,
  initialTier: 3,
  relationshipCurrentLevel: null,
  relationshipTargetLevel: null,
  level: 1,
  skillEx: null,
  skillNormal: null,
  skillEnhanced: null,
  skillSub: null,
  equip1: null,
  equip2: null,
  equip3: null,
  equipSpecial: null,
  weaponLevel: null,
  abilityHp: null,
  abilityAtk: null,
  abilityHeal: null,
  targetLevel: 37,
  targetWeaponLevel: null,
  targetAbilityHp: null,
  targetAbilityAtk: null,
  targetAbilityHeal: null,
  targetSkillEx: null,
  targetSkillNormal: null,
  targetSkillEnhanced: null,
  targetSkillSub: null,
  targetEquip1: null,
  targetEquip2: null,
  targetEquip3: null,
  targetEquipSpecial: null,
  targetTier: null,
  resourceRequirements: null,
};

describe("growth table autosave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it("posts a save scheduled before leaving the page to the growth planner action", async () => {
    const actionPaths: string[] = [];
    const recordAction = ({ request }: { request: Request }) => {
      actionPaths.push(new URL(request.url).pathname);
      return { error: "test" };
    };
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: recordAction,
          element: <GrowthTable students={[student]} availableStudents={[]} onStudentUpdate={() => {}} writeMode="nullable" />,
        },
        { path: "/utils/resources/inventory", action: recordAction, element: <p>재화 플래너</p> },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByDisplayValue("37"), { target: { value: "40" } });
    await act(async () => {
      await router.navigate("/utils/resources/inventory");
    });
    expect(screen.getByText("재화 플래너")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });

    expect(actionPaths).toEqual(["/utils/growth/students"]);
  });
});
