import { describe, expect, it } from "@jest/globals";
import {
  getCommentEditorPanelClassName,
  getCommentToggleClassName,
  getCommunityFeedClassName,
  getCommunityPostBodyOrder,
  getCommunityPostCardClassName,
  getGroupedAvatarPlaceholderClassName,
  getPickupStudentNameClassName,
  getSubjectMetaClassName,
  shouldGroupPostWithPrevious,
} from "../../../../../app/components/features/community/community-feed-presentation";

describe("CommunityFeed presentation", () => {
  it("shows event opinion subject metadata after the category header and before the body", () => {
    expect(getCommunityPostBodyOrder("event_opinion")).toEqual(["subject", "content"]);
  });

  it("shows student review subject metadata after the category header and before the body", () => {
    expect(getCommunityPostBodyOrder("student_review")).toEqual(["subject", "content"]);
  });

  it("keeps the comment toggle visibly button-like with a neutral active state", () => {
    expect(getCommentToggleClassName({ active: false })).toContain("border");
    expect(getCommentToggleClassName({ active: false })).toContain("bg-neutral-100");
    expect(getCommentToggleClassName({ active: false })).toContain("dark:bg-neutral-800");
    expect(getCommentToggleClassName({ active: false })).toContain("dark:border-neutral-700");
    expect(getCommentToggleClassName({ active: false })).toContain("dark:hover:bg-neutral-700");
    expect(getCommentToggleClassName({ active: true })).toContain("bg-neutral-200");
    expect(getCommentToggleClassName({ active: true })).not.toContain("bg-blue");
  });

  it("uses a visible dark hover treatment and separates the open comment panel", () => {
    expect(getCommunityPostCardClassName({ preview: false })).toContain("dark:hover:bg-neutral-700/40");
    expect(getCommentEditorPanelClassName()).toContain("border");
    expect(getCommentEditorPanelClassName()).toContain("bg-white");
    expect(getCommentEditorPanelClassName()).toContain("dark:bg-neutral-900");
  });

  it("keeps subject metadata as a separate low-emphasis row instead of compressed body text", () => {
    expect(getSubjectMetaClassName("event_opinion")).toContain("space-y-1");
    expect(getSubjectMetaClassName("event_opinion")).toContain("text-xs");
    expect(getSubjectMetaClassName("event_opinion")).toContain("text-neutral-500");
    expect(getSubjectMetaClassName("student_review")).toContain("text-xs");
  });

  it("hides pickup student names visually while preserving link labels", () => {
    expect(getPickupStudentNameClassName()).toContain("sr-only");
  });

  it("groups immediately consecutive posts from the same author and post type", () => {
    const previousPost = { author: { username: "red_archive" }, postType: "event_opinion" as const };

    expect(shouldGroupPostWithPrevious({ author: { username: "red_archive" }, postType: "event_opinion" }, previousPost)).toBe(true);
    expect(shouldGroupPostWithPrevious({ author: { username: "red_archive" }, postType: "student_review" }, previousPost)).toBe(false);
    expect(shouldGroupPostWithPrevious({ author: { username: "other" }, postType: "event_opinion" }, previousPost)).toBe(false);
    expect(shouldGroupPostWithPrevious({ author: { username: "red_archive" }, postType: "event_opinion" }, undefined)).toBe(false);
  });

  it("keeps grouped posts inside the previous author's visual column", () => {
    expect(getCommunityFeedClassName({ preview: false })).not.toContain("divide-y");
    expect(getCommunityPostCardClassName({ preview: false, firstInFeed: false, groupedWithPrevious: false })).toContain("border-t");
    expect(getCommunityPostCardClassName({ preview: false, firstInFeed: false, groupedWithPrevious: true })).not.toContain("border-t");
    expect(getCommunityPostCardClassName({ preview: false, firstInFeed: false, groupedWithPrevious: true })).toContain("px-4");
    expect(getCommunityPostCardClassName({ preview: false, firstInFeed: false, groupedWithPrevious: true })).not.toContain("pl-16");
    expect(getGroupedAvatarPlaceholderClassName()).toContain("size-10");
    expect(getCommentEditorPanelClassName({ groupedWithPrevious: false })).toContain("sm:ml-[52px]");
    expect(getCommentEditorPanelClassName({ groupedWithPrevious: true })).not.toContain("sm:ml-[52px]");
  });
});
