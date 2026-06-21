export function collectedSourceKeyForEventReward(eventUid: string): string {
  return `event_reward:${eventUid}`;
}

export function collectedSourceKeyForRaid(raidUid: string): string {
  return `raid:${raidUid}`;
}
