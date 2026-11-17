import { useCallback, useState } from "react";
import { excludeDismissedSiteBanner, type SiteBanner } from "~/domain/site-banner";
import type { PreferenceSubmission } from "~/auth/preference.server";
import { submitPreference } from "~/lib/preference-submission.client";

type SubmitPreference = (preference: PreferenceSubmission) => Promise<unknown>;

// Hides a dismissed banner right away; the root loader drops it on later requests once the preference cookie is
// saved. If saving fails, the banner comes back so the visitor can see the close did not stick and try again.
export function useSiteBannerDismissal(loadedBanner: SiteBanner | null, submit: SubmitPreference = submitPreference) {
  const [dismissedUids, setDismissedUids] = useState<string[]>([]);

  const dismissSiteBanner = useCallback(
    (uid: string) => {
      setDismissedUids((current) => (current.includes(uid) ? current : [...current, uid]));
      submit({ dismissedSiteBannerUid: uid }).catch(() => {
        setDismissedUids((current) => current.filter((dismissedUid) => dismissedUid !== uid));
      });
    },
    [submit],
  );

  return { siteBanner: excludeDismissedSiteBanner(loadedBanner, dismissedUids), dismissSiteBanner };
}
