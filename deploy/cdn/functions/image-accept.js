// Collapses the viewer's Accept header to the two values the image transform
// cache key distinguishes. Cloudflare returns WebP for `image/webp` and the
// source format for anything else, so browsers that never advertise WebP keep
// receiving JPEG/PNG from their own cache entry.
function handler(event) {
  var request = event.request;
  var accept = request.headers.accept ? request.headers.accept.value : "";

  request.headers.accept = {
    value: accept.indexOf("image/webp") !== -1 ? "image/webp" : "*/*",
  };

  return request;
}
