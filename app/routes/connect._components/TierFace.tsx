/** A tier as the connect screens show it: "★n" up to 5, then the exclusive weapon icon with its level. */
export function TierFace({ tier }: { tier: number }) {
  if (tier <= 5) {
    return (
      <span role="img" aria-label={`${tier}성`}>
        ★{tier}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`고유무기 ${tier - 5}`}>
      <img className="size-3 shrink-0" src="/icons/exclusive_weapon.png" alt="" aria-hidden="true" />
      <span aria-hidden="true">{tier - 5}</span>
    </span>
  );
}
