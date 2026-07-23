import { ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { CalculatorIcon, ClockIcon } from "@heroicons/react/24/solid";
import type { ElementType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ContentSelectForm, FormGroup, InputForm, SelectForm } from "~/components/features/forms";
import { Page } from "~/components/features/layout";
import { SectionCard } from "~/components/primitives";
import {
  ALL_TOTAL_ASSUALT_BOSS,
  type Boss,
  type Difficulty,
  normalizeBossUid,
  scoreToDifficultyAndTime,
  timeToScore,
} from "~/domain/raid-score";
import { canonicalLink } from "~/lib/seo";
import { difficultyLocale } from "~/locales/ko";
import { getAllRaidSchedules } from "~/models/raid";

const STORAGE_KEY_TIME_TO_SCORE = "raid-score-util-timeToScore";
const STORAGE_KEY_SCORE_TO_TIME = "raid-score-util-scoreToTime";

type RaidScoreBossOption = {
  uid: Boss;
  name: string;
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const allRaids = await getAllRaidSchedules(env);
  const bossNameByUid = new Map(allRaids.map((raid) => [raid.raidBoss.uid, raid.raidBoss.name]));

  return {
    bossOptions: ALL_TOTAL_ASSUALT_BOSS.flatMap((boss) => {
      const name = bossNameByUid.get(boss);
      return name ? [{ uid: boss, name }] : [];
    }),
  };
};

export const meta: MetaFunction = ({ location }) => {
  const title = "총력전/대결전 점수 계산기 | 몰루로그";
  const description = "블루 아카이브 총력전/대결전 시간과 점수를 변환할 수 있어요";
  return [{ title }, { name: "description", content: description }, canonicalLink(location.pathname)];
};

export default function RaidScoreUtil() {
  const [mode, setMode] = useState<"timeToScore" | "scoreToTime">("timeToScore");
  const { bossOptions } = useLoaderData<typeof loader>();
  return (
    <Page
      title="총력전 점수 계산기"
      description="총력전/대결전 시간과 점수를 변환할 수 있어요"
      screens={[
        {
          text: "시간 → 점수",
          Icon: CalculatorIcon,
          active: mode === "timeToScore",
          onClick: () => setMode("timeToScore"),
        },
        {
          text: "점수 → 시간",
          Icon: ClockIcon,
          active: mode === "scoreToTime",
          onClick: () => setMode("scoreToTime"),
        },
      ]}
    >
      <div className="space-y-4 py-4">
        {mode === "timeToScore" && <TimeToScore bossOptions={bossOptions} />}
        {mode === "scoreToTime" && <ScoreToTime bossOptions={bossOptions} />}
      </div>
    </Page>
  );
}

function CalculatorForm({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">변환 조건</h2>
        <p className="mt-1 text-sm text-muted-foreground">계산에 사용할 값을 입력해주세요</p>
      </div>
      <FormGroup itemHover={false}>{children}</FormGroup>
    </section>
  );
}

function CalculationResult({ Icon, label, value }: { Icon: ElementType; label: string; value: string }) {
  return (
    <SectionCard className="flex flex-row items-center justify-between gap-4 space-y-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      </div>
      <p className="text-right text-xl font-bold text-foreground tabular-nums md:text-2xl">{value}</p>
    </SectionCard>
  );
}

function CalculationError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-4 text-destructive">
      <ExclamationCircleIcon className="size-5 shrink-0" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function TimeToScore({ bossOptions }: { bossOptions: RaidScoreBossOption[] }) {
  const [boss, setBoss] = useState<Boss | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [timeString, setTimeString] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);

  const isFirstRender = useRef(true);

  // Load saved values from localStorage on client side only (after hydration)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TIME_TO_SCORE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.boss) {
          const savedBoss = normalizeBossUid(parsed.boss);
          if (savedBoss) setBoss(savedBoss);
        }
        if (parsed.difficulty) setDifficulty(parsed.difficulty);
        if (parsed.timeString) setTimeString(parsed.timeString);
      }
    } catch (_error) {
      // Ignore localStorage errors
    }
  }, []);

  // Save values to localStorage when they change (skip first render to avoid overwriting with nulls)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY_TIME_TO_SCORE, JSON.stringify({ boss, difficulty, timeString }));
    } catch (_error) {
      // Ignore localStorage errors
    }
  }, [boss, difficulty, timeString]);

  useEffect(() => {
    if (!boss || !difficulty || !timeString) return;

    const time = timeString.match(/^(\d{1,2}):(\d{2})(\.\d{3})?$/);
    if (!time) {
      setCalculatedScore(null);
      return;
    }

    const minutes = Number.parseInt(time[1], 10);
    const seconds = Number.parseInt(time[2], 10);
    const milliseconds = time[3] ? Number.parseInt(time[3].slice(1), 10) : 0;
    try {
      const score = timeToScore(boss, difficulty, minutes * 60000 + seconds * 1000 + milliseconds);
      setCalculatedScore(score);
      setError(null);
    } catch (error) {
      setCalculatedScore(null);
      setError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했어요");
    }
  }, [boss, difficulty, timeString]);

  return (
    <div className="space-y-4">
      <CalculatorForm>
        <div key="boss" className="rounded-t-lg transition-colors hover:bg-muted">
          <ContentSelectForm
            label="대상 보스"
            name="boss"
            placeholder="보스를 선택하세요"
            searchPlaceholder="보스 이름으로 찾기..."
            contents={bossOptions.map((boss) => ({
              uid: boss.uid,
              name: boss.name,
              boss: boss.uid,
            }))}
            initialValue={boss ?? undefined}
            onSelect={(selectedBoss) => setBoss(selectedBoss as Boss)}
          />
        </div>
        <div className="grid md:grid-cols-2">
          <div className="transition-colors hover:bg-muted md:rounded-bl-lg">
            <SelectForm
              label="난이도"
              name="difficulty"
              placeholder="난이도를 선택하세요"
              options={["lunatic", "torment", "insane", "extreme", "hardcore", "very_hard", "hard", "normal"].map(
                (difficulty) => ({
                  label: difficultyLocale[difficulty as Difficulty],
                  value: difficulty,
                }),
              )}
              initialValue={difficulty ?? undefined}
              onSelect={(selectedDifficulty) => setDifficulty(selectedDifficulty as Difficulty)}
              valueClassName="mt-0 flex min-h-10 max-w-96 items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
              chevronInsideValue
            />
          </div>
          <div className="rounded-b-lg border-border border-t transition-colors hover:bg-muted md:rounded-bl-none md:border-t-0 md:border-l">
            <InputForm
              label="소요 시간"
              name="time"
              placeholder="예) 01:39.000"
              value={timeString ?? ""}
              onChange={setTimeString}
            />
          </div>
        </div>
      </CalculatorForm>

      {calculatedScore && (
        <CalculationResult Icon={CalculatorIcon} label="계산된 점수" value={calculatedScore.toLocaleString()} />
      )}
      {error && <CalculationError message={error} />}
    </div>
  );
}

