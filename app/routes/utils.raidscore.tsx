import { Bars3Icon, ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { CalculatorIcon, ClockIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import type { MetaFunction } from "react-router";
import { Title } from "~/components/atoms/typography";
import { FilterButtons } from "~/components/molecules/content";
import { InputForm, SelectForm } from "~/components/molecules/form";
import ContentSelectForm from "~/components/molecules/form/ContentSelectForm";
import { FormGroup } from "~/components/organisms/form";
import { bossName, difficultyLocale } from "~/locales/ko";
import { ALL_TOTAL_ASSUALT_BOSS, type Boss, type Difficulty, scoreToDifficultyAndTime, timeToScore } from "~/models/raid";

const STORAGE_KEY_TIME_TO_SCORE = "raid-score-util-timeToScore";
const STORAGE_KEY_SCORE_TO_TIME = "raid-score-util-scoreToTime";

export const meta: MetaFunction = () => {
  const title = "총력전/대결전 점수 계산기 | 몰루로그";
  const description = "블루 아카이브 총력전/대결전 시간과 점수를 변환할 수 있어요";
  return [
    { title },
    { name: "description", content: description },
  ];
};

export default function RaidScoreUtil() {
  const [mode, setMode] = useState<"timeToScore" | "scoreToTime">("timeToScore");
  return (
    <>
      <Title text="총력전 점수 계산기" description="총력전/대결전 시간과 점수를 변환할 수 있어요" />
      <FilterButtons
        Icon={Bars3Icon}
        buttonProps={[
          { text: "시간 → 점수", active: mode === "timeToScore", onToggle: () => setMode("timeToScore") },
          { text: "점수 → 시간", active: mode === "scoreToTime", onToggle: () => setMode("scoreToTime") },
        ]}
        exclusive
        atLeastOne
      />

      {mode === "timeToScore" && <TimeToScore />}
      {mode === "scoreToTime" && <ScoreToTime />}
    </>
  )
};

function TimeToScore() {
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
        if (parsed.boss) setBoss(parsed.boss);
        if (parsed.difficulty) setDifficulty(parsed.difficulty);
        if (parsed.timeString) setTimeString(parsed.timeString);
      }
    } catch (error) {
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
    } catch (error) {
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

    const minutes = Number.parseInt(time[1]);
    const seconds = Number.parseInt(time[2]);
    const milliseconds = time[3] ? Number.parseInt(time[3].slice(1)) : 0;
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
    <div className="my-8">
      <FormGroup>
        <ContentSelectForm
          label="대상 보스"
          name="boss"
          placeholder="보스를 선택하세요"
          searchPlaceholder="보스 이름으로 찾기..."
          contents={ALL_TOTAL_ASSUALT_BOSS.map((boss) => ({
            uid: boss,
            name: bossName[boss],
            boss: boss,
          }))}
          initialValue={boss ?? undefined}
          onSelect={(selectedBoss) => setBoss(selectedBoss as Boss)}
        />
        <SelectForm
          label="난이도"
          name="difficulty"
          placeholder="난이도를 선택하세요"
          options={["lunatic", "torment", "insane", "extreme", "hardcore", "veryhard", "hard", "normal"].map((difficulty) => ({
            label: difficultyLocale[difficulty as Difficulty],
            value: difficulty,
          }))}
          initialValue={difficulty ?? undefined}
          onSelect={(selectedDifficulty) => setDifficulty(selectedDifficulty as Difficulty)}
        />
        <InputForm
          label="소요 시간"
          name="time"
          placeholder="예) 01:39.000"
          defaultValue={timeString ?? undefined}
          onChange={setTimeString}
        />
      </FormGroup>

      {calculatedScore && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-teal-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center justify-between">
            <CalculatorIcon className="size-6 text-green-600 dark:text-green-400 mr-2" />
            <h3 className="grow text-lg font-semibold text-green-800 dark:text-green-200">계산된 점수</h3>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">
              {calculatedScore.toLocaleString()}
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 flex items-center gap-x-2 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 border border-red-200 dark:border-red-800 rounded-lg">
          <ExclamationCircleIcon className="size-4 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}

function ScoreToTime() {
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
        if (parsed.boss) setBoss(parsed.boss);
        if (parsed.scoreString) setScoreString(parsed.scoreString);
      }
    } catch (error) {
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
    } catch (error) {
      // Ignore localStorage errors
    }
  }, [boss, scoreString]);

  useEffect(() => {
    if (!boss || !scoreString) return;

    const score = Number.parseInt(scoreString.replace(/,/g, ""));
    if (isNaN(score)) {
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
      setCalculatedTimeString(`${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}.${millisecond.toString().padStart(3, "0")}`);

      setError(null);
    } catch (error) {
      setCalculatedDifficulty(null);
      setCalculatedTimeString(null);
      setError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했어요");
    }
  }, [boss, scoreString]);

  return (
    <div className="my-8">
      <FormGroup>
        <ContentSelectForm
          label="대상 보스"
          name="boss"
          placeholder="보스를 선택하세요"
          searchPlaceholder="보스 이름으로 찾기..."
          contents={ALL_TOTAL_ASSUALT_BOSS.map((boss) => ({
            uid: boss,
            name: bossName[boss],
            boss: boss,
          }))}
          initialValue={boss ?? undefined}
          onSelect={(selectedBoss) => setBoss(selectedBoss as Boss)}
        />
        <InputForm
          label="점수"
          name="score"
          placeholder="점수를 입력하세요"
          defaultValue={scoreString ?? undefined}
          onChange={setScoreString}
        />
      </FormGroup>

      {calculatedDifficulty && calculatedTimeString && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-teal-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center justify-between">
            <ClockIcon className="size-6 text-green-600 dark:text-green-400 mr-2" />
            <h3 className="grow text-lg font-semibold text-green-800 dark:text-green-200">계산 결과</h3>
            <div className="text-xl font-bold text-green-700 dark:text-green-300">
              {difficultyLocale[calculatedDifficulty]} / {calculatedTimeString}
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 flex items-center gap-x-2 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 border border-red-200 dark:border-red-800 rounded-lg">
          <ExclamationCircleIcon className="size-4 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}
