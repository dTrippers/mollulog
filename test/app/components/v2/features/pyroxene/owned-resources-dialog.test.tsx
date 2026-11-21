/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
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
    PlannerDialog: ({ open, children }: { open: boolean; children: ReactNode }) => {
      dialogRenders += 1;
      if (dialogRenders > 20) throw new Error("The dialog keeps re-rendering");
      return open ? <div>{children}</div> : null;
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
  it("opens without received rewards, as the completion record does, and settles", () => {
    dialogRenders = 0;
    render(
      <OwnedResourcesDialog
        open
        title="모집 완료 기록"
        submitLabel="기록"
        initialValues={values}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText("청휘석")).toBeTruthy();
    expect(dialogRenders).toBeLessThan(5);
  });
});
