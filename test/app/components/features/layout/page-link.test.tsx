import { describe, expect, it } from "@jest/globals";
import { UserIcon } from "@heroicons/react/24/outline";
import { renderToStaticMarkup } from "react-dom/server";
import PageLink from "~/components/features/layout/PageLink";

describe("PageLink action variant", () => {
  it("renders an accessible button with the same link-card content for sign-in actions", () => {
    const html = renderToStaticMarkup(
      PageLink({
        Icon: UserIcon,
        title: "모집한 학생",
        description: "모집한 학생의 성급과 성장 정보를 관리해요",
        to: "/unauthorized",
        onClick: () => undefined,
      }),
    );

    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain("모집한 학생");
    expect(html).toContain("모집한 학생의 성급과 성장 정보를 관리해요");
    expect(html).not.toContain("href=\"/unauthorized\"");
  });
});
