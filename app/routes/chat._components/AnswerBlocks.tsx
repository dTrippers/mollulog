import StudentPortrait from "~/components/v2/features/students/StudentPortrait";
import type { AnswerBlock } from "~/models/al1s-question-contract";
import { Fragment } from "react";

const colors = ["bg-v2-fg", "bg-v2-accent", "bg-v2-fg-tertiary"];
type ChartUnit = "percent" | "fraction" | "count" | "none";

function percentValue(unit: "percent" | "fraction", value: number) {
  return unit === "fraction" ? value * 100 : value;
}

function valueFormatter(unit: ChartUnit, values: Array<number | null>) {
  const percentages = values.filter((value): value is number => value !== null).map((value) => unit === "fraction" ? value * 100 : value);
  const decimal = percentages.some((value) => Math.round(value * 10) % 10 !== 0);
  return (value: number | null) => {
    if (value === null) return "–";
    if (unit === "percent" || unit === "fraction") {
      const percentage = percentValue(unit, value);
      if (percentage > 0 && percentage < 0.1) return "<0.1%";
      return `${decimal ? percentage.toFixed(1) : Math.round(percentage)}%`;
    }
    return unit === "count" ? value.toLocaleString("ko-KR") : String(value);
  };
}

function AnswerBarChart({ block }: { block: Extract<AnswerBlock, { type: "bar_chart" }> }) {
  const max = Math.max(0, ...block.series.flatMap((series) => series.values.filter((value): value is number => value !== null)));
  const percent = block.unit === "percent" || block.unit === "fraction";
  const allValues = block.series.flatMap((series) => series.values);
  const format = valueFormatter(block.unit, allValues);
  const scale = (value: number) => percent ? percentValue(block.unit as "percent" | "fraction", value) : max > 0 ? value / max * 100 : 0;
  const seriesCount = block.series.length;
  return (
    <figure className="my-5 max-w-md">
      <figcaption className="text-sm font-medium leading-5 text-v2-fg">{block.title}</figcaption>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-v2-fg-secondary">
        {block.series.map((series, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: source IDs may repeat; the series position keeps each legend item distinct.
            key={`${series.sourceId}:${index}`}
            className="inline-flex min-w-0 items-center gap-1.5"
          >
            {seriesCount > 1 ? <span aria-hidden="true" className={`size-2 shrink-0 rounded-sm ${colors[index]}`} /> : null}
            {series.subject?.type === "student" ? <StudentPortrait uid={series.subject.uid} className="size-5 shrink-0 rounded-full object-cover" /> : null}
            <span>{series.name}</span>
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="mt-2.5 grid grid-cols-[fit-content(6rem)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
        {block.categories.map((category, categoryIndex) => block.series.map((series, seriesIndex) => {
          const value = series.values[categoryIndex] ?? null;
          const row = categoryIndex * seriesCount + seriesIndex + 1;
          const groupClass = categoryIndex > 0 && seriesIndex === 0 ? "mt-1.5" : "";
          return <Fragment
            // biome-ignore lint/suspicious/noArrayIndexKey: source IDs may repeat; the series position keeps each chart row distinct.
            key={`${series.sourceId}:${category}:${seriesIndex}`}
          >
            {seriesIndex === 0 ? <span key={`cat:${category}`} className={`col-start-1 break-keep text-xs leading-4 text-v2-fg-secondary [overflow-wrap:anywhere] ${groupClass}`} style={{ gridRow: `${categoryIndex * seriesCount + 1} / span ${seriesCount}` }}>{category}</span> : null}
            <span className={`col-start-2 flex h-4 min-w-0 items-center ${groupClass}`} style={{ gridRow: row }}><span className={`h-2 w-full rounded-full ${percent ? "bg-v2-inset" : ""}`}><span className={`block h-2 rounded-full ${value !== null && value > 0 ? "min-w-[2px]" : ""} ${colors[seriesIndex]}`} style={{ width: `${Math.max(0, Math.min(100, scale(value ?? 0)))}%` }} /></span></span>
            <span className={`col-start-3 min-w-10 whitespace-nowrap text-right text-xs leading-4 tabular-nums text-v2-fg ${value === null ? "text-v2-fg-tertiary" : ""} ${groupClass}`} style={{ gridRow: row }}>{format(value)}</span>
          </Fragment>;
        }))}
      </div>
      <table className="sr-only">
        <caption>{block.title}</caption>
        <thead><tr><th scope="col">항목</th>{block.series.map((series, index) => <th
          scope="col"
          // biome-ignore lint/suspicious/noArrayIndexKey: source IDs may repeat; the series position keeps each column distinct.
          key={`${series.sourceId}:${index}`}
        >{series.name}</th>)}</tr></thead>
        <tbody>{block.categories.map((category, index) => <tr key={category}><th scope="row">{category}</th>{block.series.map((series, seriesIndex) => <td
          // biome-ignore lint/suspicious/noArrayIndexKey: source IDs may repeat; the series position keeps each cell distinct.
          key={`${series.sourceId}:${seriesIndex}`}
        >{format(series.values[index] ?? null)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

export function AnswerBlocks({ blocks }: { blocks: AnswerBlock[] }) {
  if (blocks.length === 1 && blocks[0]?.type === "plaintext") {
    return <p className="mt-3 whitespace-pre-wrap break-keep text-base leading-7 text-v2-fg">{blocks[0].text}</p>;
  }
  return <div className="mt-3 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
    {blocks.map((block, index) => block.type === "bar_chart" ? (
      <AnswerBarChart
        // biome-ignore lint/suspicious/noArrayIndexKey: answer blocks must retain source order and may repeat identical content.
        key={index}
        block={block}
      />
    ) : block.type === "markdown" ? (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: answer blocks must retain source order and may repeat identical content.
        key={index}
        className="my-3 break-keep text-base leading-7 text-v2-fg [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li::marker]:text-v2-fg-tertiary [&_li::marker]:tabular-nums [&_strong]:font-semibold"
      >
        {block.html === undefined ? block.text : (
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: chat markdown HTML is sanitized with the approved tag allowlist before rendering.
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        )}
      </div>
    ) : null)}
  </div>;
}
