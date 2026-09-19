import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Toggle } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";

type SettingResponse = { ok: true; hideRecruitmentOpinions: boolean } | { ok: false; error?: string };

type RecruitmentOpinionSettingProps = {
  initialState: boolean;
  signedIn: boolean;
  onValueChange?: (value: boolean) => void;
  onSaved?: (value: boolean) => void;
  onSignedOutToggle?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
};

export default function RecruitmentOpinionSetting({
  initialState,
  signedIn,
  onValueChange,
  onSaved,
  onSignedOutToggle,
  autoFocus = false,
  compact = false,
}: RecruitmentOpinionSettingProps) {
  const fetcher = useFetcher<SettingResponse>();
  const { showSignIn } = useSignIn();
  const [value, setValue] = useState(initialState);
  const [committedValue, setCommittedValue] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const pendingValueRef = useRef<boolean | null>(null);
  const generatedId = useId();
  const controlId = `hide-recruitment-opinions-${generatedId}`;
  const descriptionId = `${controlId}-description`;

  useEffect(() => {
    if (fetcher.state !== "idle" || pendingValueRef.current !== null) return;
    setValue(initialState);
    setCommittedValue(initialState);
  }, [fetcher.state, initialState]);

  useEffect(() => {
    if (fetcher.state !== "idle" || pendingValueRef.current === null) return;
    const pendingValue = pendingValueRef.current;
    pendingValueRef.current = null;
    const response = fetcher.data;
    if (response?.ok) {
      setValue(response.hideRecruitmentOpinions);
      setCommittedValue(response.hideRecruitmentOpinions);
      setError(null);
      onValueChange?.(response.hideRecruitmentOpinions);
      onSaved?.(response.hideRecruitmentOpinions);
      return;
    }

    setValue(committedValue);
    onValueChange?.(committedValue);
    setError(response?.error ?? "설정을 저장하지 못했어요.");
    void pendingValue;
  }, [committedValue, fetcher.data, fetcher.state, onSaved, onValueChange]);

  useEffect(() => {
    if (!autoFocus) return;
    const frameId = window.requestAnimationFrame(() => document.getElementById(controlId)?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [autoFocus, controlId]);

  const handleChange = (nextValue: boolean) => {
    setError(null);
    setValue(nextValue);
    onValueChange?.(nextValue);
    pendingValueRef.current = nextValue;
    fetcher.submit(
      { hideRecruitmentOpinions: nextValue },
      { action: "/api/account/recruitment-opinions", method: "post", encType: "application/json" },
    );
  };

  const canChange = () => {
    if (signedIn) return true;
    if (onSignedOutToggle) onSignedOutToggle();
    else showSignIn();
    return false;
  };

  const control = (
    <Toggle
      id={controlId}
      aria-label="모집 결과 숨기기"
      aria-describedby={descriptionId}
      initialState={value}
      disabled={fetcher.state !== "idle"}
      hitArea
      canChange={canChange}
      className={compact ? "my-0 shrink-0 [&_label]:sr-only" : "my-0 shrink-0"}
      onChange={handleChange}
    />
  );

  return (
    <div className={compact ? "space-y-1" : "space-y-3"}>
      <div
        className={
          compact
            ? "flex min-h-8 items-center gap-2 py-0 lg:min-h-7 lg:gap-1.5"
            : "flex min-h-11 items-center justify-between gap-4"
        }
      >
        <div className={compact ? "min-w-0 grow" : "min-w-0"}>
          <p className={compact ? "text-sm font-normal text-foreground/85" : "text-sm font-semibold"}>
            모집 결과 숨기기
          </p>
          <p
            id={descriptionId}
            className={
              compact ? "mt-0.5 truncate text-xs text-muted-foreground" : "mt-0.5 text-xs text-muted-foreground"
            }
          >
            모집 결과에 대한 의견글을 숨겨요.
          </p>
        </div>
        {control}
      </div>
      {fetcher.state !== "idle" ? (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          저장 중...
        </p>
      ) : null}
      {fetcher.state === "idle" && fetcher.data?.ok ? (
        <p role="status" aria-live="polite" className="text-xs text-emerald-600 dark:text-emerald-400">
          설정이 저장됐어요.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
