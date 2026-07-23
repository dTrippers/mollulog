import FeatureFeedbackButton from "~/components/features/feedback/FeatureFeedbackButton";

export function WalkthroughTimelineFeedbackButton({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) return null;

  return <FeatureFeedbackButton featureName="공략 타임라인" feedbackType="walkthrough_timeline_feedback" />;
}
