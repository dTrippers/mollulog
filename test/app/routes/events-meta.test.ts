import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub, type MetaFunction, Outlet } from "react-router";
import { DEFAULT_OPEN_GRAPH_IMAGE_URL } from "~/lib/seo";
import { Layout } from "~/root";
import { meta as eventMeta, handle as eventRouteHandle } from "~/routes/events.$uid._index";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/auth/preference.server", () => ({ getPreference: jest.fn() }));
jest.mock("~/components/features/auth/discord-signin-feedback", () => ({}));
jest.mock("~/components/features/events", () => ({}));
jest.mock("~/components/features/layout", () => ({}));
jest.mock("~/components/primitives", () => ({}));
jest.mock("~/contexts/SignInProvider", () => ({}));
jest.mock("~/contexts/StudentCardPopupProvider", () => ({}));
jest.mock("~/contexts/TimeZoneProvider", () => ({}));
jest.mock("~/domain/recruitment-identity", () => ({}));
jest.mock("~/domain/recruitment-period-notice", () => ({}));
jest.mock("~/lib/google-analytics.client", () => ({}));
jest.mock("~/lib/observability.client", () => ({}));
jest.mock("~/lib/observability.server", () => ({}));
jest.mock("~/lib/seo-crawler", () => ({ isGoogleSearchCrawler: () => false, isSenseiProfilePath: () => false }));
jest.mock("~/models/content.server", () => ({}));
jest.mock("~/models/favorite-students", () => ({}));
jest.mock("~/models/post", () => ({}));
jest.mock("~/models/recruitment", () => ({}));
jest.mock("~/models/timeline-content.server", () => ({}));
jest.mock("~/views/navigation", () => ({}));
jest.mock("~/views/site-banner", () => ({}));
jest.mock("react-top-loading-bar", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../app/tailwind.css?url", () => "tailwind.css", { virtual: true });
jest.mock("../../../app/routes/events.$uid._components/EventComment", () => () => null);

function RootLayoutRoute() {
  return createElement(Layout, null, createElement(Outlet));
}

function renderDocumentHead(
  pathname: string,
  imageUrl: string | null = "https://cdn.example.test/event.png",
  hasEventDetailMetadata = true,
) {
  const eventLoaderData = hasEventDetailMetadata
    ? {
        eventContent: {
          name: "이벤트",
          type: "event",
          imageUrl,
        },
      }
    : null;
  const rootLoaderData = {
    darkMode: true,
    siteBanner: null,
    publicEnv: { STAGE: "local", FRONT_SENTRY_DSN: "" },
    requestDiagnostics: { renderId: "test", requestPath: pathname, buildId: "test" },
    staticCrawlerResponse: true,
  };
  const RoutesStub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => rootLoaderData,
      Component: RootLayoutRoute,
      children: [
        {
          id: "event-detail",
          path: "events/:uid",
          loader: () => eventLoaderData,
          handle: eventRouteHandle,
          meta: eventMeta as unknown as MetaFunction,
          Component: () => null,
        },
        {
          id: "other-page",
          path: "*",
          Component: () => null,
        },
      ],
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [pathname],
      hydrationData: { loaderData: { root: rootLoaderData, "event-detail": eventLoaderData } },
    }),
  );
}

function openGraphImageTags(head: string) {
  return head.match(/<meta(?=[^>]*property="og:image")[^>]*>/g) ?? [];
}

describe("event detail Open Graph image metadata", () => {
  it("renders the event image exactly once", () => {
    const head = renderDocumentHead("/events/event-1", "https://cdn.example.test/event.png");
    const images = openGraphImageTags(head);

    expect(images).toHaveLength(1);
    expect(images[0]).toContain('content="https://cdn.example.test/event.png"');
  });

  it("renders the default image exactly once when the event image is absent", () => {
    const head = renderDocumentHead("/events/event-1", null);
    const images = openGraphImageTags(head);

    expect(images).toHaveLength(1);
    expect(images[0]).toContain(`content="${DEFAULT_OPEN_GRAPH_IMAGE_URL}"`);
    expect(images[0]).toMatch(/content="[^"]+"/);
  });

  it("keeps the default image on general pages and omits it on excluded paths", () => {
    const generalPageHead = renderDocumentHead("/futures");
    expect(openGraphImageTags(generalPageHead)).toEqual([
      `<meta property="og:image" content="${DEFAULT_OPEN_GRAPH_IMAGE_URL}"/>`,
    ]);

    expect(openGraphImageTags(renderDocumentHead("/security-campaign"))).toEqual([]);
    expect(openGraphImageTags(renderDocumentHead("/letter/shared"))).toEqual([]);
  });

  it("keeps the default image on event subpages", () => {
    const head = renderDocumentHead("/events/event-1/shop");

    expect(openGraphImageTags(head)).toEqual([`<meta property="og:image" content="${DEFAULT_OPEN_GRAPH_IMAGE_URL}"/>`]);
  });

  it("keeps the default image when event detail metadata is unavailable", () => {
    const head = renderDocumentHead("/events/missing-event", null, false);

    expect(openGraphImageTags(head)).toEqual([`<meta property="og:image" content="${DEFAULT_OPEN_GRAPH_IMAGE_URL}"/>`]);
  });
});
