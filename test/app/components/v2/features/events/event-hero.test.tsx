/** @jest-environment jsdom */
import { createElement, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EventHero } from "~/components/v2/features/events/EventHero";
import { HaloModeProvider } from "~/contexts/HaloModeContext";

jest.mock("~/contexts/TimeZoneProvider", () => ({ useDisplayTimeZone: () => "UTC" }));

const mockPlayer = {
  mute: jest.fn(),
  unMute: jest.fn(),
  setVolume: jest.fn(),
  getDuration: jest.fn(() => 10),
  stopVideo: jest.fn(),
};

jest.mock("react-youtube", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({ videoId, opts, onReady, onPlay, onEnd }: {
      videoId: string;
      opts: { playerVars: { autoplay: number; mute: number; controls: number; start: number } };
      onReady: (event: { target: typeof mockPlayer }) => void;
      onPlay: (event: { target: typeof mockPlayer }) => void;
      onEnd: () => void;
    }) => React.createElement(
      "div",
      {
        "data-testid": "youtube",
        "data-video-id": videoId,
        "data-autoplay": opts.playerVars.autoplay,
        "data-mute": opts.playerVars.mute,
        "data-controls": opts.playerVars.controls,
        "data-start": opts.playerVars.start,
      },
      [
        React.createElement("button", { key: "ready", type: "button", onClick: () => onReady({ target: mockPlayer }) }, "준비"),
        React.createElement("button", { key: "play", type: "button", onClick: () => onPlay({ target: mockPlayer }) }, "재생"),
        React.createElement("button", { key: "end", type: "button", onClick: onEnd }, "종료"),
      ],
    ),
  };
});

const videos = [
  { youtube: "video-one", title: "첫 번째 영상", start: 5 },
  { youtube: "video-two", title: "두 번째 영상", start: null },
];