function ScoreToTime({ bossOptions }: { bossOptions: RaidScoreBossOption[] }) {
  const [boss, setBoss] = useState<Boss | null>(null);
  const [scoreString, setScoreString] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [calculatedDifficulty, setCalculatedDifficulty] = useState<Difficulty | null>(null);
  const [calculatedTimeString, setCalculatedTimeString] = useState<string | null>(null);

  const isFirstRender = useRef(true);

  // Load saved values from localStorage on client side only (after hydration)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCORE_TO_TIME);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.boss) {
          const savedBoss = normalizeBossUid(parsed.boss);
          if (savedBoss) setBoss(savedBoss);
        }
        if (parsed.scoreString) setScoreString(parsed.scoreString);
      }
    } catch (_error) {
      // Ignore localStorage errors
    }
  }, []);

  // Save values to localStorage when they change (skip first render to avoid overwriting with nulls)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY_SCORE_TO_TIME, JSON.stringify({ boss, scoreString }));
    } catch (_error) {
      // Ignore localStorage errors
    }
  }, [boss, scoreString]);

  useEffect(() => {
    if (!boss || !scoreString) return;

    const score = Number.parseInt(scoreString.replace(/,/g, ""), 10);
    if (Number.isNaN(score)) {
      setCalculatedDifficulty(null);
      setCalculatedTimeString(null);
      return;
    }

    try {
      const { difficulty, clearTimeMillisec } = scoreToDifficultyAndTime(boss, score);

      const minute = Math.floor(clearTimeMillisec / 60000);
      const second = Math.floor((clearTimeMillisec % 60000) / 1000);
      const millisecond = clearTimeMillisec % 1000;
      setCalculatedDifficulty(difficulty);
      setCalculatedTimeString(
        `${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}.${millisecond.toString().padStart(3, "0")}`,
      );

      setError(null);
    } catch (error) {
      setCalculatedDifficulty(null);
      setCalculatedTimeString(null);
      setError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했어요");
    }
  }, [boss, scoreString]);

  return (
    <div className="space-y-4">
      <CalculatorForm>
        <div key="boss" className="rounded-t-lg transition-colors hover:bg-muted">
          <ContentSelectForm
            label="대상 보스"
            name="boss"
            placeholder="보스를 선택하세요"
            searchPlaceholder="보스 이름으로 찾기..."
            contents={bossOptions.map((boss) => ({
              uid: boss.uid,
              name: boss.name,
              boss: boss.uid,
            }))}
            initialValue={boss ?? undefined}
            onSelect={(selectedBoss) => setBoss(selectedBoss as Boss)}
          />
        </div>
        <div key="score" className="rounded-b-lg transition-colors hover:bg-muted">
          <InputForm
            label="점수"
            name="score"
            placeholder="점수를 입력하세요"
            value={scoreString ?? ""}
            onChange={setScoreString}
          />
        </div>
      </CalculatorForm>

      {calculatedDifficulty && calculatedTimeString && (
        <CalculationResult
          Icon={ClockIcon}
          label="계산 결과"
          value={`${difficultyLocale[calculatedDifficulty]} / ${calculatedTimeString}`}
        />
      )}
      {error && <CalculationError message={error} />}
    </div>
  );
}
