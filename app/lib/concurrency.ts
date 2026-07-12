export type ConcurrencyGate = <T>(task: () => Promise<T>) => Promise<T>;

function validateConcurrency(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Concurrency must be a positive integer: ${concurrency}`);
  }
}

export function createConcurrencyGate(concurrency: number): ConcurrencyGate {
  validateConcurrency(concurrency);

  let activeCount = 0;
  const waiters: Array<() => void> = [];

  return async function runWithConcurrencyGate<T>(task: () => Promise<T>): Promise<T> {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    } else {
      activeCount += 1;
    }

    try {
      return await task();
    } finally {
      const next = waiters.shift();
      if (next) {
        next();
      } else {
        activeCount -= 1;
      }
    }
  };
}

export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  validateConcurrency(concurrency);

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
