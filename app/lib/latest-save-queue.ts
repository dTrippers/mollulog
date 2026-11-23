/**
 * Sends one save at a time. A value saved while another is in flight waits, and a later value replaces it, so the last
 * value is the last one sent. A value equal to the one in flight is not sent again.
 *
 * The queue keeps no tie to a component: created at module scope, a value still waiting when its page unmounts is sent
 * once the save in flight ends. `send` reports its own failures; a rejected send does not stop the queue.
 */
export function createLatestSaveQueue<T>(send: (value: T) => Promise<unknown>) {
  let sending: { value: T } | null = null;
  let waiting: { value: T } | null = null;

  async function drain() {
    while (waiting !== null) {
      sending = waiting;
      waiting = null;
      try {
        await send(sending.value);
      } catch {
        // The sender shows its own failure.
      }
    }
    sending = null;
  }

  return {
    save(value: T) {
      if (sending !== null && Object.is(sending.value, value)) {
        waiting = null;
        return;
      }
      waiting = { value };
      if (sending === null) void drain();
    },
    /** Whether a value waits for the save in flight. Its result decides nothing until the waiting value is sent. */
    hasWaiting() {
      return waiting !== null;
    },
  };
}
