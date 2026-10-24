import "../../v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import EventList from "~/components/features/events/EventList";
import { HaloModeProvider } from "~/contexts/HaloModeContext";

const TIMELINE_IMAGE_BLURHASH = "YEB:Ny3VWp-pA==|A==|@BEla|rxSMrxN]w5dxeqfQeqfQeqfQeq_LF_a|t7SMt7N]xa";

const events = [
  {
    uid: "timeline-event",
    name: "Timeline event",
    type: "event" as const,
    since: "2026-10-20T00:00:00.000Z",
    until: "2026-10-30T00:00:00.000Z",
    imageUrl: "https://cdn.example.test/catalog-logo.webp",
    imageSource: "catalog" as const,
    timelineImageUrl: "https://cdn.example.test/timeline.webp",
    timelineImageBlurhash: TIMELINE_IMAGE_BLURHASH,
  },
  {
    uid: "catalog-event",
    name: "Catalog event",
    type: "event" as const,
    since: "2026-10-20T00:00:00.000Z",
    until: "2026-10-30T00:00:00.000Z",
    imageUrl: "https://cdn.example.test/catalog-only-logo.webp",
    imageSource: "catalog" as const,
  },
];

describe("EventList halo mode", () => {
  it("suppresses timeline images while preserving catalog logos", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HaloModeProvider value={{ haloMode: true, setHaloMode: () => {} }}>
          <EventList events={events} />
        </HaloModeProvider>
      </MemoryRouter>,
    );

    expect(markup).not.toContain("https://cdn.example.test/timeline.webp");
    expect(markup).toContain("https://cdn.example.test/catalog-only-logo.webp");
    expect(markup).toContain("헤일로 모드가 켜져있어요");
    expect(markup).toContain("absolute inset-0 z-10 flex items-center justify-center p-1");
  });
});
