import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { RoundStudentImage } from "~/components/v2/features/students/RoundStudentImage";

describe("RoundStudentImage", () => {
  it("keeps the student portrait out of flow so its natural width never sizes the frame", () => {
    const markup = renderToStaticMarkup(
      <RoundStudentImage studentUid="10113" className="!block !w-auto !aspect-[5/6] !h-10" />,
    );

    expect(markup).toMatch(/<img[^>]*class="absolute inset-0 size-full object-cover"/);
  });
});
