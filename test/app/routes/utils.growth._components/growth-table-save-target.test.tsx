/** @jest-environment jsdom */

import "../../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { V2Page } from "~/components/v2/layout";
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

// jsdom has no PointerEvent; the drag reads `button` and `pointerId` from it.
class PointerEventStub extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

if (typeof globalThis.PointerEvent === "undefined") {
  Object.assign(globalThis, { PointerEvent: PointerEventStub });
}

const student: GrowthStudent = {
  uid: "student-1",
  name: "테스트 학생",
  order: 1,
  plannerCreatedAt: null,
  plannerPosition: null,
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
          element: (
            <V2Page width="full">
              <GrowthTable
                students={[student]}
                availableStudents={[]}
                onStudentUpdate={() => {}}
                writeMode="nullable"
                stacked={false}
                sortOrder="planner-newest"
                sortOrderStored
                onPositionsChange={() => {}}
              />
            </V2Page>
          ),
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

  it("saves a dragged manual order when the pointer is released away from the handle", async () => {
    // Moving the dragged rows in the DOM releases the handle's pointer capture, so the release lands elsewhere.
    const onPositionsChange = jest.fn();
    const older = { ...student, uid: "student-2", name: "다른 학생", plannerCreatedAt: "2026-07-01T00:00:00.000Z" };
    const newer = { ...student, plannerCreatedAt: "2026-07-02T00:00:00.000Z" };
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: () => ({ kind: "order", orderedStudentUids: [] }),
          element: (
            <V2Page width="full">
              <GrowthTable
                students={[newer, older]}
                availableStudents={[]}
                onStudentUpdate={() => {}}
                writeMode="nullable"
                stacked={false}
                sortOrder="manual"
                sortOrderStored
                onPositionsChange={onPositionsChange}
              />
            </V2Page>
          ),
        },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "테스트 학생 순서 옮기기" }), { button: 0 });
    // jsdom has no layout, so every block's middle is at 0 and the pointer below it places the student last.
    fireEvent.pointerMove(document.body, { clientY: 10 });
    fireEvent.pointerUp(document.body);

    expect(onPositionsChange).toHaveBeenCalledWith({ "student-2": 0, "student-1": 1 });
  });
  it("keeps a pending current tier when the row moves before the save answers", async () => {
    let answerTier: (value: unknown) => void = () => {};
    let moveRows: () => void = () => {};
    function MovablePlanner() {
      const [students, setStudents] = useState([student]);
      moveRows = () => setStudents((current) => current.map((row) => ({ ...row, plannerPosition: 0 })));
      return (
        <V2Page width="full">
          <GrowthTable
            students={students}
            availableStudents={[]}
            onStudentUpdate={() => {}}
            writeMode="nullable"
            stacked={false}
            sortOrder="manual"
            sortOrderStored
            onPositionsChange={() => {}}
          />
        </V2Page>
      );
    }
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: () => new Promise((resolve) => (answerTier = resolve)),
          element: <MovablePlanner />,
        },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "테스트 학생 현재 3성" }));
    fireEvent.click(screen.getByRole("button", { name: "4성" }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    act(() => moveRows());

    expect(screen.getByRole("button", { name: "테스트 학생 현재 4성" })).toBeTruthy();
    answerTier({ kind: "studentUpdate", student: { ...student, tier: 4 } });
  });

  it("sends a second move only after the first order save answers", async () => {
    // Two order saves at once could reach the server out of order and leave an earlier order stored.
    const answers: Array<(value: unknown) => void> = [];
    function ReorderablePlanner() {
      const [students, setStudents] = useState([
        { ...student, plannerPosition: 0 },
        { ...student, uid: "student-2", name: "다른 학생", plannerPosition: 1 },
      ]);
      return (
        <V2Page width="full">
          <GrowthTable
            students={students}
            availableStudents={[]}
            onStudentUpdate={() => {}}
            writeMode="nullable"
            stacked={false}
            sortOrder="manual"
            sortOrderStored
            onPositionsChange={(positions) =>
              setStudents((current) =>
                current.map((row) => ({ ...row, plannerPosition: positions[row.uid] ?? row.plannerPosition })),
              )
            }
          />
        </V2Page>
      );
    }
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: () => new Promise((resolve) => answers.push(resolve)),
          element: <ReorderablePlanner />,
        },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "테스트 학생 아래로" }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "테스트 학생 위로" }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(answers).toHaveLength(1);

    await act(async () => {
      answers[0]({ ok: true });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(answers).toHaveLength(2);
    answers[1]({ ok: true });
  });

  it("still sends a move waiting behind an order save after leaving the page", async () => {
    const answers: Array<(value: unknown) => void> = [];
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: () => new Promise((resolve) => answers.push(resolve)),
          element: <ReorderablePlanner />,
        },
        { path: "/utils/resources/inventory", element: <p>재화 플래너</p> },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);

    await move("테스트 학생 아래로");
    await move("테스트 학생 위로");
    await act(async () => {
      await router.navigate("/utils/resources/inventory");
    });
    expect(screen.getByText("재화 플래너")).toBeTruthy();
    expect(answers).toHaveLength(1);

    await act(async () => {
      answers[0]({ kind: "order", orderedStudentUids: [] });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(answers).toHaveLength(2);
    answers[1]({ kind: "order", orderedStudentUids: [] });
  });

  it("goes back to the last saved order when a later order is rejected", async () => {
    const answers: Array<(value: unknown) => void> = [];
    const onPositionsChange = jest.fn();
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: () => new Promise((resolve) => answers.push(resolve)),
          element: <ReorderablePlanner onPositionsChange={onPositionsChange} />,
        },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);

    await move("테스트 학생 아래로");
    await move("테스트 학생 위로");
    await act(async () => {
      answers[0]({ kind: "order", orderedStudentUids: [] });
      await jest.advanceTimersByTimeAsync(0);
    });
    onPositionsChange.mockClear();
    await act(async () => {
      answers[1]({ error: "conflict" });
      await jest.advanceTimersByTimeAsync(0);
    });

    // The first move was saved, so the screen returns to it rather than to the order before any move.
    expect(onPositionsChange).toHaveBeenCalledWith({ "student-2": 0, "student-1": 1 });
  });

  it("keeps the retry of a failed sort save when an order save is rejected", async () => {
    const answers: Array<(value: unknown) => void> = [];
    const router = createMemoryRouter(
      [
        {
          path: "/utils/growth/students",
          action: () => new Promise((resolve) => answers.push(resolve)),
          element: <ReorderablePlanner sortOrder="name" />,
        },
      ],
      { initialEntries: ["/utils/growth/students"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("button", { name: "정렬 및 화면 설정" }));
    fireEvent.change(screen.getByRole("combobox", { name: "정렬" }), { target: { value: "manual" } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(answers).toHaveLength(1);

    await move("테스트 학생 아래로");
    await act(async () => {
      answers[0]({ error: "unavailable", retryable: true });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(answers).toHaveLength(2);
    await act(async () => {
      answers[1]({ error: "conflict" });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});

function ReorderablePlanner({
  sortOrder = "manual",
  sortOrderStored = true,
  onPositionsChange,
}: {
  sortOrder?: "manual" | "name";
  sortOrderStored?: boolean;
  onPositionsChange?: (positions: Record<string, number | null>) => void;
}) {
  const [students, setStudents] = useState([
    { ...student, plannerPosition: 0 },
    { ...student, uid: "student-2", name: "다른 학생", plannerPosition: 1 },
  ]);
  return (
    <V2Page width="full">
      <GrowthTable
        students={students}
        availableStudents={[]}
        onStudentUpdate={() => {}}
        writeMode="nullable"
        stacked={false}
        sortOrder={sortOrder}
        sortOrderStored={sortOrderStored}
        onPositionsChange={(positions) => {
          onPositionsChange?.(positions);
          setStudents((current) =>
            current.map((row) => ({ ...row, plannerPosition: positions[row.uid] ?? row.plannerPosition })),
          );
        }}
      />
    </V2Page>
  );
}

async function move(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}
