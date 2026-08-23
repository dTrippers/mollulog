#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 [--preflight-only]" >&2
}

preflight_only=false
case "${1:-}" in
  "") ;;
  --preflight-only) preflight_only=true ;;
  *)
    usage
    exit 2
    ;;
esac

if [[ $# -gt 1 ]]; then
  usage
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

assert_deployable_git_state() {
  local expected_commit="$1"
  local current_branch
  local current_commit
  local working_tree_status

  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != "main" ]]; then
    echo "Production deploys must run from the main branch (current: ${current_branch:-detached HEAD})." >&2
    exit 1
  fi

  current_commit="$(git rev-parse HEAD)"
  if [[ "$current_commit" != "$expected_commit" ]]; then
    echo "HEAD changed during the production build. Run the deploy again from a stable commit." >&2
    exit 1
  fi

  working_tree_status="$(git status --porcelain --untracked-files=all)"
  if [[ -n "$working_tree_status" ]]; then
    echo "Production deploys require a clean working tree. Commit, stash, or remove these changes:" >&2
    printf '%s\n' "$working_tree_status" >&2
    exit 1
  fi
}

commit_sha="$(git rev-parse HEAD)"
short_commit_sha="$(git rev-parse --short=12 HEAD)"

assert_deployable_git_state "$commit_sha"

echo "Production preflight passed for main@${short_commit_sha}."
if [[ "$preflight_only" == true ]]; then
  exit 0
fi

pnpm run prod:build

# The build must not change tracked or untracked source state, and HEAD must
# still be the exact commit that passed the migration preflight.
assert_deployable_git_state "$commit_sha"

deployment_message="git:${commit_sha}"
pnpm exec wrangler deploy --message "$deployment_message"
pnpm exec wrangler deploy --config dist/cron/wrangler.json --message "$deployment_message"
