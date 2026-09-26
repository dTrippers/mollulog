import { describe, expect, it } from "@jest/globals";
import {
  getKnowledgePopoverVisibleTop,
  getVisibleFixedHeaderBottom,
  handleKeyboardTermClick,
  toggleKeyboardPopoverKey,
} from "~/routes/students.$id._components/StudentKnowledgeAnnotations";

describe("handleKeyboardTermClick", () => {
  it("reopens after Escape and toggles closed on the next keyboard activation", () => {
    let activeKey: string | null = "term-1";
    const toggle = () => {
      activeKey = toggleKeyboardPopoverKey(activeKey, "term-1");
    };

    activeKey = null;
    handleKeyboardTermClick(0, toggle);
    expect(activeKey).toBe("term-1");
    handleKeyboardTermClick(0, toggle);
    expect(activeKey).toBeNull();
    handleKeyboardTermClick(1, toggle);
    expect(activeKey).toBeNull();
  });
});

describe("getKnowledgePopoverVisibleTop", () => {
  it("includes a sticky student tab bar positioned below the mobile header", () => {
    expect(
      getKnowledgePopoverVisibleTop({
        viewportTop: 0,
        scrollAreaTop: 0,
        fixedHeaderBottom: 46,
        studentTabBarRect: { top: 46, bottom: 98 },
      }),
    ).toBe(98);
  });

  it("does not include the student tab bar before it reaches its sticky position", () => {
    expect(
      getKnowledgePopoverVisibleTop({
        viewportTop: 0,
        scrollAreaTop: 0,
        fixedHeaderBottom: 46,
        studentTabBarRect: { top: 54, bottom: 106 },
      }),
    ).toBe(46);
  });

  it("uses the viewport and scroll area top when no student tab bar is present", () => {
    expect(
      getKnowledgePopoverVisibleTop({
        viewportTop: 8,
        scrollAreaTop: 12,
        fixedHeaderBottom: 8,
        studentTabBarRect: null,
      }),
    ).toBe(12);
  });

  it("clamps below the visible fixed site header and sticky tabs at tablet widths", () => {
    const fixedHeaderBottom = getVisibleFixedHeaderBottom({
      viewportTop: 0,
      headerRect: { bottom: 64, height: 64 },
      headerDisplay: "flex",
      headerVisibility: "visible",
    });

    expect(
      getKnowledgePopoverVisibleTop({
        viewportTop: 0,
        scrollAreaTop: 64,
        fixedHeaderBottom,
        studentTabBarRect: { top: 64, bottom: 112 },
      }),
    ).toBe(112);
  });

  it("ignores the fixed site header when its desktop breakpoint hides it", () => {
    expect(
      getVisibleFixedHeaderBottom({
        viewportTop: 8,
        headerRect: { bottom: 0, height: 0 },
        headerDisplay: "none",
        headerVisibility: "visible",
      }),
    ).toBe(8);
  });
});
