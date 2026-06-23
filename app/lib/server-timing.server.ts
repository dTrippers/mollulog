/**
 * Lightweight Server-Timing collector for loader phase measurement.
 *
 * Wrap each awaited phase with `measure()` to record its wall-clock duration,
 * then emit the result as a `Server-Timing` response header (visible in the
 * browser devtools Network tab, alongside Cloudflare's own `cfWorker`/`cfEdge`
 * entries) and/or as a structured metrics object for log aggregation.
 *
 * Workers timing note: in the Workers runtime `Date.now()` only advances across
 * I/O boundaries, which is exactly what we want here — every phase wraps an
 * awaited I/O call, so the measured delta reflects real wait time. Pure-CPU
 * sections may read as 0, which is acceptable because CPU is not the suspect.
 */
export class ServerTiming {
  private readonly marks: { name: string; dur: number; desc?: string }[] = [];

  async measure<T>(name: string, fn: () => Promise<T>, desc?: string): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.marks.push({ name, dur: Date.now() - start, desc });
    }
  }

  add(name: string, dur: number, desc?: string): void {
    this.marks.push({ name, dur, desc });
  }

  /** `Server-Timing` header value, e.g. `auth;dur=2, index_contents;dur=812`. */
  header(): string {
    return this.marks
      .map(({ name, dur, desc }) => {
        const parts = [name];
        if (desc) {
          parts.push(`desc=${JSON.stringify(desc)}`);
        }
        parts.push(`dur=${dur}`);
        return parts.join(";");
      })
      .join(", ");
  }

  /** Flat `{ phase: ms }` map for structured logging / aggregation. */
  toMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};
    for (const { name, dur } of this.marks) {
      metrics[name] = dur;
    }
    return metrics;
  }
}

/**
 * Sample rate for emitting structured `loader_timing` logs to BetterStack. The
 * `Server-Timing` response header is always set; only the aggregation log is
 * sampled, to keep log volume bounded on high-traffic routes.
 */
export const TIMING_LOG_SAMPLE_RATE = 0.2;

export function shouldLogTiming(rate: number = TIMING_LOG_SAMPLE_RATE): boolean {
  return Math.random() < rate;
}
