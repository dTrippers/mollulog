import { describe, expect, it } from "@jest/globals";
import { sortByCreatedAt } from "~/components/v2/features/comments/CommentThread";

describe("sortByCreatedAt", () => {
  it("orders replies oldest first, as the 1.x subcomments were", () => {
    const replies = [
      { id: "later", createdAt: "2026-10-15T03:00:00.000Z" },
      { id: "earlier", createdAt: "2026-10-14T03:00:00.000Z" },
      { id: "middle", createdAt: "2026-10-14T12:00:00.000Z" },
    ];

    expect(sortByCreatedAt(replies).map((reply) => reply.id)).toEqual(["earlier", "middle", "later"]);
  });

  it("does not reorder the input array", () => {
    const replies = [
      { id: "later", createdAt: "2026-10-15T03:00:00.000Z" },
      { id: "earlier", createdAt: "2026-10-14T03:00:00.000Z" },
    ];

    sortByCreatedAt(replies);

    expect(replies.map((reply) => reply.id)).toEqual(["later", "earlier"]);
  });
});
