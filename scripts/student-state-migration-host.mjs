/** Remote migration connections require an explicit match with the selected PGHOST. */
export function assertMigrationHost(host, confirmedHost) {
  if (typeof host !== "string" || host.trim() === "") {
    throw new Error("Set PGHOST explicitly before running student-state migration tooling.");
  }
  if (confirmedHost != null && confirmedHost !== host) {
    throw new Error("--confirm-db-host must exactly match the selected PGHOST.");
  }
  if (host !== "127.0.0.1" && confirmedHost !== host) {
    throw new Error("Remote student-state migration requires --confirm-db-host <PGHOST> after verifying the target database.");
  }
}
