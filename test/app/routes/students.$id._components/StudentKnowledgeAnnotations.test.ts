/** @jest-environment jsdom */
import "../../components/v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getKnowledgePopoverVisibleTop,
  getVisibleFixedHeaderBottom,
  KnowledgeAnnotatedText,
  StudentKnowledgePopoverProvider,
} from "~/routes/students.$id._components/StudentKnowledgeAnnotations";
import { installLayoutTestEnv } from "../../components/v2/layout/layout-test-env";

describe("KnowledgeAnnotatedText", () => {
  it("links only the registered alias and leaves following letters as plain text", () => {
    const markup = renderToStaticMarkup(
      createElement(
        StudentKnowledgePopoverProvider,
        null,
        createElement(KnowledgeAnnotatedText, {
          text: "공포를 부여",
          entries: [{ title: "공포", aliases: ["공포"], body: "공포 설명" }],
        }),
      ),
    );

    expect(markup).toContain('aria-label="공포"');
    expect(markup).not.toContain('aria-label="공포를"');
    expect(markup).toContain("</button></span><span>를</span>");
  });
});

describe("KnowledgeTermTrigger keyboard dismissal", () => {
  it("opens on trigger focus without moving focus into the panel, stays focused on hover, and reopens after Escape", async () => {
    installLayoutTestEnv();
    render(
      createElement(
        "div",
        null,
        createElement(KnowledgeAnnotatedText, {
          text: "공포를 부여",
          entries: [{ title: "공포", aliases: ["공포"], body: "공포 설명" }],
        }),
      ),
    );

    const trigger = screen.getByRole("button", { name: "공포" });
    const nativeMatches = trigger.matches.bind(trigger);
    Object.defineProperty(trigger, "matches", {
      configurable: true,
      value: (selector: string) => selector === ":focus-visible" || nativeMatches(selector),
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    act(() => trigger.focus());
    const panel = await screen.findByRole("dialog", { name: "공포" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    expect(panel.contains(document.activeElement)).toBe(false);

    const activeBeforeHover = document.activeElement;
    const pointerOver = new Event("pointerover", { bubbles: true });
    Object.defineProperty(pointerOver, "pointerType", { value: "mouse" });
    fireEvent(trigger, pointerOver);
    expect(document.activeElement).toBe(activeBeforeHover);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger, { detail: 0 });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
  });

  it("opens on pointer hover without moving focus", () => {
    installLayoutTestEnv();
    render(
      createElement(
        "div",
        null,
        createElement("button", { type: "button" }, "Previous control"),
        createElement(KnowledgeAnnotatedText, {
          text: "공포를 부여",
          entries: [{ title: "공포", aliases: ["공포"], body: "공포 설명" }],
        }),
        createElement("button", { type: "button" }, "Next control"),
      ),
    );
    const previousControl = screen.getByRole("button", { name: "Previous control" });
    const trigger = screen.getByRole("button", { name: "공포" });
    act(() => previousControl.focus());
    const previousActiveElement = document.activeElement;
    expect(previousActiveElement).toBe(previousControl);
    const pointerOver = new Event("pointerover", { bubbles: true });
    Object.defineProperty(pointerOver, "pointerType", { value: "mouse" });
    fireEvent(trigger, pointerOver);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(previousActiveElement);
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
