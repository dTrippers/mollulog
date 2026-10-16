import { Switch } from "../../primitives/Switch";

// The saved opinion setting as the filter panel shows it. The route owns the save (see
// app/routes/futures._components/recruitment-opinion-setting.ts), so a save survives the panel moving between the aside
// and the stacked sheet.
export type RecruitmentOpinionSettingView = {
  // The value the switch shows: the requested value while a save is in flight, otherwise the last saved value.
  value: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  toggle: (next: boolean) => void;
};

// 모집 결과 숨기기 switch for the filter panel.
export function RecruitmentOpinionToggle({ id, setting }: { id: string; setting: RecruitmentOpinionSettingView }) {
  return (
    <div className="space-y-1">
      <Switch
        id={id}
        label="모집 결과 숨기기"
        description="모집 결과에 대한 의견글을 숨겨요."
        checked={setting.value}
        disabled={setting.saving}
        onCheckedChange={setting.toggle}
      />
      {setting.saving ? (
        <p role="status" aria-live="polite" className="text-xs text-v2-fg-tertiary">
          저장 중...
        </p>
      ) : null}
      {!setting.saving && setting.saved ? (
        <p role="status" aria-live="polite" className="text-xs text-v2-success">
          설정이 저장됐어요.
        </p>
      ) : null}
      {setting.error ? (
        <p role="alert" className="text-xs text-v2-danger">
          {setting.error}
        </p>
      ) : null}
    </div>
  );
}
