import type { Attack, Defense } from "~/graphql/graphql";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  roleColor,
  roleLocale,
} from "~/locales/ko";
import type { Role } from "~/models/content.d";

type AttributeColor = "red" | "yellow" | "green" | "blue" | "purple" | "grey";

// Attribute text is always present next to its stripe, so the color only adds emphasis.
function Stripe({ color, text }: { color: AttributeColor; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden="true" className={`h-3 w-0.5 shrink-0 rounded-full bg-v2-attr-${color}`} />
      <span>{text}</span>
    </span>
  );
}

// Attack, defense, and role of a student or raid. Items are spaced apart, with no divider.
export function AttributeStripes({
  attackType,
  defenseType,
  role,
  className,
}: {
  attackType?: Attack | null;
  defenseType?: Defense | null;
  role?: Role | null;
  className?: string;
}) {
  const items: { key: string; color: AttributeColor; text: string }[] = [];
  if (attackType) {
    items.push({ key: "attack", color: attackTypeColor[attackType], text: attackTypeLocale[attackType] });
  }
  if (defenseType) {
    items.push({ key: "defense", color: defenseTypeColor[defenseType], text: defenseTypeLocale[defenseType] });
  }
  if (role) {
    items.push({ key: "role", color: roleColor[role], text: roleLocale[role] });
  }
  if (items.length === 0) {
    return null;
  }
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-v2-fg-secondary ${className ?? ""}`}>
      {items.map((item) => (
        <Stripe key={item.key} color={item.color} text={item.text} />
      ))}
    </p>
  );
}
