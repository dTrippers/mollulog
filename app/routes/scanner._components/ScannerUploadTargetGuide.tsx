import { cn } from "~/lib/utils";

type ScannerUploadTargetGuideProps = {
  target: "item" | "student";
  className?: string;
};

const ITEM_CELL_COUNT = 20;
const STUDENT_SKILL_COUNT = 4;

export default function ScannerUploadTargetGuide({ target, className }: ScannerUploadTargetGuideProps) {
  return (
    <div className={cn("w-full max-w-xl", className)}>
      {target === "item" ? <ItemInventoryGuide /> : <StudentDetailGuide />}
    </div>
  );
}

function ItemInventoryGuide() {
  return (
    <svg
      viewBox="0 0 640 360"
      className="block aspect-video w-full rounded-md border border-border/80 bg-muted/30 text-muted-foreground"
      aria-hidden="true"
    >
      <rect width="640" height="360" rx="8" fill="currentColor" opacity="0.05" />
      <path d="M0 43h640v317H0z" fill="currentColor" opacity="0.04" />
      <path d="M0 43h315v317H0z" fill="currentColor" opacity="0.025" />

      <TopNavigation titleWidth={68} />

      <rect x="130" y="126" width="56" height="56" rx="18" fill="currentColor" opacity="0.28" />
      <rect x="48" y="270" width="220" height="42" rx="5" fill="currentColor" opacity="0.38" />
      <rect x="102" y="287" width="112" height="8" rx="4" fill="currentColor" opacity="0.68" />

      <rect x="322" y="66" width="299" height="277" rx="6" fill="currentColor" opacity="0.15" />
      <rect x="334" y="79" width="63" height="11" rx="5.5" fill="currentColor" opacity="0.5" />
      <path d="M456 75h105l-5 29H451l5-29Z" fill="currentColor" opacity="0.16" />
      <rect x="474" y="86" width="59" height="7" rx="3.5" fill="currentColor" opacity="0.34" />
      <path d="M570 75h37v29h-42l5-29Z" fill="currentColor" opacity="0.22" />
      <rect x="332" y="109" width="278" height="222" rx="5" fill="currentColor" opacity="0.12" />

      {Array.from({ length: ITEM_CELL_COUNT }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        const x = 343 + column * 53;
        const y = 118 + row * 50;
        return (
          <g key={`${column}-${row}`} transform={`translate(${x} ${y})`}>
            <rect width="44" height="42" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="14" y="7" width="18" height="18" rx="5" fill="currentColor" opacity="0.38" />
            <rect x="20" y="31" width="17" height="5" rx="2.5" fill="currentColor" opacity="0.52" />
          </g>
        );
      })}
    </svg>
  );
}

