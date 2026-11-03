import { describe, expect, it } from "@jest/globals";
import { uploadedImageProps, uploadedImageUrl } from "~/models/assets";

const TIMELINE_IMAGE = "https://assets.mollulog.net/assets/images/timeline/ibukis-runaway.jpg";
const COUPON_IMAGE = "https://assets.mollulog.net/assets/images/coupons/n9HWGhQc.png";
const EVENT_IMAGE = "https://assets.mollulog.net/assets/images/events/highlander.jpg";

function transformUrl(width: number, url: string): string {
  return `https://mollulog.net/cdn-cgi/image/width=${width},fit=scale-down,format=webp,onerror=redirect/${url}`;
}

describe("uploadedImageUrl", () => {
  it("routes event, timeline, and coupon images through the image transform", () => {
    expect(uploadedImageUrl(EVENT_IMAGE, 640)).toBe(transformUrl(640, EVENT_IMAGE));
    expect(uploadedImageUrl(TIMELINE_IMAGE, 192)).toBe(transformUrl(192, TIMELINE_IMAGE));
    expect(uploadedImageUrl(COUPON_IMAGE, 1920)).toBe(transformUrl(1920, COUPON_IMAGE));
  });

  it.each([
    ["GIF upload", "https://assets.mollulog.net/assets/images/coupons/anim.GIF"],
    ["other asset directory", "https://assets.mollulog.net/assets/images/boss/binah"],
    ["board image", "https://assets.mollulog.net/assets/images/board/notice.png"],
    ["BAQL asset", "https://assets.baql.net/images/events/icon/event_kr.webp"],
    ["external URL", "https://pbs.twimg.com/media/example.jpg"],
    ["URL with a query", `${TIMELINE_IMAGE}?v=2`],
    ["lookalike host", "https://assets.mollulog.net.example.com/assets/images/timeline/a.jpg"],
  ])("keeps the original URL for a %s", (_, url) => {
    expect(uploadedImageUrl(url, 192)).toBe(url);
    expect(uploadedImageProps(url, "48px")).toEqual({ src: url });
  });
});

describe("uploadedImageProps", () => {
  it("offers every transform width with the rendered size", () => {
    expect(uploadedImageProps(TIMELINE_IMAGE, "(min-width: 768px) 86px, 64px")).toEqual({
      src: transformUrl(640, TIMELINE_IMAGE),
      srcSet: [192, 640, 1280, 1920].map((width) => `${transformUrl(width, TIMELINE_IMAGE)} ${width}w`).join(", "),
      sizes: "(min-width: 768px) 86px, 64px",
    });
  });
});
