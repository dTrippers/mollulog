import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { useLoaderData } from "react-router";
import LiveDetail, { loader } from "~/routes/lives.$uid";

let mockData: Awaited<ReturnType<typeof loader>>;

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(() => mockData),
    useLocation: jest.fn(() => ({ pathname: "/lives/live-1", state: null })),
    useNavigate: jest.fn(() => jest.fn()),
    useRevalidator: jest.fn(() => ({ revalidate: jest.fn() })),
  };
});
jest.mock("~/components/v2/layout", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    V2Page: ({ children }: { children: import("react").ReactNode }) => createElement("div", null, children),
    PageHeader: ({ title, back }: { title: string; back?: { title: string } & ({ to: string } | { onClick: () => void }) }) =>
      createElement(
        "header",
        null,
        title,
        back
          ? "to" in back
            ? createElement("a", { href: back.to }, back.title)
            : createElement("button", { type: "button" }, back.title)
          : null,
      ),
    PageMain: ({ children }: { children: import("react").ReactNode }) => createElement("main", null, children),
  };
});
jest.mock("~/contexts/TimeZoneProvider", () => ({ useDisplayTimeZone: () => "UTC" }));
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/post", () => ({ getPostByTimelineContentUid: jest.fn() }));
jest.mock("~/models/content.server", () => ({ getNestedContentComments: jest.fn() }));
jest.mock("~/models/timeline-content.server", () => ({ getTimelineContent: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: () => ({ error: jest.fn() }),
}));
jest.mock("~/routes/futures._components/use-futures-navigation", () => ({
  useFutureDetailReturn: () => ({ verifiedFutureReturn: false, returnToFutures: jest.fn() }),
}));
jest.mock("~/routes/events.$uid._components/EventOpinions", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return { EventOpinions: () => createElement("section", null, "opinions") };
});

const mockedUseLoaderData = jest.mocked(useLoaderData);

function liveData(imageUrl: string | null): Awaited<ReturnType<typeof loader>> {
  return {
    status: "ready",
    uid: "live-1",
    content: {
      name: "공식 방송",
      since: "2030-01-10T00:00:00.000Z",
      until: null,
      imageUrl,
      imageBlurhash: null,
      videos: [],
    },
    livePost: null,
    livePostUnavailable: false,
    comments: [],
    commentsUnavailable: false,
    signedIn: false,
  };
}

function render(): string {
  return renderToStaticMarkup(<LiveDetail />);
}

describe("live detail video region", () => {
  it("shows the overview-style image block when no video is configured", () => {
    mockData = liveData("https://assets.example/live-image.webp");

    const markup = render();

    expect(mockedUseLoaderData).toHaveBeenCalled();
    expect(markup).toContain('class="relative aspect-[2/1] overflow-hidden rounded-lg bg-v2-inset"');
    expect(markup).toContain('src="https://assets.example/live-image.webp"');
    expect(markup).toContain('<a href="/futures">미래시</a>');
    expect(markup).toContain("opinions");
    expect(markup).not.toContain("방송 영상이 아직 없어요.");
  });

  it("omits the video region when neither video nor image exists", () => {
    mockData = liveData(null);

    const markup = render();

    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain('class="aspect-[2/1]');
    expect(markup).not.toContain("방송 영상이 아직 없어요.");
    expect(markup).toContain("공개 정보 업데이트 예정");
    expect(markup).toContain("opinions");
  });

  it("uses the futures fallback and v2 retry controls when content is unavailable", () => {
    mockData = { status: "unavailable", uid: "live-1" };

    const markup = render();

    expect(markup).toContain('<a href="/futures">미래시</a>');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("정보를 불러오지 못했어요.");
    expect(markup).toContain("다시 시도");
    expect(markup).not.toContain("text-v2-link underline");
    expect(markup).not.toContain('href="/events"');
  });
});
