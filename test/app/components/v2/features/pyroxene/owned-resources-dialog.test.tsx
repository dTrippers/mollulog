/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// The dialog shell needs the page layout; the reset logic under test does not. The stand-in counts renders, so a
// render loop fails the test instead of hanging it.
let dialogRenders = 0;
jest.mock("~/components/v2/features/pyroxene/pyroxene-ui", () => {
  const actual = jest.requireActual<typeof import("~/components/v2/features/pyroxene/pyroxene-ui")>(
    "~/components/v2/features/pyroxene/pyroxene-ui",
  );
  return {
    ...actual,
    PlannerDialog: ({ open, children, footer }: { open: boolean; children: ReactNode; footer?: ReactNode }) => {
      dialogRenders += 1;
      if (dialogRenders > 20) throw new Error("The dialog keeps re-rendering");
      return open ? (
        <div>
          {children}
          {footer}
        </div>
      ) : null;
    },
  };
});

const { OwnedResourcesDialog } = jest.requireActual<typeof import("~/components/v2/features/pyroxene/OwnedResources")>(
  "~/components/v2/features/pyroxene/OwnedResources",
);

const values = {
  resources: { pyroxene: 1200, oneTimeTicket: 0, tenTimeTicket: 0 },
  stacks: { regular: 0, limited: 0 },
};

describe("OwnedResourcesDialog", () => {
  it("opens without received rewards and settles", () => {
    dialogRenders = 0;
    render(
      <OwnedResourcesDialog
        open
        title="보유 재화"
        submitLabel="저장"
        initialValues={values}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText("청휘석")).toBeTruthy();
    expect(dialogRenders).toBeLessThan(5);
  });

  it("starts every field empty without initial values, and saves only once every field is entered", () => {
    dialogRenders = 0;
    const onSubmit = jest.fn();
    render(<OwnedResourcesDialog open title="모집 완료 기록" submitLabel="기록" onClose={() => {}} onSubmit={onSubmit} />);
    const fields = ["청휘석", "10회 모집 티켓", "1회 모집 티켓", "모집 스택", "특별 스택"].map(
      (label) => screen.getByRole("spinbutton", { name: label }) as HTMLInputElement,
    );
    for (const field of fields) expect(field.value).toBe("");
    const submit = screen.getByRole("button", { name: "기록" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // Leaving an empty field keeps it empty instead of filling in 0.
    fireEvent.focus(fields[0]);
    fireEvent.blur(fields[0]);
    expect(fields[0].value).toBe("");

    const entered = ["2400", "1", "3", "40", "0"];
    fields.forEach((field, index) => {
      fireEvent.change(field, { target: { value: entered[index] } });
      fireEvent.blur(field);
    });
    expect(submit.disabled).toBe(false);

    // Clearing a field blocks saving again.
    fireEvent.change(fields[2], { target: { value: "" } });
    fireEvent.blur(fields[2]);
    expect(submit.disabled).toBe(true);
    fireEvent.change(fields[2], { target: { value: "3" } });
    fireEvent.blur(fields[2]);

    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(
      {
        resources: { pyroxene: 2400, tenTimeTicket: 1, oneTimeTicket: 3 },
        stacks: { regular: 40, limited: 0 },
      },
      new Set(),
    );
  });
});
