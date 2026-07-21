export type RequestDiagnostics = {
  renderId: string;
  requestPath: string;
  cloudFrontRequestId: string | null;
  cloudflareRayId: string | null;
  buildId: string;
};

export function createRequestDiagnostics(
  request: Request,
  buildId: string,
  renderId: string = crypto.randomUUID(),
): RequestDiagnostics {
  return {
    renderId,
    requestPath: new URL(request.url).pathname,
    cloudFrontRequestId: request.headers.get("x-amz-cf-id"),
    cloudflareRayId: request.headers.get("cf-ray"),
    buildId,
  };
}
