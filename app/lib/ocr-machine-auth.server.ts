const encoder = new TextEncoder();

export async function isAuthorizedOcrMachineRequest(request: Request, env: Env): Promise<boolean> {
  const expected = env.OCR_WORKER_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const actual = authorization.slice("Bearer ".length);
  const [actualHash, expectedHash] = await Promise.all([sha256(actual), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) difference |= actualHash[index] ^ expectedHash[index];
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
