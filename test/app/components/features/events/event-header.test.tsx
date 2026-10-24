/** @jest-environment jsdom */
import "../../v2/layout/layout-test-polyfills";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { useState } from "react";
import { HaloModeProvider } from "~/contexts/HaloModeContext";
import EventHeader from "~/components/features/events/EventHeader";

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: jest.fn(),
  });
});

jest.mock("react-youtube", () => {
  const React = require("react");
  const player = { getDuration: () => 120, mute() {}, unMute() {}, setVolume() {}, stopVideo() {} };
  return {
    __esModule: true,
    default: ({
      onPlay,
      onEnd,
    }: {
      onPlay: (event: { target: typeof player }) => void;
      onEnd: () => void;
    }) =>
      React.createElement(
        "div",
        null,
        React.createElement("button", {
          type: "button",
          "data-testid": "youtube-player",
          onClick: () => onPlay({ target: player }),
        }),
        React.createElement("button", { type: "button", "data-testid": "youtube-end", onClick: onEnd }),
      ),
  };
});

function EventHeaderHarness({ initialHaloMode }: { initialHaloMode: boolean }) {
  const [haloMode, setHaloMode] = useState(initialHaloMode);
  return (
    <HaloModeProvider value={{ haloMode, setHaloMode }}>
      <button type="button" onClick={() => setHaloMode((enabled) => !enabled)}>
        toggle halo mode
      </button>
      <EventHeader
        imageUrl="https://cdn.example.test/event.webp"
        name="Event"
        type="event"
        runType="first"
        since="2026-10-20T00:00:00.000Z"
        until="2026-10-30T00:00:00.000Z"
        endless={false}
        videos={[{ title: "Trailer", youtube: "video-id", start: null }]}
      />
    </HaloModeProvider>
  );
}

describe("EventHeader video and halo behavior", () => {
  it("omits the source image and YouTube player from halo-mode SSR", () => {
    const markup = renderToStaticMarkup(<EventHeaderHarness initialHaloMode />);

    expect(markup).not.toContain("https://cdn.example.test/event.webp");
    expect(markup).not.toContain("video-id");
    expect(markup).toContain("헤일로 모드가 켜져있어요");
  });

  it("does not render the source image or player in halo mode until the user asks to play", () => {
    const { container } = render(<EventHeaderHarness initialHaloMode />);

    expect(screen.queryByTestId("youtube-player")).toBeNull();
    expect(container.innerHTML).not.toContain("https://cdn.example.test/event.webp");
    const notice = screen.getByTitle("헤일로 모드가 켜져있어요");
    const noticeLayer = notice.parentElement;
    expect(notice.className).toContain("pointer-events-auto");
    expect(noticeLayer?.className).toContain("pointer-events-none");
    expect(noticeLayer?.className).toContain("inset-0");
    expect(noticeLayer?.className).toContain("items-center");
    expect(noticeLayer?.className).toContain("justify-center");
    expect(noticeLayer?.className).not.toContain("bottom-[40%]");
    expect(noticeLayer?.parentElement).toBe(container.querySelector(".relative.overflow-hidden.rounded-lg"));
    expect(screen.getByRole("button", { name: "영상 재생" }).parentElement?.className).toContain("z-20");

    fireEvent.click(screen.getByRole("button", { name: "영상 재생" }));
    expect(screen.getByTestId("youtube-player")).not.toBeNull();
    expect(container.innerHTML).not.toContain("https://cdn.example.test/event.webp");
  });

  it("hides the blurhash while the video plays and restores it when playback ends", () => {
    const { container } = render(<EventHeaderHarness initialHaloMode />);
    const blurhashLayer = () => container.querySelector("canvas")?.parentElement;

    expect(blurhashLayer()?.className).toContain("opacity-100");
    fireEvent.click(screen.getByRole("button", { name: "영상 재생" }));
    fireEvent.click(screen.getByTestId("youtube-player"));
    expect(blurhashLayer()?.className).toContain("opacity-0");

    fireEvent.click(screen.getByTestId("youtube-end"));
    expect(blurhashLayer()?.className).toContain("opacity-100");
  });

  it("starts videos from the list and removes playback when halo mode is enabled", () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    render(<EventHeaderHarness initialHaloMode={false} />);

    expect(screen.queryByTestId("youtube-player")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Trailer" }));
    expect(screen.getByTestId("youtube-player")).not.toBeNull();
    fireEvent.click(screen.getByTestId("youtube-player"));

    act(() => fireEvent.click(screen.getByRole("button", { name: "toggle halo mode" })));

    expect(screen.queryByTestId("youtube-player")).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