function StudentDetailGuide() {
  return (
    <svg
      viewBox="0 0 640 360"
      className="block aspect-video w-full rounded-md border border-border/80 bg-muted/30 text-muted-foreground"
      aria-hidden="true"
    >
      <rect width="640" height="360" rx="8" fill="currentColor" opacity="0.05" />
      <TopNavigation titleWidth={58} />

      <circle cx="163" cy="116" r="31" fill="currentColor" opacity="0.28" />
      <path d="M92 267c7-76 33-123 71-123s64 47 71 123H92Z" fill="currentColor" opacity="0.23" />

      <rect x="24" y="285" width="278" height="48" rx="4" fill="currentColor" opacity="0.43" />
      <circle cx="42" cy="304" r="10" fill="currentColor" opacity="0.58" />
      <rect x="59" y="299" width="108" height="10" rx="5" fill="currentColor" opacity="0.7" />
      <rect x="235" y="299" width="42" height="10" rx="5" fill="currentColor" opacity="0.5" />
      <rect x="24" y="339" width="90" height="14" rx="4" fill="currentColor" opacity="0.16" />
      <rect x="118" y="339" width="90" height="14" rx="4" fill="currentColor" opacity="0.22" />
      <rect x="212" y="339" width="90" height="14" rx="4" fill="currentColor" opacity="0.16" />

      <rect
        x="326"
        y="77"
        width="281"
        height="258"
        rx="5"
        fill="currentColor"
        opacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="326" y="77" width="94" height="38" rx="4" fill="currentColor" opacity="0.18" />
      <rect x="351" y="93" width="45" height="8" rx="4" fill="currentColor" opacity="0.52" />
      <rect x="420" y="77" width="93" height="38" fill="currentColor" opacity="0.29" />
      <rect x="444" y="93" width="45" height="8" rx="4" fill="currentColor" opacity="0.58" />
      <rect x="513" y="77" width="94" height="38" rx="4" fill="currentColor" opacity="0.29" />
      <rect x="537" y="93" width="45" height="8" rx="4" fill="currentColor" opacity="0.58" />

      <rect x="339" y="124" width="256" height="48" rx="4" fill="currentColor" opacity="0.12" />
      <rect x="349" y="132" width="42" height="7" rx="3.5" fill="currentColor" opacity="0.45" />
      <rect x="349" y="148" width="74" height="5" rx="2.5" fill="currentColor" opacity="0.34" />
      <rect x="449" y="148" width="74" height="5" rx="2.5" fill="currentColor" opacity="0.34" />
      <rect x="349" y="159" width="74" height="5" rx="2.5" fill="currentColor" opacity="0.34" />
      <rect x="449" y="159" width="74" height="5" rx="2.5" fill="currentColor" opacity="0.34" />
      <rect x="547" y="132" width="48" height="32" rx="4" fill="currentColor" opacity="0.3" />

      {Array.from({ length: STUDENT_SKILL_COUNT }, (_, index) => {
        const x = 339 + index * 52;
        return (
          <g key={`skill-${x}`} transform={`translate(${x} 181)`}>
            <rect width="48" height="49" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="15" y="9" width="19" height="19" rx="5" fill="currentColor" opacity="0.42" />
            <rect x="14" y="36" width="20" height="5" rx="2.5" fill="currentColor" opacity="0.4" />
          </g>
        );
      })}
      <rect x="547" y="181" width="48" height="49" rx="4" fill="currentColor" opacity="0.32" />
      <rect x="557" y="200" width="28" height="8" rx="4" fill="currentColor" opacity="0.5" />

      <rect x="339" y="241" width="48" height="37" rx="4" fill="currentColor" opacity="0.14" />
      <rect x="354" y="250" width="18" height="18" rx="5" fill="currentColor" opacity="0.36" />
      <rect x="391" y="241" width="152" height="37" rx="4" fill="currentColor" opacity="0.37" />
      <rect x="429" y="257" width="76" height="6" rx="3" fill="currentColor" opacity="0.55" />
      <rect x="547" y="241" width="48" height="37" rx="4" fill="currentColor" opacity="0.18" />

      <rect x="339" y="287" width="48" height="37" rx="4" fill="currentColor" opacity="0.15" />
      <rect x="391" y="287" width="48" height="37" rx="4" fill="currentColor" opacity="0.15" />
      <rect x="443" y="287" width="48" height="37" rx="4" fill="currentColor" opacity="0.15" />
      <rect x="495" y="287" width="48" height="37" rx="4" fill="currentColor" opacity="0.22" />
      <rect x="547" y="287" width="48" height="37" rx="4" fill="currentColor" opacity="0.32" />

      <path
        d="m35 177-13 13 13 13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
        opacity="0.55"
      />
      <path
        d="m606 177 13 13-13 13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
        opacity="0.55"
      />
    </svg>
  );
}

function TopNavigation({ titleWidth }: { titleWidth: number }) {
  return (
    <>
      <rect width="640" height="43" fill="currentColor" opacity="0.08" />
      <circle cx="35" cy="35" r="25" fill="currentColor" opacity="0.62" />
      <path
        d="m42 25-10 10 10 10M32 35h19"
        fill="none"
        stroke="var(--color-primary-foreground)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
        opacity="0.85"
        transform="translate(-5 0)"
      />
      <rect x="68" y="17" width={titleWidth} height="12" rx="6" fill="currentColor" opacity="0.48" />
      <rect x="345" y="17" width="54" height="10" rx="5" fill="currentColor" opacity="0.3" />
      <rect x="425" y="17" width="72" height="10" rx="5" fill="currentColor" opacity="0.3" />
      <rect x="523" y="17" width="44" height="10" rx="5" fill="currentColor" opacity="0.3" />
      <circle cx="590" cy="22" r="9" fill="currentColor" opacity="0.42" />
      <path d="M611 32V19l10-7 10 7v13h-7v-8h-6v8h-7Z" fill="currentColor" opacity="0.42" />
    </>
  );
}
