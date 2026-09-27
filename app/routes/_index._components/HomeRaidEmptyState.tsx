export default function HomeRaidEmptyState({ message }: { message: string }) {
  return (
    <div className="flex aspect-3/1 items-center rounded-lg bg-card p-4 shadow-sm shadow-black/5 dark:shadow-sm dark:shadow-black/20">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
