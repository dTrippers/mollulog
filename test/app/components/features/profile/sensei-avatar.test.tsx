import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, MemoryRouter } from "react-router";
import SenseiAvatar from "~/components/features/profile/SenseiAvatar";

describe("SenseiAvatar", () => {
  it("uses the official logo and an overlapping white-check badge", () => {
    const markup = renderToStaticMarkup(
      createElement(SenseiAvatar, { profileStudentId: "student-1", labels: ["official"], imageSize: 12 }),
    );

    expect(markup).toContain('src="/android-chrome-192x192.png"');
    expect(markup).toContain('alt="몰루로그 로고"');
    expect(markup).toContain("dark:ring-1 dark:ring-white/10");
    expect(markup).not.toContain("dark:opacity-90");
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="공식 계정"');
    expect(markup).toContain('title="공식 계정"');
    expect(markup).toContain('class="absolute inset-[26%] rounded-full bg-white"');
    expect(markup).toContain("-right-0.5 -bottom-0.5 inline-flex size-4");
    expect(markup).toContain("relative size-full text-primary");
    expect(markup).not.toContain("bg-card");
  });

  it.each([
    [16, "size-5"],
    [12, "size-4"],
    [10, "size-4"],
    [8, "size-3.5"],
    [6, "size-3"],
  ] as const)("uses the approved badge size for a %ipx avatar", (imageSize, badgeSize) => {
    const markup = renderToStaticMarkup(
      createElement(SenseiAvatar, { profileStudentId: null, labels: ["official"], imageSize }),
    );

    expect(markup).toContain(`inline-flex ${badgeSize}`);
  });

  it("keeps the existing student image and does not show a badge for regular accounts", () => {
    const markup = renderToStaticMarkup(
      createElement(SenseiAvatar, { profileStudentId: "student-1", labels: [], imageSize: 8 }),
    );

    expect(markup).toContain('src="https://assets.baql.net/images/students/collection/student-1.webp"');
    expect(markup).toContain('alt="학생 프로필"');
    expect(markup).toContain("dark:opacity-90");
    expect(markup).not.toContain("dark:ring-1");
    expect(markup).not.toContain('role="img"');
  });

  it("keeps the logo and badge as separate single accessible names inside a link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          Link,
          { to: "/@mollulog" },
          createElement(SenseiAvatar, { profileStudentId: null, labels: ["official"], imageSize: 8 }),
        ),
      ),
    );

    expect(markup.match(/alt="몰루로그 로고"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="공식 계정"/g)).toHaveLength(1);
  });
});
