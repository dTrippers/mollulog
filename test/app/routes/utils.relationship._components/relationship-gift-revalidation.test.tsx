/** @jest-environment jsdom */
import "../../components/v2/layout/layout-test-polyfills";
import { expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLoaderData } from "react-router";
import { V2Page } from "~/components/v2/layout";
import { RelationshipGiftScreen } from "~/routes/utils.relationship._components/RelationshipGiftScreen";
import type { RelationshipGiftStudent } from "~/components/v2/features/relationship/RelationshipGiftDetails";
import type { AllStudentsFavoriteItems } from "~/models/resource";
import { installLayoutTestEnv } from "../../components/v2/layout/layout-test-env";

it("preserves selection, edits made during saving, and other drafts across actual loader revalidation", async () => {
  installLayoutTestEnv();
  const OriginalRequest = globalThis.Request;
  class SubmissionRequest extends OriginalRequest {
    private readonly submittedBody: BodyInit | null | undefined;
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init);
      this.submittedBody = init?.body;
    }
    async json() {
      if (typeof this.submittedBody !== "string") throw new Error("Expected a JSON submission body");
      return JSON.parse(this.submittedBody);
    }
  }
  globalThis.Request = SubmissionRequest;
  const students: RelationshipGiftStudent[] = ["a", "b"].map((id, order) => ({
    uid: `student-${id}`,
    name: `학생 ${id}`,
    currentLevel: 20,
    currentExp: null,
    targetLevel: 50,
    items: { [`gift-${id}`]: 1 },
    order,
  }));
  const gifts: AllStudentsFavoriteItems[] = ["a", "b"].map((id) => ({
    itemUid: `gift-${id}`,
    itemName: `선물 ${id}`,
    itemRarity: 3,
    favoriteLevels: { 3: { exp: 60, students: [{ uid: `student-${id}`, name: `학생 ${id}` }] } },
  }));
  let completeSave: () => void = () => undefined;
  const loader = jest.fn(async () => ({
    items: Promise.resolve({ status: "ready" as const, items: gifts }),
    students: students.map((student) => ({ ...student, items: { ...student.items } })),
  }));
  const action = jest.fn(async ({ request }: { request: Request }) => {
    const payload = (await request.json()) as Array<{ studentId: string; items: Record<string, number> }>;
    await new Promise<void>((resolve) => {
      completeSave = resolve;
    });
    for (const plan of payload) {
      const student = students.find((entry) => entry.uid === plan.studentId);
      if (student) student.items = { ...plan.items };
    }
    return { success: true };
  });
  function Route() {
    const data = useLoaderData<Awaited<ReturnType<typeof loader>>>();
    return (
      <V2Page width="wide">
        <RelationshipGiftScreen
          items={data.items}
          students={data.students}
          isAuthenticated
          ownedQuantities={{}}
          writeMode="legacy"
          staleWriteBlocked={false}
          commonItemUids={[]}
          onStaleWriteBlocked={() => undefined}
          onStudentItemsSaved={() => undefined}
          stacked={false}
          onChooseAnotherGift={() => undefined}
          onClosePanel={() => undefined}
        />
      </V2Page>
    );
  }
  const router = createMemoryRouter([{ path: "/", loader, action, Component: Route, HydrateFallback: () => null }]);
  const view = render(<RouterProvider router={router} />);
  try {
    await screen.findByText("선물을 고르면 선호 학생과 수량을 볼 수 있어요.");
    const choose = (name: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name},`) }));
    choose("선물 b");
    fireEvent.click(screen.getByRole("button", { name: "선물 개수 입력" }));
    fireEvent.change(screen.getByRole("textbox", { name: "학생 b 선물 b 수량" }), { target: { value: "9" } });
    choose("선물 a");
    fireEvent.click(screen.getByRole("button", { name: "선물 개수 입력" }));
    fireEvent.change(screen.getByRole("textbox", { name: "학생 a 선물 a 수량" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 사항 저장" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await screen.findByText("저장 중");
    fireEvent.change(screen.getByRole("textbox", { name: "학생 a 선물 a 수량" }), { target: { value: "5" } });
    await act(async () => {
      completeSave();
    });
    await waitFor(() => expect(loader.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    expect((screen.getByRole("textbox", { name: "학생 a 선물 a 수량" }) as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("heading", { name: "선물 a" })).toBeTruthy();
    expect(students[0]?.items["gift-a"]).toBe(3);
    choose("선물 b");
    fireEvent.click(screen.getByRole("button", { name: "선물 개수 입력" }));
    expect((screen.getByRole("textbox", { name: "학생 b 선물 b 수량" }) as HTMLInputElement).value).toBe("9");
    expect(students[1]?.items["gift-b"]).toBe(1);
  } finally {
    view.unmount();
    router.dispose();
    globalThis.Request = OriginalRequest;
  }
});
