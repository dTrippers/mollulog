const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function formatKeyExpiryRemaining(expiresAt: string, now: number): string {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return "만료됨";
  if (remainingMs < HOUR_MS) return "1시간 미만 남음";
  if (remainingMs <= DAY_MS) return `${Math.ceil(remainingMs / HOUR_MS)}시간 남음`;
  return `${Math.ceil(remainingMs / DAY_MS)}일 남음`;
}
