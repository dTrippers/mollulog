import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { getStudentPortraitPresentation } from "~/models/student-image-policy";
import StudentPortrait from "~/components/primitives/StudentPortrait";
import V2StudentPortrait from "~/components/v2/features/students/StudentPortrait";
import { HaloModeProvider } from "~/contexts/HaloModeContext";

jest.mock("~/models/student-image-policy", () => ({
  getStudentPortraitPresentation: jest.fn(),
}));

const mockGetPresentation = jest.mocked(getStudentPortraitPresentation);

function renderPortrait(node: React.ReactNode) {
  return renderToStaticMarkup(
    <HaloModeProvider value={{ haloMode: true, setHaloMode: () => {} }}>{node}</HaloModeProvider>,
  );
}

function expectBlockFrame(markup: string) {
  const frameClasses = markup.match(/<span class="([^"]+)"/)?.[1] ?? "";
  expect(frameClasses.split(/\s+/)).toContain("flex");
  expect(frameClasses).not.toMatch(/\binline(?:-flex|-block|-grid)?\b/);
}

describe("StudentPortrait SSR", () => {
  const collectionSrc = "https://assets.baql.net/images/students/collection/fixture-student.webp";
  const blurredPortraitSrc = "https://assets.example.test/halo-portraits/fixture-student.webp";
  const haloSrc = "https://assets.example.test/fixture-student-halo.webp";

  it("keeps neutral students gray and does not request their collection image", () => {
    mockGetPresentation.mockReturnValue({ kind: "neutral" });

    const markup = renderPortrait(
      <StudentPortrait uid="fixture-student" alt="Fixture student" className="w-full" />,
    );

    expect(markup).toContain("aspect-[200/226]");
    expect(markup).toContain("bg-muted");
    expect(markup).toContain('aria-label="Fixture student"');
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("halo-contrast-scrim");
    expectBlockFrame(markup);
  });

  it("SSR renders a hidden pre-blurred portrait and a hidden halo without requesting collection art", () => {
    mockGetPresentation.mockReturnValue({ kind: "concealed", src: blurredPortraitSrc, haloSrc });

    const markup = renderPortrait(
      <StudentPortrait
        uid="fixture-student"
        alt="Fixture student"
        className="w-full"
        haloAboveBand
        haloScale="72%"
      />,
    );

    expect(markup).toContain("aspect-[200/226]");
    expect(markup).not.toContain("@container");
    expect(markup).toContain('aria-label="Fixture student"');
    expectBlockFrame(markup);
    expect(markup).toMatch(/<img(?=[^>]*src="https:\/\/assets\.example\.test\/halo-portraits\/fixture-student\.webp")(?=[^>]*opacity-0)(?=[^>]*draggable="false")[^>]*>/);
    expect(markup).not.toContain(collectionSrc);
    expect(markup).not.toContain("blur-[14cqi]");
    expect(markup).not.toContain("scale(1.35)");
    expect(markup).toMatch(/<img(?=[^>]*src="https:\/\/assets\.example\.test\/fixture-student-halo\.webp")(?=[^>]*opacity-0)(?=[^>]*aria-hidden="true")[^>]*>/);
    expect(markup).toContain("halo-contrast-scrim");
    expect(markup).toContain('class="halo-contrast-scrim absolute inset-0 z-0"');
    expect(markup).toMatch(/class="absolute top-0 right-0 left-0 z-10 flex items-center justify-center bottom-4"/);
    expect(markup).not.toContain("bg-[radial-gradient(ellipse_at_center");
    expect(markup).not.toContain("halo-contrast-shadow");
    expect(markup).toContain("w-[72%]");

    mockGetPresentation.mockReturnValue({
      kind: "concealed",
      src: blurredPortraitSrc,
      haloSrc: "https://assets.example.test/unlisted-but-valid.webp",
    });
    const otherValidUidMarkup = renderPortrait(
      <StudentPortrait uid="fixture-student" className="w-full" />,
    );
    expect(otherValidUidMarkup).toContain('src="https://assets.example.test/unlisted-but-valid.webp"');
    expect(otherValidUidMarkup).toContain("opacity-0");
    expect(otherValidUidMarkup).toContain("halo-contrast-scrim");
    expectBlockFrame(otherValidUidMarkup);
  });

  it("keeps v2 neutral without an image and SSR renders its hidden pre-blurred art", () => {
    mockGetPresentation.mockReturnValue({ kind: "neutral" });
    const neutralMarkup = renderPortrait(<V2StudentPortrait uid="fixture-student" className="w-full" />);
    expect(neutralMarkup).toContain("aspect-[200/226]");
    expect(neutralMarkup).toContain("bg-v2-inset");
    expect(neutralMarkup).not.toContain("<img");
    expect(neutralMarkup).not.toContain("halo-contrast-scrim");
    expectBlockFrame(neutralMarkup);

    mockGetPresentation.mockReturnValue({ kind: "concealed", src: blurredPortraitSrc, haloSrc });
    const haloMarkup = renderPortrait(
      <V2StudentPortrait uid="fixture-student" className="w-full" haloAboveBand haloScale="72%" />,
    );
    expect(haloMarkup).toContain("aspect-[200/226]");
    expect(haloMarkup).toMatch(/<img(?=[^>]*src="https:\/\/assets\.example\.test\/halo-portraits\/fixture-student\.webp")(?=[^>]*opacity-0)(?=[^>]*draggable="false")[^>]*>/);
    expect(haloMarkup).not.toContain(collectionSrc);
    expect(haloMarkup).not.toContain("blur-[14cqi]");
    expect(haloMarkup).not.toContain("scale(1.35)");
    expect(haloMarkup).toContain(`src="${haloSrc}"`);
    expect(haloMarkup).toContain("opacity-0");
    expect(haloMarkup).toContain("halo-contrast-scrim");
    expect(haloMarkup).toContain('class="halo-contrast-scrim absolute inset-0 z-0"');
    expect(haloMarkup).toMatch(/class="absolute top-0 right-0 left-0 z-10 flex items-center justify-center bottom-4"/);
    expect(haloMarkup).not.toContain("bg-[radial-gradient(ellipse_at_center");
    expect(haloMarkup).not.toContain("halo-contrast-shadow");
    expect(haloMarkup).toContain("w-[72%]");
    expectBlockFrame(haloMarkup);

    mockGetPresentation.mockReturnValue({ kind: "concealed", src: blurredPortraitSrc, haloSrc });
    const squareMarkup = renderPortrait(
      <V2StudentPortrait uid="fixture-student" className="size-8 aspect-square inline rounded-full object-cover" />,
    );
    expect(squareMarkup).toContain("size-8");
    expect(squareMarkup).toContain("w-[80%]");
    expect(squareMarkup).toContain("rounded-full");
    expectBlockFrame(squareMarkup);
  });

  it("preserves square caller geometry and enlarges round halos to 80%", () => {
    mockGetPresentation.mockReturnValue({ kind: "concealed", src: blurredPortraitSrc, haloSrc });
    const squareMarkup = renderPortrait(
      <StudentPortrait uid="fixture-student" className="size-6 aspect-square object-cover" haloScale="72%" />,
    );
    expect(squareMarkup).toContain("size-6");
    expect(squareMarkup).toContain("aspect-square");
    expect(squareMarkup).toContain("w-[72%]");
    expect(squareMarkup).not.toContain("aspect-[200/226]");
    expectBlockFrame(squareMarkup);

    const circleMarkup = renderPortrait(
      <StudentPortrait uid="fixture-student" className="size-8 aspect-square inline rounded-full object-cover" />,
    );
    expect(circleMarkup).toContain("size-8");
    expect(circleMarkup).toContain("w-[80%]");
    expect(circleMarkup).toContain("rounded-full");
    expectBlockFrame(circleMarkup);
  });
});
