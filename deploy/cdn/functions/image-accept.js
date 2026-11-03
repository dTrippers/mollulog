// Collapses the viewer's Accept header to the two values the image transform
// cache key distinguishes. Cloudflare returns WebP for `image/webp` and the
// source format for anything else, so browsers that never advertise WebP keep
// receiving JPEG/PNG from their own cache entry.
function acceptsWebp(accept) {
  return accept.split(",").some(function (range) {
    var params = range.split(";");
    if (params[0].trim().toLowerCase() !== "image/webp") return false;
    for (var i = 1; i < params.length; i++) {
      var pair = params[i].split("=");
      if (pair[0].trim().toLowerCase() === "q") return parseFloat(pair[1]) > 0;
    }
    return true;
  });
}

function handler(event) {
  var request = event.request;
  var header = request.headers.accept;
  var accept = "";
  if (header) {
    accept = header.multiValue
      ? header.multiValue.map(function (entry) { return entry.value; }).join(",")
      : header.value;
  }

  request.headers.accept = { value: acceptsWebp(accept) ? "image/webp" : "*/*" };

  return request;
}
