export const recruitmentOpinionTutorialStorageKey = "mllg:feature:recruitment-opinion-filter:v1";
export const recruitmentOpinionTutorialDismissedEvent = "mllg:recruitment-opinion-tutorial-dismissed";
let dismissedForCurrentVisit = false;

export function isRecruitmentOpinionTutorialEligible({
  hideRecruitmentOpinions,
  contentType,
  tutorialDismissalLoaded,
  tutorialDismissed,
  recruitmentActive,
}: {
  hideRecruitmentOpinions: boolean;
  contentType: string;
  tutorialDismissalLoaded: boolean;
  tutorialDismissed: boolean;
  recruitmentActive: boolean;
}) {
  return (
    !hideRecruitmentOpinions &&
    contentType !== "live" &&
    tutorialDismissalLoaded &&
    !tutorialDismissed &&
    recruitmentActive
  );
}

export function getRecruitmentOpinionTutorialDismissalAction(openFilter: boolean) {
  return openFilter
    ? { closeCommentSheet: true, openFilter: true, focusCommentEditor: false }
    : { closeCommentSheet: false, openFilter: false, focusCommentEditor: true };
}

export function isRecruitmentOpinionTutorialDismissedForCurrentVisit() {
  return dismissedForCurrentVisit;
}

export function notifyRecruitmentOpinionTutorialDismissed() {
  dismissedForCurrentVisit = true;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(recruitmentOpinionTutorialDismissedEvent));
}

export function subscribeToRecruitmentOpinionTutorialDismissal(onDismiss: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleDismissal = () => onDismiss();
  window.addEventListener(recruitmentOpinionTutorialDismissedEvent, handleDismissal);
  return () => window.removeEventListener(recruitmentOpinionTutorialDismissedEvent, handleDismissal);
}
