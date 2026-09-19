import { describe, expect, it, jest } from "@jest/globals";
import {
  getRecruitmentOpinionTutorialDismissalAction,
  isRecruitmentOpinionTutorialDismissedForCurrentVisit,
  isRecruitmentOpinionTutorialEligible,
  notifyRecruitmentOpinionTutorialDismissed,
  subscribeToRecruitmentOpinionTutorialDismissal,
} from "~/components/features/contents/recruitment-opinion-tutorial";

describe("recruitment opinion tutorial", () => {
  it("uses recruitment activity as the eligibility boundary while preserving suppressions", () => {
    const eligible = {
      hideRecruitmentOpinions: false,
      contentType: "event",
      tutorialDismissalLoaded: true,
      tutorialDismissed: false,
      recruitmentActive: true,
    };

    expect(isRecruitmentOpinionTutorialEligible(eligible)).toBe(true);
    expect(isRecruitmentOpinionTutorialEligible({ ...eligible, hideRecruitmentOpinions: true })).toBe(false);
    expect(isRecruitmentOpinionTutorialEligible({ ...eligible, contentType: "live" })).toBe(false);
    expect(isRecruitmentOpinionTutorialEligible({ ...eligible, tutorialDismissed: true })).toBe(false);
    expect(isRecruitmentOpinionTutorialEligible({ ...eligible, recruitmentActive: false })).toBe(false);
  });

  it("notifies every mounted item through a same-tab dismissal event", () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const browserWindow = new EventTarget();
    Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow });
    const firstItem = jest.fn();
    const secondItem = jest.fn();
    const unsubscribeFirst = subscribeToRecruitmentOpinionTutorialDismissal(firstItem);
    const unsubscribeSecond = subscribeToRecruitmentOpinionTutorialDismissal(secondItem);

    notifyRecruitmentOpinionTutorialDismissed();

    expect(firstItem).toHaveBeenCalledTimes(1);
    expect(secondItem).toHaveBeenCalledTimes(1);
    expect(isRecruitmentOpinionTutorialDismissedForCurrentVisit()).toBe(true);

    unsubscribeFirst();
    unsubscribeSecond();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  it("keeps the comment sheet open for an explicit dismiss and closes it for settings", () => {
    expect(getRecruitmentOpinionTutorialDismissalAction(false)).toEqual({
      closeCommentSheet: false,
      openFilter: false,
      focusCommentEditor: true,
    });
    expect(getRecruitmentOpinionTutorialDismissalAction(true)).toEqual({
      closeCommentSheet: true,
      openFilter: true,
      focusCommentEditor: false,
    });
  });
});
