import { describe, expect, it } from "@jest/globals";
import { createLatestSaveQueue } from "~/lib/latest-save-queue";

function deferredSender() {
  const sent: string[] = [];
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const send = (value: string) =>
    new Promise<void>((resolve, reject) => {
      sent.push(value);
      pending.push({ resolve, reject });
    });
  const settle = async (outcome: "resolve" | "reject" = "resolve") => {
    const next = pending.shift();
    if (!next) throw new Error("No save is in flight.");
    if (outcome === "resolve") next.resolve();
    else next.reject(new Error("failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { sent, send, settle, inFlight: () => pending.length };
}

describe("latest save queue", () => {
  it("sends one save at a time and only the latest waiting value", async () => {
    const sender = deferredSender();
    const queue = createLatestSaveQueue(sender.send);

    queue.save("platinum");
    queue.save("newbie");
    queue.save("top");

    expect(sender.sent).toEqual(["platinum"]);
    expect(queue.hasWaiting()).toBe(true);

    await sender.settle();
    expect(sender.sent).toEqual(["platinum", "top"]);
    expect(queue.hasWaiting()).toBe(false);

    await sender.settle();
    expect(sender.inFlight()).toBe(0);
  });

  it("does not send again the value in flight, and drops a value waiting behind it", async () => {
    const sender = deferredSender();
    const queue = createLatestSaveQueue(sender.send);

    queue.save("platinum");
    queue.save("newbie");
    queue.save("platinum");
    await sender.settle();

    expect(sender.sent).toEqual(["platinum"]);
    expect(sender.inFlight()).toBe(0);
  });

  it("keeps sending after a failed save", async () => {
    const sender = deferredSender();
    const queue = createLatestSaveQueue(sender.send);

    queue.save("platinum");
    queue.save("newbie");
    await sender.settle("reject");
    expect(sender.sent).toEqual(["platinum", "newbie"]);

    await sender.settle();
    queue.save("top");
    expect(sender.sent).toEqual(["platinum", "newbie", "top"]);
  });
});