beforeEach(() => {
  mockPlayer.mute.mockClear();
  mockPlayer.unMute.mockClear();
  mockPlayer.setVolume.mockClear();
  mockPlayer.getDuration.mockClear();
  mockPlayer.stopVideo.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: jest.fn() });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("EventHero", () => {
  it("keeps the image and event overlay at 16:9 when no video is available", () => {
    const markup = renderToStaticMarkup(
      createElement(EventHero, {
        imageUrl: "/event.jpg",
        name: "이벤트\n개최",
        type: "event",
        runType: "first",
        since: "2030-01-10T00:00:00.000Z" as never,
        until: "2030-01-20T00:00:00.000Z" as never,
        endless: false,
        videos: [],
      }),
    );

    expect(markup).toContain("aspect-video");
    expect(markup).toContain("이벤트\n개최");
    expect(markup).toContain("2030-01-10 ~ 2030-01-20");
    expect(markup).not.toContain("youtube");
    expect(markup).not.toContain("동영상 소리 켜기");
  });

  it("loads the muted player only after the viewer asks to play, then keeps the volume toggle and video list", () => {
    render(
      createElement(EventHero, {
        imageUrl: "/event.jpg",
        name: "이벤트",
        type: "event",
        runType: "first",
        since: "2030-01-10T00:00:00.000Z" as never,
        until: "2030-01-20T00:00:00.000Z" as never,
        endless: false,
        videos,
      }),
    );

    expect(screen.queryByTestId("youtube")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "동영상 재생" }));
    expect(screen.getByTestId("youtube").getAttribute("data-video-id")).toBe("video-one");
    expect(screen.getByTestId("youtube").getAttribute("data-autoplay")).toBe("1");
    expect(screen.getByTestId("youtube").getAttribute("data-mute")).toBe("1");
    expect(screen.getByTestId("youtube").getAttribute("data-controls")).toBe("0");
    expect(screen.getByTestId("youtube").getAttribute("data-start")).toBe("5");

    fireEvent.click(screen.getByRole("button", { name: "준비" }));
    fireEvent.click(screen.getByRole("button", { name: "동영상 소리 켜기" }));
    expect(mockPlayer.unMute).toHaveBeenCalledTimes(1);
    expect(mockPlayer.setVolume).toHaveBeenCalledWith(30);

    fireEvent.click(screen.getByRole("button", { name: "다음 동영상" }));
    expect(screen.getByTestId("youtube").getAttribute("data-video-id")).toBe("video-two");
    expect(screen.getByRole("button", { name: "두 번째 영상" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "이전 동영상" }));
    expect(screen.getByTestId("youtube").getAttribute("data-video-id")).toBe("video-one");
  });

  it("fades to the player while playing and restores the image one second before the video ends", () => {
    jest.useFakeTimers();
    render(
      createElement(EventHero, {
        imageUrl: "/event.jpg",
        name: "이벤트",
        type: "event",
        runType: "first",
        since: "2030-01-10T00:00:00.000Z" as never,
        until: "2030-01-20T00:00:00.000Z" as never,
        endless: false,
        videos: [videos[0]],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "동영상 재생" }));
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    expect(screen.getByRole("img", { name: "이벤트" }).className).toContain("opacity-0");
    fireEvent.click(screen.getByRole("button", { name: "종료" }));
    expect(screen.getByRole("img", { name: "이벤트" }).className).toContain("opacity-100");
    expect(screen.queryByTestId("youtube")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "동영상 재생" }));
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    expect(screen.getByRole("img", { name: "이벤트" }).className).toContain("opacity-0");

    act(() => jest.advanceTimersByTime(3_999));
    expect(screen.getByRole("img", { name: "이벤트" }).className).toContain("opacity-0");
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByRole("img", { name: "이벤트" }).className).toContain("opacity-100");

    jest.useRealTimers();
  });

  it("omits the source image and player from halo-mode SSR and shows the halo notice", () => {
    const markup = renderToStaticMarkup(
      createElement(HaloHarness, { initialHaloMode: true, imageBlurhash: null }),
    );

    expect(markup).not.toContain("https://cdn.example.test/event.webp");
    expect(markup).not.toContain("video-one");
    expect(markup).toContain("헤일로 모드가 켜져있어요");
  });

  it("keeps the source image out of halo mode even after the viewer starts playback", () => {
    const { container } = render(createElement(HaloHarness, { initialHaloMode: true, imageBlurhash: null }));

    expect(screen.queryByTestId("youtube")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "동영상 재생" }));
    expect(screen.getByTestId("youtube")).not.toBeNull();
    expect(container.innerHTML).not.toContain("https://cdn.example.test/event.webp");
  });

  it("stops playback when halo mode is enabled", () => {
    render(createElement(HaloHarness, { initialHaloMode: false, imageBlurhash: null }));

    fireEvent.click(screen.getByRole("button", { name: "첫 번째 영상" }));
    fireEvent.click(screen.getByRole("button", { name: "준비" }));
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    act(() => fireEvent.click(screen.getByRole("button", { name: "toggle halo mode" })));

    expect(mockPlayer.stopVideo).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("youtube")).toBeNull();
    expect(screen.getByRole("button", { name: "동영상 재생" })).not.toBeNull();
  });
});

function HaloHarness({ initialHaloMode, imageBlurhash }: { initialHaloMode: boolean; imageBlurhash: string | null }) {
  const [haloMode, setHaloMode] = useState(initialHaloMode);
  return createElement(
    HaloModeProvider,
    { value: { haloMode, setHaloMode } },
    createElement("button", { type: "button", onClick: () => setHaloMode((enabled) => !enabled) }, "toggle halo mode"),
    createElement(EventHero, {
      imageUrl: "https://cdn.example.test/event.webp",
      imageBlurhash,
      name: "Event",
      type: "event",
      runType: "first",
      since: "2030-01-10T00:00:00.000Z" as never,
      until: "2030-01-20T00:00:00.000Z" as never,
      endless: false,
      videos,
    }),
  );
}
