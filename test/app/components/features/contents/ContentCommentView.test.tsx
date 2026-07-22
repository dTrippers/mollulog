import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import ContentCommentView from "~/components/features/contents/ContentCommentView";

describe("ContentCommentView", () => {
  it("renders an explicit disabled state when comments are unavailable", () => {
    const markup = renderToStaticMarkup(
      <ContentCommentView
        unavailable={true}
        summary={{ count: 0, hasRecentComment: false, pinnedPreviewBody: null }}
        onClick={jest.fn()}
      />,
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("의견을 불러오지 못했습니다");
    expect(markup).not.toContain("의견을 남겨보세요");
    expect(markup).not.toContain(">0<");
  });
});
