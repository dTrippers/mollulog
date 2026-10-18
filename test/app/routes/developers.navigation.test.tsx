/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import DevelopersLayout from "~/routes/developers";
import { PageMain } from "~/components/v2/layout";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

function IntroScreen() {
  return <PageMain>본문: 소개</PageMain>;
}

function DocsScreen() {
  return <PageMain>본문: 문서</PageMain>;
}

function KeysScreen() {
  return <PageMain>본문: 키</PageMain>;
}

const routes = [
  {
    id: "developers",
    path: "/developers",
    Component: DevelopersLayout,
    children: [
      { id: "developers-intro", index: true, Component: IntroScreen },
      { id: "developers-docs", path: "docs", Component: DocsScreen },
      { id: "developers-keys", path: "keys", Component: KeysScreen },
    ],
  },
];

describe("developers responsive screen navigation", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  it.each([
    ["/developers", "소개", "본문: 소개"],
    ["/developers/docs", "API 문서", "본문: 문서"],
    ["/developers/keys", "API 키", "본문: 키"],
  ])("marks %s active and places history before the body", (path, activeName, bodyText) => {
    const RoutesStub = createRoutesStub(routes);
    const { container } = render(<RoutesStub initialEntries={[path]} />);
    const navigation = screen.getByRole("navigation", { name: "화면 탐색" });
    const activeLinks = within(navigation)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    const aside = container.querySelector<HTMLElement>("aside[aria-label='보조 도구']");
    const history = aside?.querySelector<HTMLAnchorElement>('a[href*="/data-history"]');
    const main = container.querySelector<HTMLElement>(".v2-main");

    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0].textContent).toContain(activeName);
    expect(screen.getByText(bodyText)).toBeTruthy();
    expect(aside).not.toBeNull();
    if (!history || !main) {
      throw new Error("Expected the history link and main content in the developers layout.");
    }
    expect(navigation.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(history.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
