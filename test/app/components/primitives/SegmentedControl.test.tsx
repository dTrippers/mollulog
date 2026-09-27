import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import SegmentedControl from "~/components/primitives/SegmentedControl";

describe("SegmentedControl link options", () => {
  it("renders route options as links and marks the active destination as the current page", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/students"]}>
        <SegmentedControl
          ariaLabel="학생 목록 범위"
          value="all"
          options={[
            { value: "all", label: "전체 학생", to: "/students" },
            { value: "mine", label: "내 학생", to: "/@sensei/students" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/students"');
    expect(html).toContain('href="/@sensei/students"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("renders an action button for a guest route that requires sign-in", () => {
    const showSignIn = jest.fn();
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/students"]}>
        <SegmentedControl
          ariaLabel="학생 목록 범위"
          value="all"
          options={[
            { value: "all", label: "전체 학생", to: "/students" },
            { value: "mine", label: "내 학생", onSelect: showSignIn },
          ]}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("<button");
    expect(html).toContain("내 학생");
    expect(showSignIn).not.toHaveBeenCalled();
  });

  it("preserves the radio-control rendering used by existing segmented filters", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        ariaLabel="표시 방식"
        value="simple"
        options={[
          { value: "simple", label: "간략히" },
          { value: "detailed", label: "자세히" },
        ]}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('type="radio"');
    expect(html).toContain("has-focus-visible:ring-ring/30");
  });
});
