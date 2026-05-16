export function bossImageUrl(boss: string): string {
  return `https://assets.mollulog.net/assets/images/boss/${boss}`;
}

export function bossBannerUrl(boss: string): string {
  return `https://assets.mollulog.net/assets/images/boss-banner/${boss}`;
}

export function studentImageUrl(uid: string): string {
  if (uid === "unlisted") {
    return "https://assets.mollulog.net/assets/images/students/-1";
  }
  return `https://assets.baql.net/images/students/collection/${uid}.webp`;
}

export function studentStandingImageUrl(uid: string): string {
  return `https://assets.baql.net/images/students/standing/${uid}.webp`;
}

export function itemImageUrl(item: string): string {
  return `https://assets.mollulog.net/images/items/${item}`;
}
