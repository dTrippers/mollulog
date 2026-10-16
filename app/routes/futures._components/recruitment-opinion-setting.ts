import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { RecruitmentOpinionSettingView } from "~/components/v2/features/comments/RecruitmentOpinionToggle";

// The response of /api/account/recruitment-opinions.
type RecruitmentOpinionSettingResponse = { ok: true; hideRecruitmentOpinions: boolean } | { ok: false; error?: string };

// Owns the save of the 모집 결과 숨기기 setting. The route calls it, above the filter panel, so the save and its outcome
// survive the panel remounting between the aside and the stacked sheet. A saved value is applied and reported through
// onSaved. A failed save reverts to the last saved value and shows the error. A signed-out toggle opens sign-in instead.
export function useRecruitmentOpinionSetting({
  initialValue,
  signedIn,
  onSaved,
  onSignedOut,
}: {
  initialValue: boolean;
  signedIn: boolean;
  onSaved: (value: boolean) => void;
  onSignedOut: () => void;
}): RecruitmentOpinionSettingView {
  const fetcher = useFetcher<RecruitmentOpinionSettingResponse>();
  const [value, setValue] = useState(initialValue);
  const [committedValue, setCommittedValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const saving = fetcher.state !== "idle";

  // Follows the loader's value while no save is pending.
  useEffect(() => {
    if (fetcher.state !== "idle" || pendingRef.current) return;
    setValue(initialValue);
    setCommittedValue(initialValue);
  }, [fetcher.state, initialValue]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !pendingRef.current) return;
    pendingRef.current = false;
    const response = fetcher.data;
    if (response?.ok) {
      setValue(response.hideRecruitmentOpinions);
      setCommittedValue(response.hideRecruitmentOpinions);
      setError(null);
      onSaved(response.hideRecruitmentOpinions);
      return;
    }
    setValue(committedValue);
    setError(response?.error ?? "설정을 저장하지 못했어요.");
  }, [committedValue, fetcher.data, fetcher.state, onSaved]);

  const toggle = (next: boolean) => {
    if (!signedIn) {
      onSignedOut();
      return;
    }
    setError(null);
    setValue(next);
    pendingRef.current = true;
    fetcher.submit(
      { hideRecruitmentOpinions: next },
      { action: "/api/account/recruitment-opinions", method: "post", encType: "application/json" },
    );
  };

  return { value, saving, saved: !saving && fetcher.data?.ok === true, error, toggle };
}
