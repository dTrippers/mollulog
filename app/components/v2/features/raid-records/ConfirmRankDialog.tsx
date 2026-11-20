import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "../../primitives/Button";
import { Dialog } from "../../primitives/Dialog";
import { StatusNotice } from "../../primitives/StatusNotice";
import { DigitsInput } from "./DigitsInput";

export type ConfirmRankTarget = {
  uid: string;
  // "#87 그레고리오 · 한국 서버 · 잠정 3,457위"
  summary: string;
  rank: number;
};

export type ConfirmRankActionData = { ok: true; uid: string } | { ok: false; uid: string; error: string };

// "순위 확정하기": the 잠정 rank opens prefilled, and saving it makes it 확정.
export function ConfirmRankDialog({
  target,
  action,
  onClose,
}: {
  target: ConfirmRankTarget | null;
  action: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<ConfirmRankActionData>();
  const [rank, setRank] = useState<number | null>(target?.rank ?? null);
  const [touched, setTouched] = useState(false);
  const saving = fetcher.state !== "idle";
  const result = fetcher.data && fetcher.data.uid === target?.uid ? fetcher.data : null;

  useEffect(() => {
    setRank(target?.rank ?? null);
    setTouched(false);
  }, [target]);

  useEffect(() => {
    if (fetcher.state === "idle" && result?.ok) onClose();
  }, [fetcher.state, result, onClose]);

  const save = () => {
    setTouched(true);
    if (!target || rank === null) return;
    fetcher.submit({ intent: "confirm-rank", uid: target.uid, rank: String(rank) }, { method: "post", action });
  };

  return (
    <Dialog open={target !== null} onClose={onClose} title="순위 확정하기" size="sm">
      {target ? (
        <form
          className="flex flex-col gap-v2-block-gap"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="text-sm text-v2-fg-secondary tabular-nums">{target.summary}</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-rank-input" className="text-sm font-semibold text-v2-fg">
              확정 순위
            </label>
            <DigitsInput
              id="confirm-rank-input"
              value={rank}
              onValueChange={setRank}
              suffix="위"
              invalid={touched && rank === null}
              containerClassName="max-w-40"
            />
            {touched && rank === null ? (
              <p className="text-xs font-medium text-v2-danger">순위를 입력해 주세요.</p>
            ) : (
              <p className="text-xs text-v2-fg-tertiary">게임에서 확인한 순위와 같으면 그대로 저장해 주세요.</p>
            )}
          </div>
          {result && !result.ok ? <StatusNotice tone="danger">{result.error}</StatusNotice> : null}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>취소</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "저장 중…" : "확정 순위로 저장"}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
